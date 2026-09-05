import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
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

  app.get('/api/liga/futbolistas', identificado, (req, res) => {
    const buscar = String(req.query.buscar || '').trim();
    if (buscar.length < 2) return res.json([]);
    res.json(almacen.buscarFutbolistas(buscar));
  });

  app.get('/api/liga/futbolista/:id/valor', identificado, (req, res) => {
    const futbolista = almacen.futbolista(req.params.id);
    const serie = almacen.serieDeValor(req.params.id);
    res.json({
      futbolista,
      serie,
      // La serie empieza el día que arrancó el bot: los valores anteriores
      // no están en ninguna parte a la que podamos llegar.
      diasGuardados: serie.length,
    });
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
