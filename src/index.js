import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { abrirBaseDeDatos } from './db/db.js';
import { Almacen } from './db/almacen.js';
import { Usuarios } from './db/usuarios.js';
import { Configuracion, resumirContrasena } from './db/configuracion.js';
import { Telegram } from './telegram/telegram.js';
import { BotTelegram } from './telegram/bot.js';
import { Redactor } from './redactor/redactor.js';
import { Servicio } from './nucleo/servicio.js';
import { crearServidor } from './api/servidor.js';

// Node 22 lee el fichero .env sin librería. En el servidor no existe: los
// secretos los pone Docker Compose como variables de entorno.
try {
  process.loadEnvFile('.env');
} catch {
  // Sin fichero .env. No es un error.
}

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datosDir = path.resolve(process.env.DATOS_DIR || path.join(raiz, 'data'));
fs.mkdirSync(datosDir, { recursive: true });

const db = abrirBaseDeDatos(datosDir);
const almacen = new Almacen(db);
const usuarios = new Usuarios(db);
const config = new Configuracion(db, datosDir);

// La primera vez, los ajustes se rellenan con las variables de entorno.
// A partir de ahí mandan los valores guardados, que se editan desde la web.
config.sembrar({
  fantasy_email: process.env.FANTASY_EMAIL,
  fantasy_password: process.env.FANTASY_PASSWORD,
  liga_id: process.env.FANTASY_LIGA_ID,
  manager_servicio: process.env.FANTASY_MANAGER_SERVICIO,
  telegram_token: process.env.TELEGRAM_TOKEN,
  telegram_grupo: process.env.TELEGRAM_GRUPO,
  anthropic_api_key: process.env.ANTHROPIC_API_KEY,
  url_publica: process.env.URL_PUBLICA,
});

// Contraseña del administrador. Se toma de la variable de entorno solo si
// todavía no hay ninguna guardada; después se cambia desde la web.
if (!config.obtener('admin_password_hash')) {
  const inicial = process.env.ADMIN_PASSWORD;
  if (inicial) {
    config.poner('admin_password_hash', resumirContrasena(inicial));
    console.log('Contraseña del administrador tomada de la variable de entorno ADMIN_PASSWORD.');
  } else {
    console.warn('AVISO: no hay contraseña de administrador. Define ADMIN_PASSWORD y reinicia.');
  }
}
usuarios.asegurarAdministrador();

const telegram = new Telegram(config.obtener('telegram_token'));
const redactor = new Redactor();
const servicio = new Servicio({
  almacen,
  usuarios,
  config,
  telegram,
  redactor,
  ficheroSesion: path.join(datosDir, 'sesion.json'),
});

const bot = new BotTelegram({
  telegram,
  almacen,
  usuarios,
  config,
  registrar: (nivel, origen, mensaje) => almacen.anotarIncidencia(nivel, origen, mensaje),
});

const directorioWeb = path.join(raiz, 'web', 'dist');
const app = crearServidor({ almacen, usuarios, config, servicio, telegram, directorioWeb });

const puerto = Number(process.env.PORT || 3000);
const servidor = app.listen(puerto, () => {
  console.log(`Web y API escuchando en el puerto ${puerto}`);
  if (!fs.existsSync(directorioWeb)) {
    console.warn(`AVISO: no encuentro la web compilada en ${directorioWeb}. Solo responde la API.`);
  }
});

servicio.arrancar();
bot.escuchar(() => servicio.vivo);

// Apagado ordenado: se deja de sondear, se cierra el servidor y se cierra
// la base de datos para no dejar el fichero a medias.
let apagando = false;
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    if (apagando) return;
    apagando = true;
    console.log(`Recibida ${senal}, cerrando.`);
    servicio.parar();
    servidor.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
  });
}

process.on('unhandledRejection', (motivo) => {
  almacen.anotarIncidencia('error', 'proceso', `Promesa sin capturar: ${motivo}`);
});
