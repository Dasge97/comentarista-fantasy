import crypto from 'node:crypto';
import { ahora } from './db.js';

const DIAS_DE_SESION = 30;
const MINUTOS_DE_CODIGO = 15;

/**
 * Usuarios de la web, vinculaciones de Telegram y sesiones.
 *
 * Nadie se registra por su cuenta. El administrador da de alta a cada
 * participante. Un participante entra con un código de un solo uso que le
 * reparte el bot; el administrador entra con contraseña, para poder entrar
 * aunque el bot esté caído.
 */
export class Usuarios {
  #db;

  constructor(db) {
    this.#db = db;
  }

  // ---------- Vinculación de Telegram con un manager ----------

  /** El amigo elige qué manager es. Puede rectificar cuando quiera. */
  vincular(telegramId, managerId, nombreTelegram) {
    const ocupado = this.#db
      .prepare('SELECT telegram_id FROM vinculaciones WHERE manager_id = ?')
      .get(String(managerId));
    if (ocupado && ocupado.telegram_id !== String(telegramId)) {
      return { ok: false, motivo: 'ocupado' };
    }
    this.#db
      .prepare(`
        INSERT INTO vinculaciones (telegram_id, manager_id, nombre_telegram, creada_en) VALUES (?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET manager_id = excluded.manager_id, nombre_telegram = excluded.nombre_telegram
      `)
      .run(String(telegramId), String(managerId), nombreTelegram ?? null, ahora());
    return { ok: true };
  }

  desvincular(telegramId) {
    this.#db.prepare('DELETE FROM vinculaciones WHERE telegram_id = ?').run(String(telegramId));
  }

  vinculacionDe(telegramId) {
    return this.#db.prepare('SELECT * FROM vinculaciones WHERE telegram_id = ?').get(String(telegramId)) || null;
  }

  vinculacionDeManager(managerId) {
    return this.#db.prepare('SELECT * FROM vinculaciones WHERE manager_id = ?').get(String(managerId)) || null;
  }

  managersLibres(managers) {
    const ocupados = new Set(
      this.#db.prepare('SELECT manager_id FROM vinculaciones').all().map((f) => f.manager_id),
    );
    return managers.filter((m) => !ocupados.has(m.manager_id));
  }

  todasLasVinculaciones() {
    return this.#db
      .prepare(`
        SELECT v.*, m.nombre AS manager_nombre, m.equipo_id
        FROM vinculaciones v LEFT JOIN managers m ON m.manager_id = v.manager_id
      `)
      .all();
  }

  // ---------- Usuarios de la web ----------

  crear({ nombre, rol, telegramId = null, managerId = null }) {
    const resultado = this.#db
      .prepare(`
        INSERT INTO usuarios (telegram_id, manager_id, nombre, rol, activo, creado_en)
        VALUES (?, ?, ?, ?, 1, ?)
      `)
      .run(telegramId ? String(telegramId) : null, managerId ? String(managerId) : null, nombre, rol, ahora());
    return this.porId(Number(resultado.lastInsertRowid));
  }

  porId(id) {
    return this.#db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) || null;
  }

  porTelegram(telegramId) {
    return this.#db.prepare('SELECT * FROM usuarios WHERE telegram_id = ?').get(String(telegramId)) || null;
  }

  administrador() {
    return this.#db.prepare("SELECT * FROM usuarios WHERE rol = 'administrador' LIMIT 1").get() || null;
  }

  listar() {
    return this.#db
      .prepare(`
        SELECT u.*, m.nombre AS manager_nombre
        FROM usuarios u LEFT JOIN managers m ON m.manager_id = u.manager_id
        ORDER BY u.rol, u.nombre
      `)
      .all();
  }

  cambiarActivo(id, activo) {
    this.#db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id);
    if (!activo) this.#db.prepare('DELETE FROM sesiones_web WHERE usuario_id = ?').run(id);
  }

  borrar(id) {
    this.#db.prepare('DELETE FROM sesiones_web WHERE usuario_id = ?').run(id);
    this.#db.prepare('DELETE FROM codigos_acceso WHERE usuario_id = ?').run(id);
    this.#db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(id);
  }

  /** Asegura que existe un administrador. Devuelve el que haya. */
  asegurarAdministrador(nombre = 'Administrador') {
    return this.administrador() || this.crear({ nombre, rol: 'administrador' });
  }

  // ---------- Códigos de un solo uso ----------

  crearCodigo(usuarioId) {
    const codigo = crypto.randomBytes(24).toString('base64url');
    const caduca = new Date(Date.now() + MINUTOS_DE_CODIGO * 60000).toISOString();
    this.#db
      .prepare('INSERT INTO codigos_acceso (codigo, usuario_id, caduca_en, usado_en) VALUES (?, ?, ?, NULL)')
      .run(codigo, usuarioId, caduca);
    return { codigo, caducaEn: caduca, minutos: MINUTOS_DE_CODIGO };
  }

  /** Canjea un código por una sesión. Un código solo sirve una vez. */
  canjearCodigo(codigo) {
    const fila = this.#db.prepare('SELECT * FROM codigos_acceso WHERE codigo = ?').get(codigo);
    if (!fila) return { ok: false, motivo: 'desconocido' };
    if (fila.usado_en) return { ok: false, motivo: 'usado' };
    if (fila.caduca_en < ahora()) return { ok: false, motivo: 'caducado' };

    const usuario = this.porId(fila.usuario_id);
    if (!usuario || !usuario.activo) return { ok: false, motivo: 'sin_acceso' };

    this.#db.prepare('UPDATE codigos_acceso SET usado_en = ? WHERE codigo = ?').run(ahora(), codigo);
    return { ok: true, sesion: this.abrirSesion(usuario.id), usuario };
  }

  // ---------- Sesiones ----------

  abrirSesion(usuarioId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const caduca = new Date(Date.now() + DIAS_DE_SESION * 86400000).toISOString();
    this.#db
      .prepare('INSERT INTO sesiones_web (token, usuario_id, creada_en, caduca_en) VALUES (?, ?, ?, ?)')
      .run(token, usuarioId, ahora(), caduca);
    return { token, caducaEn: caduca };
  }

  usuarioDeSesion(token) {
    if (!token) return null;
    const fila = this.#db
      .prepare(`
        SELECT u.* FROM sesiones_web s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token = ? AND s.caduca_en > ? AND u.activo = 1
      `)
      .get(token, ahora());
    return fila || null;
  }

  cerrarSesion(token) {
    this.#db.prepare('DELETE FROM sesiones_web WHERE token = ?').run(token);
  }

  /** Borra sesiones y códigos caducados. Se llama de vez en cuando. */
  limpiar() {
    const momento = ahora();
    this.#db.prepare('DELETE FROM sesiones_web WHERE caduca_en < ?').run(momento);
    this.#db.prepare('DELETE FROM codigos_acceso WHERE caduca_en < ? OR usado_en IS NOT NULL').run(momento);
  }
}
