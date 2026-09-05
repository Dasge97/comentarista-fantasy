import fs from 'node:fs';
import path from 'node:path';

// Node 22 carga el fichero .env sin librería externa.
// Si no existe, se usan las variables de entorno del sistema, que es
// lo que ocurre en el servidor: los secretos los pone Docker Compose.
try {
  process.loadEnvFile('.env');
} catch {
  // Sin fichero .env. No es un error.
}

function obligatoria(nombre) {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}. Mira .env.example.`);
  }
  return valor;
}

const datosDir = path.resolve(process.env.DATOS_DIR || './data');
fs.mkdirSync(datosDir, { recursive: true });

export const config = {
  fantasy: {
    get email() {
      return obligatoria('FANTASY_EMAIL');
    },
    get password() {
      return obligatoria('FANTASY_PASSWORD');
    },
    competicionId: process.env.FANTASY_COMPETICION_ID || '1',
    ligaId: process.env.FANTASY_LIGA_ID || null,
    managerServicio: process.env.FANTASY_MANAGER_SERVICIO || null,
  },
  datosDir,
  ficheroSesion: path.join(datosDir, 'sesion.json'),
};
