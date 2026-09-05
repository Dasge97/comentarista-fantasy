import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { MIGRACIONES } from './esquema.js';

/**
 * Abre la base de datos y aplica las migraciones que falten.
 *
 * Se usa el SQLite que trae Node. Evita compilar una dependencia nativa,
 * que en Docker obliga a instalar herramientas de construcción. A cambio,
 * la interfaz está marcada como experimental: la versión de Node queda
 * fijada en el Dockerfile para que no cambie sin querer.
 */
export function abrirBaseDeDatos(directorio) {
  const ruta = path.join(directorio, 'comentarista.sqlite');
  const db = new DatabaseSync(ruta);

  // WAL permite leer mientras se escribe. El sondeo escribe cada minuto y
  // la web lee a la vez.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  aplicarMigraciones(db);
  return db;
}

function aplicarMigraciones(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migraciones (
      nombre     TEXT PRIMARY KEY,
      aplicada_en TEXT NOT NULL
    )
  `);

  const yaAplicadas = new Set(db.prepare('SELECT nombre FROM migraciones').all().map((f) => f.nombre));

  for (const migracion of MIGRACIONES) {
    if (yaAplicadas.has(migracion.nombre)) continue;
    // Cada migración es atómica: o entra entera o no entra.
    db.exec('BEGIN');
    try {
      db.exec(migracion.sql);
      db.prepare('INSERT INTO migraciones (nombre, aplicada_en) VALUES (?, ?)').run(
        migracion.nombre,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`La migración ${migracion.nombre} ha fallado: ${error.message}`);
    }
  }
}

/** Ejecuta varias escrituras como una sola operación. */
export function enTransaccion(db, trabajo) {
  db.exec('BEGIN');
  try {
    const resultado = trabajo();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export const ahora = () => new Date().toISOString();

/** Fecha sin hora, para las tablas que guardan una fila al día. */
export const hoy = () => new Date().toISOString().slice(0, 10);
