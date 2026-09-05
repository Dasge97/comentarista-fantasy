import { ahora, enTransaccion, hoy } from './db.js';

/**
 * Guarda y consulta los datos de la liga.
 *
 * Las escrituras siguen siempre la misma regla: se actualiza la tabla de
 * estado y, solo si algo ha cambiado, se añade una fila al histórico.
 * Guardar cada minuto una copia idéntica no aporta nada y hace la base de
 * datos inmanejable.
 */
export class Almacen {
  #db;

  constructor(db) {
    this.#db = db;
  }

  get db() {
    return this.#db;
  }

  // ---------- Managers ----------

  guardarManagers(managers, managerServicio) {
    const sql = this.#db.prepare(`
      INSERT INTO managers (manager_id, equipo_id, nombre, es_servicio, actualizado_en)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(manager_id) DO UPDATE SET
        equipo_id = excluded.equipo_id,
        nombre = excluded.nombre,
        es_servicio = excluded.es_servicio,
        actualizado_en = excluded.actualizado_en
    `);
    enTransaccion(this.#db, () => {
      for (const m of managers) {
        sql.run(m.managerId, m.equipoId, m.managerNombre || m.nombre, m.managerId === managerServicio ? 1 : 0, ahora());
      }
    });
  }

  managers() {
    return this.#db.prepare('SELECT * FROM managers ORDER BY nombre').all();
  }

  /** Todos menos la cuenta de servicio. Es la lista que el bot narra. */
  managersReales() {
    return this.#db.prepare('SELECT * FROM managers WHERE es_servicio = 0 ORDER BY nombre').all();
  }

  managerPorEquipo(equipoId) {
    return this.#db.prepare('SELECT * FROM managers WHERE equipo_id = ?').get(String(equipoId)) || null;
  }

  // ---------- Puntuación de managers ----------

  /**
   * Guarda la lectura de un manager y devuelve qué ha cambiado.
   * Si no ha cambiado nada, devuelve null y no toca el histórico.
   */
  guardarLecturaManager({ jornada, equipoId, puntosJornada, puntosGenerales, posicion }) {
    const previo = this.#db
      .prepare('SELECT * FROM estado_manager WHERE jornada = ? AND equipo_id = ?')
      .get(jornada, String(equipoId));

    const igual =
      previo &&
      previo.puntos_jornada === puntosJornada &&
      previo.puntos_generales === puntosGenerales &&
      previo.posicion === posicion;

    if (igual) return null;

    const momento = ahora();
    enTransaccion(this.#db, () => {
      this.#db
        .prepare(`
          INSERT INTO estado_manager (jornada, equipo_id, puntos_jornada, puntos_generales, posicion, observado_en)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(jornada, equipo_id) DO UPDATE SET
            puntos_jornada = excluded.puntos_jornada,
            puntos_generales = excluded.puntos_generales,
            posicion = excluded.posicion,
            observado_en = excluded.observado_en
        `)
        .run(jornada, String(equipoId), puntosJornada, puntosGenerales, posicion, momento);

      this.#db
        .prepare(`
          INSERT INTO historial_manager (jornada, equipo_id, puntos_jornada, puntos_generales, posicion, observado_en)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(jornada, String(equipoId), puntosJornada, puntosGenerales, posicion, momento);
    });

    return {
      equipoId: String(equipoId),
      jornada,
      antes: previo
        ? { puntosJornada: previo.puntos_jornada, puntosGenerales: previo.puntos_generales, posicion: previo.posicion }
        : null,
      ahora: { puntosJornada, puntosGenerales, posicion },
      // Sin lectura anterior no hay cambio que narrar: es la referencia inicial.
      esPrimeraLectura: !previo,
    };
  }

  // ---------- Puntuación de futbolistas ----------

  /**
   * Guarda la lectura de un futbolista y devuelve qué ha cambiado.
   *
   * `puntos` puede ser null, que significa que no hay dato de esa jornada.
   * No se convierte a cero en ningún momento.
   */
  guardarLecturaJugador({ jornada, equipoId, futbolistaId, puntos, estadisticas }) {
    const previo = this.#db
      .prepare('SELECT * FROM estado_jugador WHERE jornada = ? AND equipo_id = ? AND futbolista_id = ?')
      .get(jornada, String(equipoId), String(futbolistaId));

    const estadisticasJson = estadisticas ? JSON.stringify(estadisticas) : null;
    if (previo && previo.puntos === puntos && previo.estadisticas === estadisticasJson) return null;

    const momento = ahora();
    enTransaccion(this.#db, () => {
      this.#db
        .prepare(`
          INSERT INTO estado_jugador (jornada, equipo_id, futbolista_id, puntos, estadisticas, observado_en)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(jornada, equipo_id, futbolista_id) DO UPDATE SET
            puntos = excluded.puntos,
            estadisticas = excluded.estadisticas,
            observado_en = excluded.observado_en
        `)
        .run(jornada, String(equipoId), String(futbolistaId), puntos, estadisticasJson, momento);

      this.#db
        .prepare(`
          INSERT INTO historial_jugador (jornada, equipo_id, futbolista_id, puntos, estadisticas, observado_en)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(jornada, String(equipoId), String(futbolistaId), puntos, estadisticasJson, momento);
    });

    return {
      jornada,
      equipoId: String(equipoId),
      futbolistaId: String(futbolistaId),
      antes: previo
        ? { puntos: previo.puntos, estadisticas: previo.estadisticas ? JSON.parse(previo.estadisticas) : null }
        : null,
      ahora: { puntos, estadisticas },
      esPrimeraLectura: !previo,
    };
  }

  // ---------- Propiedad de futbolistas ----------

  /**
   * Ajusta el histórico de propiedad al contenido actual de una plantilla.
   *
   * Cierra las fichas de los futbolistas que ya no están y abre las de los
   * que han entrado. Así se puede saber quién tenía a cada futbolista en
   * cualquier momento pasado.
   */
  sincronizarPlantilla(equipoId, futbolistaIds) {
    const equipo = String(equipoId);
    const actuales = new Set(futbolistaIds.map(String));
    const momento = ahora();

    const abiertas = this.#db
      .prepare('SELECT id, futbolista_id FROM historial_propiedad WHERE equipo_id = ? AND hasta IS NULL')
      .all(equipo);

    const registrados = new Set(abiertas.map((f) => f.futbolista_id));
    const bajas = abiertas.filter((f) => !actuales.has(f.futbolista_id));
    const altas = [...actuales].filter((id) => !registrados.has(id));

    if (bajas.length === 0 && altas.length === 0) return { altas: [], bajas: [] };

    enTransaccion(this.#db, () => {
      const cerrar = this.#db.prepare('UPDATE historial_propiedad SET hasta = ? WHERE id = ?');
      for (const baja of bajas) cerrar.run(momento, baja.id);

      const abrir = this.#db.prepare(
        'INSERT INTO historial_propiedad (futbolista_id, equipo_id, desde, hasta) VALUES (?, ?, ?, NULL)',
      );
      for (const id of altas) abrir.run(id, equipo, momento);
    });

    return { altas, bajas: bajas.map((b) => b.futbolista_id) };
  }

  /** Quién tenía a un futbolista en una fecha dada. */
  propietarioEn(futbolistaId, momento) {
    return (
      this.#db
        .prepare(`
          SELECT equipo_id FROM historial_propiedad
          WHERE futbolista_id = ? AND desde <= ? AND (hasta IS NULL OR hasta > ?)
          ORDER BY desde DESC LIMIT 1
        `)
        .get(String(futbolistaId), momento, momento)?.equipo_id || null
    );
  }

  // ---------- Actividad de la liga ----------

  /** Guarda las entradas que no estaban. Devuelve solo las nuevas. */
  guardarActividad(entradas) {
    const existe = this.#db.prepare('SELECT 1 FROM actividad WHERE id = ?');
    const insertar = this.#db.prepare(`
      INSERT INTO actividad (id, tipo, manager_id, manager2_id, futbolista_id, importe, jornada, fecha, registrada_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const nuevas = [];
    enTransaccion(this.#db, () => {
      for (const e of entradas) {
        if (existe.get(e.id)) continue;
        insertar.run(e.id, e.tipo, e.managerId, e.manager2Id ?? null, e.futbolistaId, e.importe, e.jornada ?? null, e.fecha, ahora());
        nuevas.push(e);
      }
    });
    return nuevas;
  }

  todaLaActividad() {
    return this.#db.prepare('SELECT * FROM actividad ORDER BY fecha').all();
  }

  actividadReciente(limite = 100) {
    return this.#db
      .prepare(`
        SELECT a.*, m.nombre AS manager_nombre, f.nombre AS futbolista_nombre
        FROM actividad a
        LEFT JOIN managers m ON m.manager_id = a.manager_id
        LEFT JOIN futbolistas f ON f.id = a.futbolista_id
        ORDER BY a.fecha DESC LIMIT ?
      `)
      .all(limite);
  }

  actividadDe(managerId, limite = 200) {
    return this.#db
      .prepare('SELECT * FROM actividad WHERE manager_id = ? ORDER BY fecha DESC LIMIT ?')
      .all(String(managerId), limite);
  }

  // ---------- Mercado ----------

  /** Añade una fila por cada entrada del mercado que haya cambiado. */
  guardarMercado(entradas) {
    const ultima = this.#db.prepare(
      'SELECT precio, estado, pujas FROM historial_mercado WHERE entrada_id = ? ORDER BY id DESC LIMIT 1',
    );
    const insertar = this.#db.prepare(`
      INSERT INTO historial_mercado (entrada_id, futbolista_id, precio, expira, estado, pujas, observado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    let cambios = 0;
    enTransaccion(this.#db, () => {
      for (const e of entradas) {
        const previa = ultima.get(e.id);
        if (previa && previa.precio === e.precio && previa.estado === e.estado && previa.pujas === e.numeroDePujas) {
          continue;
        }
        insertar.run(e.id, e.futbolistaId, e.precio, e.expira, e.estado, e.numeroDePujas, ahora());
        cambios += 1;
      }
    });
    return cambios;
  }

  mercadoActual() {
    return this.#db
      .prepare(`
        SELECT m.* FROM historial_mercado m
        JOIN (SELECT entrada_id, MAX(id) AS ultimo FROM historial_mercado GROUP BY entrada_id) u
          ON m.id = u.ultimo
        WHERE m.estado = 'on_sale'
        ORDER BY m.precio DESC
      `)
      .all();
  }

  // ---------- Catálogo y valores de mercado ----------

  guardarFutbolistas(futbolistas) {
    const sql = this.#db.prepare(`
      INSERT INTO futbolistas (id, nombre, posicion_id, equipo_real_id, estado, actualizado_en)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nombre = excluded.nombre,
        posicion_id = excluded.posicion_id,
        equipo_real_id = excluded.equipo_real_id,
        estado = excluded.estado,
        actualizado_en = excluded.actualizado_en
    `);
    enTransaccion(this.#db, () => {
      for (const f of futbolistas) {
        sql.run(f.id, f.nombre, f.posicionId, f.equipoRealId, f.estado, ahora());
      }
    });
  }

  /**
   * Una fila por futbolista y día. Es la excepción a la regla de guardar
   * solo cambios: una serie de precios con huecos es peor de usar que una
   * completa.
   */
  guardarValoresDelDia(futbolistas, fecha = hoy()) {
    const sql = this.#db.prepare(`
      INSERT INTO valor_futbolista (fecha, futbolista_id, valor, puntos, media)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(fecha, futbolista_id) DO UPDATE SET
        valor = excluded.valor, puntos = excluded.puntos, media = excluded.media
    `);
    enTransaccion(this.#db, () => {
      for (const f of futbolistas) sql.run(fecha, f.id, f.valor, f.puntos, f.media);
    });
    return futbolistas.length;
  }

  hayValoresDe(fecha) {
    return Boolean(this.#db.prepare('SELECT 1 FROM valor_futbolista WHERE fecha = ? LIMIT 1').get(fecha));
  }

  serieDeValor(futbolistaId) {
    return this.#db
      .prepare('SELECT fecha, valor, puntos, media FROM valor_futbolista WHERE futbolista_id = ? ORDER BY fecha')
      .all(String(futbolistaId));
  }

  // ---------- Partidos ----------

  guardarPartidos(partidos, jornada) {
    const sql = this.#db.prepare(`
      INSERT INTO partidos (id, jornada, fecha, local_id, visitante_id, estado, goles_local, goles_visitante, actualizado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        estado = excluded.estado,
        goles_local = excluded.goles_local,
        goles_visitante = excluded.goles_visitante,
        actualizado_en = excluded.actualizado_en
    `);
    const cambios = [];
    enTransaccion(this.#db, () => {
      for (const p of partidos) {
        const previo = this.#db.prepare('SELECT estado, goles_local, goles_visitante FROM partidos WHERE id = ?').get(p.id);
        sql.run(p.id, jornada, p.fecha, p.localId, p.visitanteId, p.estadoBruto, p.golesLocal, p.golesVisitante, ahora());
        if (previo && previo.estado !== p.estadoBruto) {
          cambios.push({ partidoId: p.id, estadoAntes: previo.estado, estadoAhora: p.estadoBruto });
        }
      }
    });
    return cambios;
  }

  partidosDeLaJornada(jornada) {
    return this.#db.prepare('SELECT * FROM partidos WHERE jornada = ? ORDER BY fecha').all(jornada);
  }

  partidosPendientesDeResumen(jornada, estadoFinalizado, antesDe) {
    return this.#db
      .prepare(`
        SELECT * FROM partidos
        WHERE jornada = ? AND estado = ? AND resumen_enviado_en IS NULL AND actualizado_en <= ?
      `)
      .all(jornada, estadoFinalizado, antesDe);
  }

  marcarResumenEnviado(partidoId) {
    this.#db.prepare('UPDATE partidos SET resumen_enviado_en = ? WHERE id = ?').run(ahora(), partidoId);
  }

  // ---------- Cambios de puesto pendientes de confirmar ----------

  /**
   * Registra que se ha visto un cambio de puesto y devuelve cuántas
   * lecturas seguidas lleva. La puntuación sube y baja durante el partido,
   * así que un cambio visto una sola vez puede deshacerse solo.
   */
  anotarCandidato({ clave, equipoId, posicion, posicionPrevia }) {
    const momento = ahora();
    const previo = this.#db.prepare('SELECT veces FROM candidatos_posicion WHERE clave = ?').get(clave);
    if (previo) {
      this.#db
        .prepare('UPDATE candidatos_posicion SET veces = veces + 1, ultima_vez = ?, posicion = ? WHERE clave = ?')
        .run(momento, posicion, clave);
      return previo.veces + 1;
    }
    this.#db
      .prepare(`
        INSERT INTO candidatos_posicion (clave, equipo_id, posicion, posicion_previa, veces, primera_vez, ultima_vez)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `)
      .run(clave, String(equipoId), posicion, posicionPrevia, momento, momento);
    return 1;
  }

  candidatosVivos() {
    return this.#db.prepare('SELECT clave FROM candidatos_posicion').all().map((f) => f.clave);
  }

  /** Olvida un candidato. Se llama cuando el adelantamiento se deshace o ya se ha publicado. */
  olvidarCandidato(clave) {
    this.#db.prepare('DELETE FROM candidatos_posicion WHERE clave = ?').run(clave);
  }

  // ---------- Mensajes ya publicados ----------

  yaEnviado(clave) {
    return Boolean(this.#db.prepare('SELECT 1 FROM mensajes_enviados WHERE clave = ?').get(clave));
  }

  marcarEnviado(clave, destino, texto) {
    this.#db
      .prepare('INSERT OR IGNORE INTO mensajes_enviados (clave, destino, texto, enviado_en) VALUES (?, ?, ?, ?)')
      .run(clave, destino, texto ?? null, ahora());
  }

  ultimosMensajes(limite = 50) {
    return this.#db.prepare('SELECT * FROM mensajes_enviados ORDER BY enviado_en DESC LIMIT ?').all(limite);
  }

  // ---------- Incidencias ----------

  anotarIncidencia(nivel, origen, mensaje) {
    this.#db
      .prepare('INSERT INTO incidencias (nivel, origen, mensaje, ocurrida_en) VALUES (?, ?, ?, ?)')
      .run(nivel, origen, String(mensaje).slice(0, 2000), ahora());
  }

  ultimasIncidencias(limite = 100) {
    return this.#db.prepare('SELECT * FROM incidencias ORDER BY id DESC LIMIT ?').all(limite);
  }
}
