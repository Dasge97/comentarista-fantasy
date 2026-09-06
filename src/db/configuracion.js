import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ahora } from './db.js';

/**
 * Ajustes del bot, editables desde la web.
 *
 * Los valores marcados como secreto se guardan cifrados. La web permite
 * cambiarlos pero nunca leerlos: al consultarlos devuelve si están puestos
 * o no, no su contenido.
 */

// Cada ajuste con su valor de partida y si es secreto.
export const AJUSTES = {
  // Claves. Se rellenan desde el panel de administración.
  telegram_token: { defecto: '', secreto: true, titulo: 'Token del bot de Telegram' },
  telegram_grupo: { defecto: '', secreto: false, titulo: 'Identificador del grupo de Telegram' },
  // Quién escribe los comentarios del grupo. Las claves de los dos
  // proveedores se guardan por separado, para poder cambiar de uno a otro
  // sin tener que volver a escribirlas.
  proveedor_modelo: { defecto: 'anthropic', secreto: false, titulo: 'Proveedor del modelo: anthropic u openai' },

  anthropic_api_key: { defecto: '', secreto: true, titulo: 'Clave de Anthropic' },
  anthropic_base_url: { defecto: '', secreto: false, titulo: 'Dirección base de Anthropic, si no es la oficial' },
  anthropic_modelo: { defecto: 'claude-opus-5', secreto: false, titulo: 'Modelo de Anthropic' },

  openai_api_key: { defecto: '', secreto: true, titulo: 'Clave de OpenAI' },
  openai_base_url: { defecto: '', secreto: false, titulo: 'Dirección base de OpenAI, si no es la oficial' },
  openai_modelo: { defecto: '', secreto: false, titulo: 'Modelo de OpenAI' },
  fantasy_email: { defecto: '', secreto: false, titulo: 'Correo de la cuenta de servicio' },
  fantasy_password: { defecto: '', secreto: true, titulo: 'Contraseña de la cuenta de servicio' },

  // Dirección pública de la web. Se usa en los enlaces que reparte el bot.
  url_publica: { defecto: 'https://fantasybot.code-hive.space', secreto: false, titulo: 'Dirección pública de la web' },

  // Liga.
  liga_id: { defecto: '', secreto: false, titulo: 'Identificador de la liga' },
  manager_servicio: { defecto: '', secreto: false, titulo: 'Manager de la cuenta de servicio' },

  // Ritmo de lectura.
  segundos_entre_lecturas: { defecto: '60', secreto: false, titulo: 'Segundos entre lecturas con partido en juego' },
  segundos_en_reposo: { defecto: '3600', secreto: false, titulo: 'Segundos entre lecturas sin partidos' },
  minutos_estabilizacion: { defecto: '15', secreto: false, titulo: 'Minutos de espera tras el final del partido' },
  minutos_antes_del_partido: { defecto: '5', secreto: false, titulo: 'Minutos de antelación para empezar a sondear' },

  // Publicación.
  lecturas_para_confirmar: { defecto: '3', secreto: false, titulo: 'Lecturas seguidas para confirmar un cambio de puesto' },
  publicar_privados: { defecto: '1', secreto: false, titulo: 'Enviar hechos por privado' },
  publicar_grupo: { defecto: '1', secreto: false, titulo: 'Publicar comentarios en el grupo' },
  silenciado: { defecto: '0', secreto: false, titulo: 'Silenciar el bot por completo' },
  tono: {
    defecto: 'Comentarista de la liga entre amigos. Pique amistoso, nunca ofensivo. Frases cortas.',
    secreto: false,
    titulo: 'Tono del comentarista',
  },

  // Bienvenida a quien entra en el grupo. {nombre} es la persona.
  bienvenida_grupo: {
    defecto:
      'Bienvenido, {nombre} 👋\n\nSoy el comentarista de la liga. Dale al botón y te cuento en privado cómo funciona: te avisaré de los goles y asistencias de tus futbolistas durante los partidos.',
    secreto: false,
    titulo: 'Bienvenida en el grupo a quien entra',
  },
  saludar_al_entrar: { defecto: '1', secreto: false, titulo: 'Saludar en el grupo a quien entra' },

  // Textos de los avisos privados. {jugador} es el nombre del futbolista y
  // {puntos} lo que lleva en la jornada. Se pueden usar etiquetas <b> y <i>.
  plantilla_goals: { defecto: '⚽ <b>{jugador}</b> ha marcado. Lo tienes en tu once.', secreto: false, titulo: 'Aviso de gol' },
  plantilla_goal_assist: { defecto: '🅰️ <b>{jugador}</b> ha dado una asistencia. Lo tienes en tu once.', secreto: false, titulo: 'Aviso de asistencia' },
  plantilla_penalty_save: { defecto: '🧤 <b>{jugador}</b> ha parado un penalti. Lo tienes en tu once.', secreto: false, titulo: 'Aviso de penalti parado' },
  plantilla_penalty_won: { defecto: '🎯 <b>{jugador}</b> ha provocado un penalti. Lo tienes en tu once.', secreto: false, titulo: 'Aviso de penalti provocado' },
  plantilla_penalty_failed: { defecto: '❌ <b>{jugador}</b> ha fallado un penalti. Lo tienes en tu once.', secreto: false, titulo: 'Aviso de penalti fallado' },
  plantilla_red_card: { defecto: '🟥 <b>{jugador}</b> ha visto la roja. Lo tienes en tu once.', secreto: false, titulo: 'Aviso de roja' },
  plantilla_second_yellow_card: { defecto: '🟥 <b>{jugador}</b> se va por doble amarilla. Lo tienes en tu once.', secreto: false, titulo: 'Aviso de doble amarilla' },
  plantilla_own_goals: { defecto: '🙈 <b>{jugador}</b> ha marcado en propia puerta. Lo tienes en tu once.', secreto: false, titulo: 'Aviso de gol en propia' },
  plantilla_correccion: { defecto: '↩️ Corrección: a <b>{jugador}</b> le han quitado {que}. Lo tienes en tu once.', secreto: false, titulo: 'Aviso de corrección' },
  plantilla_cola_puntos: { defecto: 'Va por {puntos} puntos en esta jornada. Provisional.', secreto: false, titulo: 'Coleta con los puntos del futbolista' },

  // Buenas actuaciones que no son goles: muchas paradas, muchos despejes.
  // El umbral se mide en puntos que aporta una sola estadística, no en
  // cantidad de acciones, así se calibra solo para cada posición.
  avisar_actuaciones: { defecto: '1', secreto: false, titulo: 'Avisar de buenas actuaciones sin gol' },
  puntos_para_destacar: { defecto: '3', secreto: false, titulo: 'Puntos que debe aportar una acción para avisar' },
  plantilla_actuacion: {
    defecto: '👏 <b>{jugador}</b> lleva {cuantas} {que}, y eso le da {puntos_accion} puntos. Lo tienes en tu once.',
    secreto: false,
    titulo: 'Aviso de buena actuación',
  },

  // Avisos que no dependen de un partido en juego.
  avisar_lesionados: { defecto: '1', secreto: false, titulo: 'Avisar de lesionados y sancionados antes del cierre' },
  horas_antes_del_cierre: { defecto: '6', secreto: false, titulo: 'Horas de antelación del aviso de lesionados' },
  anunciar_fichajes: { defecto: '1', secreto: false, titulo: 'Anunciar fichajes y ventas en el grupo' },
  importe_minimo_fichaje: { defecto: '5000000', secreto: false, titulo: 'Importe mínimo para anunciar un fichaje' },
  dias_de_venta_reciente: { defecto: '30', secreto: false, titulo: 'Días para considerar reciente una venta' },

  // Mercado.
  presupuesto_inicial: { defecto: '', secreto: false, titulo: 'Presupuesto con el que empieza cada manager' },

  // Contraseña del administrador, guardada como resumen y no en claro.
  admin_password_hash: { defecto: '', secreto: true, titulo: 'Contraseña del administrador' },

  // Hasta qué jornada se han leído los resultados anteriores. El bot arranca
  // a mitad de temporada, así que la primera vez recupera lo ya jugado.
  jornadas_rellenadas: { defecto: '0', secreto: false, titulo: 'Jornadas anteriores ya recuperadas' },
};

/** Calcula el resumen de una contraseña con sal, para no guardarla en claro. */
export function resumirContrasena(contrasena, sal = crypto.randomBytes(16).toString('hex')) {
  const derivada = crypto.scryptSync(contrasena, sal, 32).toString('hex');
  return `${sal}:${derivada}`;
}

/** Comprueba una contraseña sin dar pistas por el tiempo de respuesta. */
export function contrasenaCorrecta(contrasena, guardado) {
  if (!guardado || !contrasena) return false;
  const [sal, esperado] = guardado.split(':');
  if (!sal || !esperado) return false;
  const derivada = crypto.scryptSync(contrasena, sal, 32);
  const referencia = Buffer.from(esperado, 'hex');
  if (derivada.length !== referencia.length) return false;
  return crypto.timingSafeEqual(derivada, referencia);
}

/**
 * Obtiene la clave de cifrado.
 *
 * Si no viene por variable de entorno, se genera una y se guarda junto a la
 * base de datos. Perder ese fichero significa perder los secretos guardados,
 * que habría que volver a escribir en el panel.
 */
function obtenerClave(directorio) {
  if (process.env.CLAVE_CIFRADO) {
    return crypto.createHash('sha256').update(process.env.CLAVE_CIFRADO).digest();
  }
  const fichero = path.join(directorio, 'clave-cifrado');
  if (!fs.existsSync(fichero)) {
    fs.writeFileSync(fichero, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return crypto.createHash('sha256').update(fs.readFileSync(fichero, 'utf8')).digest();
}

function cifrar(texto, clave) {
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', clave, iv);
  const datos = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return [iv.toString('base64'), etiqueta.toString('base64'), datos.toString('base64')].join('.');
}

function descifrar(guardado, clave) {
  const [iv, etiqueta, datos] = guardado.split('.');
  const descifrador = crypto.createDecipheriv('aes-256-gcm', clave, Buffer.from(iv, 'base64'));
  descifrador.setAuthTag(Buffer.from(etiqueta, 'base64'));
  return Buffer.concat([descifrador.update(Buffer.from(datos, 'base64')), descifrador.final()]).toString('utf8');
}

export class Configuracion {
  #db;
  #clave;
  #cache = new Map();

  constructor(db, directorio) {
    this.#db = db;
    this.#clave = obtenerClave(directorio);
    this.#recargar();
  }

  #recargar() {
    this.#cache.clear();
    for (const fila of this.#db.prepare('SELECT clave, valor, es_secreto FROM configuracion').all()) {
      let valor = fila.valor;
      if (fila.es_secreto && valor) {
        try {
          valor = descifrar(valor, this.#clave);
        } catch {
          // La clave de cifrado no corresponde. El valor se trata como ausente
          // para que el panel permita volver a escribirlo.
          valor = '';
        }
      }
      this.#cache.set(fila.clave, valor);
    }
  }

  /**
   * Rellena los ajustes que falten con valores de arranque.
   * Las variables de entorno tienen prioridad la primera vez, para que el
   * bot pueda funcionar antes de que exista el panel.
   */
  sembrar(desdeEntorno = {}) {
    for (const [clave, def] of Object.entries(AJUSTES)) {
      if (this.#cache.has(clave)) continue;
      this.poner(clave, desdeEntorno[clave] ?? def.defecto);
    }
  }

  obtener(clave) {
    return this.#cache.get(clave) ?? AJUSTES[clave]?.defecto ?? '';
  }

  numero(clave) {
    const valor = Number(this.obtener(clave));
    return Number.isFinite(valor) ? valor : Number(AJUSTES[clave]?.defecto ?? 0);
  }

  activo(clave) {
    return this.obtener(clave) === '1';
  }

  poner(clave, valor) {
    const definicion = AJUSTES[clave];
    if (!definicion) throw new Error(`Ajuste desconocido: ${clave}`);
    const texto = valor == null ? '' : String(valor);
    const guardado = definicion.secreto && texto ? cifrar(texto, this.#clave) : texto;
    this.#db
      .prepare(`
        INSERT INTO configuracion (clave, valor, es_secreto, actualizado_en) VALUES (?, ?, ?, ?)
        ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en
      `)
      .run(clave, guardado, definicion.secreto ? 1 : 0, ahora());
    this.#cache.set(clave, texto);
  }

  /**
   * Lista para la web. Los secretos no salen: solo se dice si están puestos.
   */
  paraLaWeb() {
    return Object.entries(AJUSTES).map(([clave, def]) => ({
      clave,
      titulo: def.titulo,
      secreto: def.secreto,
      valor: def.secreto ? null : this.obtener(clave),
      puesto: Boolean(this.obtener(clave)),
    }));
  }
}
