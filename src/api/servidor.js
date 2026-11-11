import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { AJUSTES, contrasenaCorrecta, resumirContrasena } from '../db/configuracion.js';
import { NOMBRE_TIPO } from '../nucleo/dinero.js';

const COOKIE = 'sesion';

// Tablas que el administrador puede consultar desde la web. Es una lista
// cerrada: el nombre de tabla llega del navegador y no puede interpolarse
// en una consulta sin comprobarlo antes.
const TABLAS_VISIBLES = [
  'managers', 'vinculaciones', 'usuarios', 'configuracion',
  'estado_jugador', 'estado_manager', 'candidatos_posicion', 'mensajes_enviados',
  'historial_jugador', 'historial_manager', 'historial_propiedad',
  'actividad', 'historial_mercado', 'valor_futbolista', 'futbolistas',
  'partidos', 'incidencias',
];

export function crearServidor({ almacen, usuarios, config, servicio, telegram, directorioWeb }) {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.disable('x-powered-by');

  // ---------- Sesión ----------

  function leerCookie(req) {
    const cabecera = req.headers.cookie || '';
    for (const trozo of cabecera.split(';')) {
      const [nombre, ...resto] = trozo.trim().split('=');
      if (nombre === COOKIE) return decodeURIComponent(resto.join('='));
    }
    return null;
  }

  function ponerCookie(res, token, caducaEn) {
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Secure; Path=/; Expires=${new Date(caducaEn).toUTCString()}`,
    );
  }

  app.use((req, _res, next) => {
    req.usuario = usuarios.usuarioDeSesion(leerCookie(req));
    next();
  });

  const identificado = (req, res, next) =>
    req.usuario ? next() : res.status(401).json({ error: 'Hay que entrar primero.' });

  // El papel se comprueba siempre en el servidor. Esconder el botón en la
  // web no protege nada.
  const soloAdministrador = (req, res, next) =>
    req.usuario?.rol === 'administrador' ? next() : res.status(403).json({ error: 'Solo para el administrador.' });

  // Comprobación de salud para Docker y Traefik. No pide sesión y no
  // revela nada: solo dice que el proceso responde.
  app.get('/api/salud', (_req, res) => res.json({ ok: true }));

  // ---------- Entrar y salir ----------

  app.post('/api/entrar', (req, res) => {
    const { contrasena } = req.body || {};
    if (!contrasenaCorrecta(contrasena, config.obtener('admin_password_hash'))) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }
    const admin = usuarios.asegurarAdministrador();
    const sesion = usuarios.abrirSesion(admin.id);
    ponerCookie(res, sesion.token, sesion.caducaEn);
    res.json({ usuario: { nombre: admin.nombre, rol: admin.rol } });
  });

  app.post('/api/entrar/codigo', (req, res) => {
    const resultado = usuarios.canjearCodigo(String(req.body?.codigo || ''));
    if (!resultado.ok) {
      const motivos = {
        desconocido: 'Ese enlace no vale.',
        usado: 'Ese enlace ya se ha usado. Pide otro con /web en el bot.',
        caducado: 'Ese enlace ha caducado. Pide otro con /web en el bot.',
        sin_acceso: 'Tu acceso está desactivado.',
      };
      return res.status(401).json({ error: motivos[resultado.motivo] || 'No se pudo entrar.' });
    }
    ponerCookie(res, resultado.sesion.token, resultado.sesion.caducaEn);
    res.json({ usuario: { nombre: resultado.usuario.nombre, rol: resultado.usuario.rol } });
  });

  app.post('/api/salir', (req, res) => {
    const token = leerCookie(req);
    if (token) usuarios.cerrarSesion(token);
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0`);
    res.json({ ok: true });
  });

  app.get('/api/yo', (req, res) => {
    if (!req.usuario) return res.json({ identificado: false });
    res.json({
      identificado: true,
      nombre: req.usuario.nombre,
      rol: req.usuario.rol,
      managerId: req.usuario.manager_id,
    });
  });

  // ---------- Estado y administración ----------

  app.get('/api/estado', identificado, soloAdministrador, (req, res) => {
    res.json({
      servicio: servicio.estado,
      configurado: servicio.configurado,
      sesionFantasy: servicio.lector ? servicio.lector.estadoSesion : { activa: false },
      telegram: { configurado: telegram.configurado, grupo: Boolean(config.obtener('telegram_grupo')) },
      managers: almacen.managers().length,
      vinculados: usuarios.todasLasVinculaciones().length,
    });
  });

  app.get('/api/configuracion', identificado, soloAdministrador, (_req, res) => {
    res.json(config.paraLaWeb().filter((a) => a.clave !== 'admin_password_hash'));
  });

  app.put('/api/configuracion', identificado, soloAdministrador, (req, res) => {
    const cambios = req.body || {};
    const desconocidos = Object.keys(cambios).filter((c) => !AJUSTES[c] || c === 'admin_password_hash');
    if (desconocidos.length) return res.status(400).json({ error: `Ajustes desconocidos: ${desconocidos.join(', ')}` });

    for (const [clave, valor] of Object.entries(cambios)) config.poner(clave, valor);
    servicio.refrescarConfiguracion();
    res.json({ ok: true });
  });

  app.put('/api/contrasena', identificado, soloAdministrador, (req, res) => {
    const nueva = String(req.body?.contrasena || '');
    if (nueva.length < 10) return res.status(400).json({ error: 'La contraseña debe tener al menos 10 caracteres.' });
    config.poner('admin_password_hash', resumirContrasena(nueva));
    res.json({ ok: true });
  });

  // ---------- Usuarios ----------

  app.get('/api/usuarios', identificado, soloAdministrador, (_req, res) => {
    res.json({ usuarios: usuarios.listar(), vinculaciones: usuarios.todasLasVinculaciones() });
  });

  app.post('/api/usuarios', identificado, soloAdministrador, (req, res) => {
    const { nombre, telegramId, managerId } = req.body || {};
    if (!nombre || !telegramId) return res.status(400).json({ error: 'Hacen falta el nombre y el identificador de Telegram.' });
    try {
      res.json(usuarios.crear({ nombre, rol: 'participante', telegramId, managerId: managerId || null }));
    } catch (error) {
      res.status(400).json({ error: `No se pudo dar de alta: ${error.message}` });
    }
  });

  app.delete('/api/usuarios/:id', identificado, soloAdministrador, (req, res) => {
    usuarios.borrar(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Contenido para los vídeos de Instagram ----------
  //
  // Lo usa la herramienta de vídeos (videos-explicativos), no la web. Va con
  // su propio token en "Authorization: Bearer", no con la cookie del panel.

  function conTokenDeContenido(req, res, next) {
    const esperado = config.obtener('token_contenido');
    const recibido = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(recibido);
    const b = Buffer.from(esperado || '');
    if (!esperado || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Token de contenido incorrecto.' });
    }
    next();
  }

  // GET /api/contenido/mercado?fecha=AAAA-MM-DD&limite=5&valorMaximo=25000000
  app.get('/api/contenido/mercado', conTokenDeContenido, (req, res) => {
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || '') ? req.query.fecha : null;
    const limite = Math.min(Math.max(Number(req.query.limite) || 5, 1), 20);
    const valorMaximo = Number(req.query.valorMaximo) > 0 ? Number(req.query.valorMaximo) : null;
    res.json(almacen.rankingDeMercado({ fecha, limite, valorMaximo }));
  });

  // GET /api/contenido/estados?desde=2026-11-11T00:00:00Z&limite=10
  // Futbolistas que se han lesionado, han caído en duda, han sido sancionados o han vuelto,
  // desde esa fecha (por defecto, las últimas 24 horas). Para las historias de Instagram.
  app.get('/api/contenido/estados', conTokenDeContenido, (req, res) => {
    const desde = Number.isNaN(Date.parse(req.query.desde || '')) ? new Date(Date.now() - 86400000).toISOString() : new Date(req.query.desde).toISOString();
    const limite = Math.min(Math.max(Number(req.query.limite) || 10, 1), 30);
    res.json({ desde, cambios: almacen.cambiosDeEstado({ desde, limite }) });
  });

  // Los partidos se leen de Fantasy en el momento, no de la base de datos:
  // la tabla de partidos solo tiene la jornada en curso. Se guarda 10 minutos
  // en memoria para no repetir consultas si se piden varias veces.
  const cache = new Map();
  async function conCache(clave, leer) {
    const guardado = cache.get(clave);
    if (guardado && Date.now() - guardado.cuando < 10 * 60000) return guardado.valor;
    const valor = await leer();
    cache.set(clave, { valor, cuando: Date.now() });
    return valor;
  }

  /**
   * Jornada pedida o, si no se pide, la última con algún partido terminado.
   * Con proxima, la primera con algún partido por jugar (para las previas).
   */
  async function jornadaDeContenido(pedida, proxima = false) {
    if (Number(pedida) > 0) return Number(pedida);
    const actual = await servicio.lector.jornadaActual();
    const partidos = await conCache(`jornada-${actual.numero}`, () => servicio.lector.partidosDeJornada(actual.numero));
    if (proxima) return partidos.some((p) => p.estado !== 7) ? actual.numero : actual.siguiente ?? actual.numero + 1;
    return partidos.some((p) => p.estado === 7) ? actual.numero : actual.anterior ?? actual.numero - 1;
  }

  const TERMINADO = 7;
  const resumenDePartido = (p) => ({
    id: p.id,
    jornada: p.jornada,
    fecha: p.fecha,
    terminado: p.estado === TERMINADO,
    local: { id: p.local.id, nombre: p.local.nombre, escudo: p.local.escudo },
    visitante: { id: p.visitante.id, nombre: p.visitante.nombre, escudo: p.visitante.escudo },
    golesLocal: p.golesLocal,
    golesVisitante: p.golesVisitante,
  });

  // GET /api/contenido/partidos?jornada=12 → partidos de la jornada (por defecto, la última con alguno terminado;
  // con ?proxima=1, la primera con alguno por jugar)
  app.get('/api/contenido/partidos', conTokenDeContenido, async (req, res) => {
    try {
      const jornada = await jornadaDeContenido(req.query.jornada, Boolean(req.query.proxima));
      const partidos = await conCache(`jornada-${jornada}`, () => servicio.lector.partidosDeJornada(jornada));
      res.json({ jornada, partidos: partidos.map(resumenDePartido) });
    } catch (error) {
      res.status(502).json({ error: `No se pudo leer Fantasy: ${error.message}` });
    }
  });

  // GET /api/contenido/ranking?tipo=chollos&limite=5 → chollos, infravalorados, porteros, creadores o en-forma.
  // Sale de las estadísticas por jornada guardadas (ver Almacen.rankingDeEstadisticas).
  app.get('/api/contenido/ranking', conTokenDeContenido, (req, res) => {
    const tipos = ['chollos', 'infravalorados', 'porteros', 'creadores', 'en-forma'];
    if (!tipos.includes(req.query.tipo)) return res.status(400).json({ error: `Tipo de ranking: ${tipos.join(', ')}.` });
    const limite = Math.min(Math.max(Number(req.query.limite) || 5, 1), 20);
    res.json(almacen.rankingDeEstadisticas({ tipo: req.query.tipo, limite }));
  });

  // GET /api/contenido/previa?id=121&jornada=13 → un partido por jugar, los últimos cinco resultados de cada
  // equipo y los tres a vigilar (más puntos en las tres últimas jornadas). Sin id, el próximo en jugarse.
  app.get('/api/contenido/previa', conTokenDeContenido, async (req, res) => {
    try {
      const jornada = await jornadaDeContenido(req.query.jornada, true);
      const partidos = await conCache(`jornada-${jornada}`, () => servicio.lector.partidosDeJornada(jornada));
      const porJugar = partidos.filter((p) => p.estado !== TERMINADO).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const partido = req.query.id ? partidos.find((p) => p.id === String(req.query.id)) : porJugar[0];
      if (!partido) return res.status(404).json({ error: 'No hay ese partido por jugar en esa jornada.' });
      if (partido.estado === TERMINADO) return res.status(409).json({ error: 'Ese partido ya se ha jugado.' });
      res.json({ partido: resumenDePartido(partido), ...almacen.previaDePartido(partido.local.id, partido.visitante.id) });
    } catch (error) {
      res.status(502).json({ error: `No se pudo leer Fantasy: ${error.message}` });
    }
  });

  // GET /api/contenido/previa-dia?fecha=2026-11-21 → los partidos que se juegan ese día (hora de España;
  // por defecto, hoy), en orden, cada uno con los últimos cinco resultados de los dos equipos y el
  // futbolista a vigilar (el de los dos con más puntos en las tres últimas jornadas). 404 si ese día no
  // hay partidos: así la tarea diaria sabe si es día de partidos.
  app.get('/api/contenido/previa-dia', conTokenDeContenido, async (req, res) => {
    try {
      const diaDe = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
      const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || '') ? req.query.fecha : diaDe(new Date().toISOString());
      const actual = await servicio.lector.jornadaActual();
      const candidatas = [...new Set([actual.anterior, actual.numero, actual.siguiente].filter((j) => j > 0))];
      const partidos = [];
      for (const j of candidatas) {
        const lista = await conCache(`jornada-${j}`, () => servicio.lector.partidosDeJornada(j));
        partidos.push(...lista.filter((p) => diaDe(p.fecha) === dia));
      }
      if (partidos.length === 0) return res.status(404).json({ error: `El ${dia} no hay partidos.` });
      partidos.sort((a, b) => a.fecha.localeCompare(b.fecha));
      res.json({
        fecha: dia,
        partidos: partidos.map((p) => {
          const previa = almacen.previaDePartido(p.local.id, p.visitante.id);
          return { partido: resumenDePartido(p), formaLocal: previa.formaLocal, formaVisitante: previa.formaVisitante, vigilar: previa.vigilar[0] ?? null };
        }),
      });
    } catch (error) {
      res.status(502).json({ error: `No se pudo leer Fantasy: ${error.message}` });
    }
  });

  // GET /api/contenido/partido?id=75&jornada=12 → resultado, los tres mejores y el peor del partido,
  // con lo que hizo cada uno (goles, asistencias, tarjetas, paradas). Sin id, el último terminado.
  app.get('/api/contenido/partido', conTokenDeContenido, async (req, res) => {
    try {
      const jornada = await jornadaDeContenido(req.query.jornada);
      const partidos = await conCache(`jornada-${jornada}`, () => servicio.lector.partidosDeJornada(jornada));
      const terminados = partidos.filter((p) => p.estado === TERMINADO).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const partido = req.query.id ? partidos.find((p) => p.id === String(req.query.id)) : terminados[0];
      if (!partido) return res.status(404).json({ error: 'No existe ese partido en esa jornada.' });
      if (partido.estado !== TERMINADO) return res.status(409).json({ error: 'Ese partido aún no ha terminado.' });

      const POSICIONES = { 1: 'portero', 2: 'defensa', 3: 'centrocampista', 4: 'delantero' };
      const jugaron = [
        ...partido.local.futbolistas.map((f) => ({ ...f, equipo: partido.local })),
        ...partido.visitante.futbolistas.map((f) => ({ ...f, equipo: partido.visitante })),
      ].filter((f) => f.puntos != null && f.posicionId !== 5);
      const ordenados = [...jugaron].sort((a, b) => b.puntos - a.puntos);
      const mejores = ordenados.slice(0, 3);
      const estadisticas = (f) => conCache(`ficha-${f.id}-${jornada}`, () => servicio.lector.estadisticasDeJornada(f.id, jornada));
      // El peor solo sale si de verdad lo hizo mal (cero puntos o menos) y jugó: la lista de Fantasy
      // trae también a los que no salieron del banquillo, con cero puntos. Se miran como mucho seis.
      let peor = null;
      for (const f of [...ordenados].reverse().filter((x) => x.puntos <= 0 && !mejores.includes(x)).slice(0, 6)) {
        if ((await estadisticas(f))?.minutos > 0) {
          peor = f;
          break;
        }
      }

      const ficha = async (f) => ({
        id: f.id,
        nombre: f.nombre,
        posicion: POSICIONES[f.posicionId] || null,
        foto: f.foto,
        equipo: { nombre: f.equipo.nombre, escudo: f.equipo.escudo },
        puntos: f.puntos,
        estadisticas: await estadisticas(f),
      });
      res.json({
        partido: resumenDePartido(partido),
        mejores: await Promise.all(mejores.map(ficha)),
        peor: peor ? await ficha(peor) : null,
      });
    } catch (error) {
      res.status(502).json({ error: `No se pudo leer Fantasy: ${error.message}` });
    }
  });

  // ---------- Login de Fantasy ----------

  app.post('/api/fantasy/login', identificado, soloAdministrador, async (_req, res) => {
    try {
      res.json(await servicio.entrarEnFantasy());
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // ---------- Acciones ----------

  app.post('/api/acciones/lectura', identificado, soloAdministrador, async (_req, res) => {
    try {
      res.json(await servicio.forzarLectura());
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/acciones/notificar', identificado, soloAdministrador, async (req, res) => {
    const { destino, texto } = req.body || {};
    if (!texto) return res.status(400).json({ error: 'Falta el texto.' });
    const chat = destino === 'grupo' ? config.obtener('telegram_grupo') : destino;
    if (!chat) return res.status(400).json({ error: 'No hay destino: falta el grupo en la configuración.' });
    const resultado = await telegram.enviar(chat, texto);
    if (!resultado.ok) return res.status(400).json({ error: resultado.motivo });
    almacen.marcarEnviado(`manual:${Date.now()}`, String(chat), texto);
    res.json({ ok: true });
  });

  app.post('/api/acciones/calibrar-dinero', identificado, soloAdministrador, (req, res) => {
    const { managerId, dineroReal } = req.body || {};
    const cifra = Number(dineroReal);
    if (!managerId || !Number.isFinite(cifra)) {
      return res.status(400).json({ error: 'Hacen falta el manager y su dinero real, tal como sale en la aplicación oficial.' });
    }
    res.json(servicio.calibrarPresupuesto({ managerId: String(managerId), dineroReal: cifra }));
  });

  // Prueba la clave y la dirección del modelo desde el panel, para no tener
  // que esperar a un adelantamiento real para saber si funcionan.
  app.post('/api/acciones/probar-redactor', identificado, soloAdministrador, async (_req, res) => {
    res.json(await servicio.probarRedactor());
  });

  // ---------- Telegram ----------

  app.get('/api/telegram', identificado, soloAdministrador, async (_req, res) => {
    let bot = null;
    try {
      if (telegram.configurado) bot = await telegram.quienSoy();
    } catch (error) {
      bot = { error: error.message };
    }
    res.json({
      bot,
      grupoElegido: config.obtener('telegram_grupo'),
      gruposVistos: almacen.gruposVistos(),
      vinculaciones: usuarios.todasLasVinculaciones(),
      publicarGrupo: config.activo('publicar_grupo'),
      publicarPrivados: config.activo('publicar_privados'),
      silenciado: config.activo('silenciado'),
    });
  });

  app.post('/api/telegram/grupo', identificado, soloAdministrador, async (req, res) => {
    const chatId = String(req.body?.chatId || '').trim();
    if (!chatId) return res.status(400).json({ error: 'Falta el identificador del grupo.' });
    config.poner('telegram_grupo', chatId);
    // Se manda un mensaje de prueba: si el bot no puede escribir ahí, mejor
    // saberlo ahora que la primera vez que alguien adelante a otro.
    const resultado = await telegram.enviar(chatId, 'Listo. A partir de ahora comentaré aquí los cambios de puesto.');
    if (!resultado.ok) return res.status(400).json({ error: `Guardado, pero no puedo escribir ahí: ${resultado.motivo}` });
    res.json({ ok: true });
  });

  app.post('/api/acciones/simular', identificado, soloAdministrador, async (req, res) => {
    const { jornada, equipoId, destino, tambienAlGrupo } = req.body || {};
    if (!jornada || !equipoId || !destino) {
      return res.status(400).json({ error: 'Hacen falta la jornada, el manager y el chat de destino.' });
    }
    try {
      res.json(await servicio.simular({
        jornada: Number(jornada),
        equipoId: String(equipoId),
        destino: String(destino),
        tambienAlGrupo: Boolean(tambienAlGrupo),
      }));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/acciones/modelos', identificado, soloAdministrador, async (_req, res) => {
    res.json(await servicio.modelosDelProveedor());
  });

  app.get('/api/incidencias', identificado, soloAdministrador, (_req, res) => {
    res.json(almacen.ultimasIncidencias(200));
  });

  app.get('/api/mensajes', identificado, soloAdministrador, (_req, res) => {
    res.json(almacen.ultimosMensajes(100));
  });

  // ---------- Consulta de tablas ----------

  app.get('/api/tablas', identificado, soloAdministrador, (_req, res) => {
    res.json(
      TABLAS_VISIBLES.map((nombre) => ({
        nombre,
        filas: almacen.db.prepare(`SELECT COUNT(*) AS n FROM ${nombre}`).get().n,
      })),
    );
  });

  app.get('/api/tablas/:nombre', identificado, soloAdministrador, (req, res) => {
    const { nombre } = req.params;
    if (!TABLAS_VISIBLES.includes(nombre)) return res.status(404).json({ error: 'Esa tabla no se puede consultar.' });
    const limite = Math.min(Number(req.query.limite) || 100, 1000);
    const salto = Math.max(Number(req.query.salto) || 0, 0);
    const filas = almacen.db.prepare(`SELECT * FROM ${nombre} LIMIT ? OFFSET ?`).all(limite, salto);
    const total = almacen.db.prepare(`SELECT COUNT(*) AS n FROM ${nombre}`).get().n;
    res.json({ nombre, total, filas });
  });

  // ---------- Páginas de la liga ----------

  app.get('/api/liga/clasificacion', identificado, (_req, res) => {
    const jornada = almacen.db.prepare('SELECT MAX(jornada) AS j FROM estado_manager').get()?.j;
    const filas = almacen.db
      .prepare(`
        SELECT e.*, m.nombre, m.manager_id
        FROM estado_manager e JOIN managers m ON m.equipo_id = e.equipo_id
        WHERE e.jornada = ? AND m.es_servicio = 0
        ORDER BY e.puntos_generales DESC
      `)
      .all(jornada);
    res.json({ jornada, filas });
  });

  app.get('/api/liga/managers', identificado, (_req, res) => {
    res.json(almacen.managersReales());
  });

  app.get('/api/liga/manager/:equipoId', identificado, (req, res) => {
    const equipoId = String(req.params.equipoId);
    const manager = almacen.managerPorEquipo(equipoId);
    if (!manager) return res.status(404).json({ error: 'No conozco ese equipo.' });

    const plantilla = almacen.db
      .prepare(`
        SELECT p.futbolista_id, p.desde, f.nombre, f.posicion_id, f.equipo_real_id
        FROM historial_propiedad p LEFT JOIN futbolistas f ON f.id = p.futbolista_id
        WHERE p.equipo_id = ? AND p.hasta IS NULL
      `)
      .all(equipoId);

    const jornadas = almacen.db
      .prepare('SELECT jornada, puntos_jornada, posicion FROM estado_manager WHERE equipo_id = ? ORDER BY jornada')
      .all(equipoId);

    res.json({ manager, plantilla, jornadas });
  });

  app.get('/api/liga/dinero', identificado, (_req, res) => {
    res.json(servicio.dineroDeCadaManager());
  });

  app.get('/api/liga/mercado', identificado, (_req, res) => {
    res.json(almacen.mercadoActual());
  });

  app.get('/api/liga/movimientos', identificado, (_req, res) => {
    res.json(
      almacen.actividadReciente(200).map((m) => ({
        ...m,
        tipo_nombre: NOMBRE_TIPO[m.tipo] || `tipo ${m.tipo}`,
      })),
    );
  });

  // Lista de futbolistas con los mismos filtros que la aplicación oficial,
  // más dos que ella no tiene: quién de la liga lo tiene y cuánto ha subido.
  app.get('/api/liga/futbolistas', identificado, (req, res) => {
    const q = req.query;
    res.json(
      almacen.listarFutbolistas({
        nombre: q.nombre,
        posicion: q.posicion,
        equipo: q.equipo,
        estado: q.estado,
        propietario: q.propietario,
        orden: q.orden,
        sentido: q.sentido,
        dias: Math.min(Math.max(Number(q.dias) || 7, 1), 365),
        limite: Math.min(Number(q.limite) || 50, 200),
        salto: Math.max(Number(q.salto) || 0, 0),
      }),
    );
  });

  app.get('/api/liga/equipos', identificado, (_req, res) => {
    res.json(almacen.equipos());
  });

  app.get('/api/liga/futbolista/:id', identificado, (req, res) => {
    const futbolista = almacen.futbolista(req.params.id);
    if (!futbolista) return res.status(404).json({ error: 'No conozco ese futbolista.' });

    const serie = almacen.serieDeValor(req.params.id);
    const jornadas = almacen.db
      .prepare(`
        SELECT e.jornada, e.puntos, e.estadisticas, m.nombre AS manager
        FROM estado_jugador e LEFT JOIN managers m ON m.equipo_id = e.equipo_id
        WHERE e.futbolista_id = ? ORDER BY e.jornada
      `)
      .all(String(req.params.id));

    const propietarios = almacen.db
      .prepare(`
        SELECT p.desde, p.hasta, m.nombre
        FROM historial_propiedad p LEFT JOIN managers m ON m.equipo_id = p.equipo_id
        WHERE p.futbolista_id = ? ORDER BY p.desde DESC
      `)
      .all(String(req.params.id));

    const movimientos = almacen.db
      .prepare(`
        SELECT a.tipo, a.importe, a.fecha, m.nombre AS manager
        FROM actividad a LEFT JOIN managers m ON m.manager_id = a.manager_id
        WHERE a.futbolista_id = ? ORDER BY a.fecha DESC
      `)
      .all(String(req.params.id));

    res.json({ futbolista, serie, jornadas, propietarios, movimientos, diasGuardados: serie.length });
  });

  // Se mantiene por compatibilidad con la página de precios anterior.
  app.get('/api/liga/futbolista/:id/valor', identificado, (req, res) => {
    const serie = almacen.serieDeValor(req.params.id);
    res.json({ futbolista: almacen.futbolista(req.params.id), serie, diasGuardados: serie.length });
  });

  // ---------- Web ----------

  if (directorioWeb && fs.existsSync(directorioWeb)) {
    app.use(express.static(directorioWeb, { index: false }));
    // Cualquier ruta que no sea de la API devuelve la web, que se encarga
    // de mostrar la pantalla correcta.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(directorioWeb, 'index.html')));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Esa dirección no existe.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    almacen.anotarIncidencia('error', 'web', error.message);
    res.status(500).json({ error: 'Ha fallado algo en el servidor.' });
  });

  return app;
}
