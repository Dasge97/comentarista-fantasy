import { ahora, enTransaccion, hoy } from './db.js';

/**
 * Futbolistas a los que hay que pedir la serie completa de precios:
 * - los que nunca la han tenido, o
 * - los que no tienen el precio de ayer y no se han pedido hoy. Pasa cuando
 *   el bot ha estado parado: del 15 de octubre al 9 de noviembre de 2026 no
 *   leyó nada, y como todos estaban marcados, el hueco no se rellenaba nunca.
 *   Como mucho se piden una vez al día, para que un futbolista nuevo sin
 *   precio de ayer no se pida en cada tanda.
 * Parámetros: hoy, hoy, ayer (ver fechasHueco).
 */
const SIN_HISTORICO = `(
  f.historico_traido_en IS NULL
  OR (substr(f.historico_traido_en, 1, 10) < ?
      AND EXISTS (SELECT 1 FROM valor_futbolista v WHERE v.futbolista_id = f.id AND v.fecha = ?)
      AND NOT EXISTS (SELECT 1 FROM valor_futbolista v WHERE v.futbolista_id = f.id AND v.fecha = ?))
)`;

function fechasHueco() {
  const dia = hoy();
  const ayer = new Date(Date.parse(`${dia}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return [dia, dia, ayer];
}

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
      INSERT INTO managers (manager_id, equipo_id, nombre, es_servicio, valor_equipo, actualizado_en)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(manager_id) DO UPDATE SET
        equipo_id = excluded.equipo_id,
        nombre = excluded.nombre,
        es_servicio = excluded.es_servicio,
        valor_equipo = COALESCE(excluded.valor_equipo, managers.valor_equipo),
        actualizado_en = excluded.actualizado_en
    `);
    enTransaccion(this.#db, () => {
      for (const m of managers) {
        sql.run(
          m.managerId, m.equipoId, m.managerNombre || m.nombre,
          m.managerId === managerServicio ? 1 : 0, m.valorEquipo ?? null, ahora(),
        );
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
      'SELECT precio, estado, pujas, origen FROM historial_mercado WHERE entrada_id = ? ORDER BY id DESC LIMIT 1',
    );
    const insertar = this.#db.prepare(`
      INSERT INTO historial_mercado (entrada_id, futbolista_id, precio, expira, estado, pujas, origen, vendedor_equipo_id, clausula, observado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let cambios = 0;
    enTransaccion(this.#db, () => {
      for (const e of entradas) {
        const previa = ultima.get(e.id);
        // El origen entra en la comparación para que las filas guardadas
        // antes de que existiera esa columna se completen solas.
        const igual =
          previa &&
          previa.precio === e.precio &&
          previa.estado === e.estado &&
          previa.pujas === e.numeroDePujas &&
          previa.origen === e.origen;
        if (igual) continue;
        insertar.run(
          e.id, e.futbolistaId, e.precio, e.expira, e.estado, e.numeroDePujas,
          e.origen ?? null, e.vendedorEquipoId ?? null, e.clausula ?? null, ahora(),
        );
        cambios += 1;
      }
    });
    return cambios;
  }

  /**
   * Mercado tal como está ahora, con el nombre del futbolista y el del
   * manager que lo vende. Sin los nombres la pantalla es ilegible.
   */
  mercadoActual() {
    return this.#db
      .prepare(`
        SELECT m.*, f.nombre AS futbolista_nombre, f.posicion_id, mg.nombre AS vendedor_nombre
        FROM historial_mercado m
        JOIN (SELECT entrada_id, MAX(id) AS ultimo FROM historial_mercado GROUP BY entrada_id) u
          ON m.id = u.ultimo
        LEFT JOIN futbolistas f ON f.id = m.futbolista_id
        LEFT JOIN managers mg ON mg.equipo_id = m.vendedor_equipo_id
        WHERE m.estado = 'on_sale'
        ORDER BY m.precio DESC
      `)
      .all();
  }

  /**
   * Lista de futbolistas con filtros, como la de la aplicación oficial.
   *
   * Añade dos cosas que la oficial no tiene: quién de la liga lo tiene, y
   * cuánto ha subido o bajado de precio en los últimos días.
   */
  listarFutbolistas({ nombre, posicion, equipo, estado, propietario, orden = 'valor', sentido = 'desc', dias = 7, limite = 100, salto = 0 } = {}) {
    const ordenes = {
      valor: 'valor',
      puntos: 'f.puntos_temporada',
      media: 'f.media',
      nombre: 'f.nombre',
      cambio: 'cambio',
      cambio_porcentaje: 'cambio_porcentaje',
    };
    const columna = ordenes[orden] || 'valor';
    const direccion = sentido === 'asc' ? 'ASC' : 'DESC';

    const condiciones = [];
    const valores = [];
    if (nombre) {
      condiciones.push('f.nombre LIKE ? COLLATE NOCASE');
      valores.push(`%${nombre}%`);
    }
    if (posicion) {
      condiciones.push('f.posicion_id = ?');
      valores.push(Number(posicion));
    }
    if (equipo) {
      condiciones.push('f.equipo_real_id = ?');
      valores.push(String(equipo));
    }
    if (estado) {
      condiciones.push('f.estado = ?');
      valores.push(String(estado));
    }
    if (propietario === 'libre') condiciones.push('propietario IS NULL');
    else if (propietario === 'ocupado') condiciones.push('propietario IS NOT NULL');
    else if (propietario) {
      condiciones.push('propietario_equipo = ?');
      valores.push(String(propietario));
    }

    // La subida o bajada se mide contra el valor de hace `dias` días. Si el
    // futbolista no tiene dato de ese día, se coge el más antiguo que haya.
    const consulta = `
      WITH base AS (
        SELECT
          f.id, f.nombre, f.posicion_id, f.equipo_real_id, f.estado,
          f.puntos_temporada, f.media,
          eq.nombre AS equipo_nombre,
          (SELECT v.valor FROM valor_futbolista v WHERE v.futbolista_id = f.id ORDER BY v.fecha DESC LIMIT 1) AS valor,
          (SELECT v.valor FROM valor_futbolista v WHERE v.futbolista_id = f.id AND v.fecha <= date('now', ?) ORDER BY v.fecha DESC LIMIT 1) AS valor_antes,
          (SELECT COUNT(*) FROM valor_futbolista v WHERE v.futbolista_id = f.id) AS dias_guardados,
          (SELECT mg.nombre FROM historial_propiedad p JOIN managers mg ON mg.equipo_id = p.equipo_id
             WHERE p.futbolista_id = f.id AND p.hasta IS NULL LIMIT 1) AS propietario,
          (SELECT p.equipo_id FROM historial_propiedad p
             WHERE p.futbolista_id = f.id AND p.hasta IS NULL LIMIT 1) AS propietario_equipo
        FROM futbolistas f
        LEFT JOIN equipos eq ON eq.id = f.equipo_real_id
      ),
      conCambio AS (
        SELECT *,
          CASE WHEN valor_antes IS NULL THEN NULL ELSE valor - valor_antes END AS cambio,
          CASE WHEN valor_antes IS NULL OR valor_antes = 0 THEN NULL
               ELSE ROUND((valor - valor_antes) * 100.0 / valor_antes, 2) END AS cambio_porcentaje
        FROM base
      )
      SELECT * FROM conCambio f
      ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
      ORDER BY ${columna} IS NULL, ${columna} ${direccion}
      LIMIT ? OFFSET ?
    `;

    const filas = this.#db.prepare(consulta).all(`-${Number(dias)} days`, ...valores, limite, salto);

    const total = this.#db
      .prepare(`
        WITH base AS (
          SELECT f.id, f.nombre, f.posicion_id, f.equipo_real_id, f.estado,
            (SELECT p.equipo_id FROM historial_propiedad p WHERE p.futbolista_id = f.id AND p.hasta IS NULL LIMIT 1) AS propietario_equipo,
            (SELECT mg.nombre FROM historial_propiedad p JOIN managers mg ON mg.equipo_id = p.equipo_id
               WHERE p.futbolista_id = f.id AND p.hasta IS NULL LIMIT 1) AS propietario
          FROM futbolistas f
        )
        SELECT COUNT(*) AS n FROM base f ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
      `)
      .get(...valores).n;

    return { filas, total };
  }

  /** Busca futbolistas por nombre, para los buscadores de la web. */
  buscarFutbolistas(texto, limite = 25) {
    return this.#db
      .prepare(`
        SELECT f.id, f.nombre, f.posicion_id, f.equipo_real_id,
               (SELECT valor FROM valor_futbolista v WHERE v.futbolista_id = f.id ORDER BY fecha DESC LIMIT 1) AS valor,
               (SELECT COUNT(*) FROM valor_futbolista v WHERE v.futbolista_id = f.id) AS dias,
               (SELECT mg.nombre FROM historial_propiedad p JOIN managers mg ON mg.equipo_id = p.equipo_id
                WHERE p.futbolista_id = f.id AND p.hasta IS NULL LIMIT 1) AS propietario
        FROM futbolistas f
        WHERE f.nombre LIKE ? COLLATE NOCASE
        ORDER BY valor DESC
        LIMIT ?
      `)
      .all(`%${texto}%`, limite);
  }

  futbolista(id) {
    return this.#db.prepare('SELECT * FROM futbolistas WHERE id = ?').get(String(id)) || null;
  }

  // ---------- Catálogo y valores de mercado ----------

  guardarFutbolistas(futbolistas) {
    const sql = this.#db.prepare(`
      INSERT INTO futbolistas (id, nombre, posicion_id, equipo_real_id, estado, puntos_temporada, media, valor_actual, foto, actualizado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nombre = excluded.nombre,
        posicion_id = excluded.posicion_id,
        equipo_real_id = excluded.equipo_real_id,
        estado = excluded.estado,
        puntos_temporada = excluded.puntos_temporada,
        media = excluded.media,
        valor_actual = excluded.valor_actual,
        foto = COALESCE(excluded.foto, futbolistas.foto),
        actualizado_en = excluded.actualizado_en
    `);
    enTransaccion(this.#db, () => {
      for (const f of futbolistas) {
        sql.run(f.id, f.nombre, f.posicionId, f.equipoRealId, f.estado, f.puntos ?? null, f.media ?? null, f.valor ?? null, f.foto ?? null, ahora());
      }
    });
  }

  /**
   * Los que más suben y los que más bajan de valor entre dos días seguidos
   * con datos. Para los vídeos de la cuenta de Instagram.
   *
   * fecha: día a comparar (AAAA-MM-DD); por defecto, el último con datos.
   * Se compara con el día con datos inmediatamente anterior.
   * valorMaximo: solo futbolistas que valgan como mucho eso (para "subidas baratas").
   */
  rankingDeMercado({ fecha = null, limite = 5, valorMaximo = null, diasSerie = 7 } = {}) {
    const dia = fecha || this.#db.prepare('SELECT MAX(fecha) AS f FROM valor_futbolista').get().f;
    if (!dia) return { fecha: null, fechaAnterior: null, subidas: [], bajadas: [] };
    const anterior = this.#db.prepare('SELECT MAX(fecha) AS f FROM valor_futbolista WHERE fecha < ?').get(dia).f;
    if (!anterior) return { fecha: dia, fechaAnterior: null, subidas: [], bajadas: [] };

    const POSICIONES = { 1: 'portero', 2: 'defensa', 3: 'centrocampista', 4: 'delantero', 5: 'entrenador' };
    const consulta = (orden) =>
      this.#db
        .prepare(`
          SELECT f.id, f.nombre, f.posicion_id, f.estado, f.foto, f.puntos_temporada, f.media,
                 e.nombre AS equipo, e.escudo,
                 h.valor AS valor, a.valor AS valor_anterior, h.valor - a.valor AS variacion
          FROM valor_futbolista h
          JOIN valor_futbolista a ON a.futbolista_id = h.futbolista_id AND a.fecha = ?
          JOIN futbolistas f ON f.id = h.futbolista_id
          LEFT JOIN equipos e ON e.id = f.equipo_real_id
          WHERE h.fecha = ? AND h.valor IS NOT NULL AND a.valor IS NOT NULL
            AND f.posicion_id != 5
            AND (? IS NULL OR h.valor <= ?)
            AND h.valor - a.valor ${orden === 'DESC' ? '> 0' : '< 0'}
          ORDER BY variacion ${orden}
          LIMIT ?
        `)
        .all(anterior, dia, valorMaximo, valorMaximo, limite);

    const serie = this.#db.prepare(`
      SELECT fecha, valor FROM valor_futbolista
      WHERE futbolista_id = ? AND fecha <= ? AND valor IS NOT NULL
      ORDER BY fecha DESC LIMIT ?
    `);
    const preparar = (f) => ({
      id: f.id,
      nombre: f.nombre,
      posicion: POSICIONES[f.posicion_id] || null,
      estado: f.estado,
      foto: f.foto,
      equipo: f.equipo ? { nombre: f.equipo, escudo: f.escudo } : null,
      valor: f.valor,
      valorAnterior: f.valor_anterior,
      variacion: f.variacion,
      porcentaje: f.valor_anterior ? Math.round((f.variacion / f.valor_anterior) * 1000) / 10 : null,
      puntos: f.puntos_temporada,
      media: f.media,
      serie: serie.all(f.id, dia, diasSerie).reverse(),
    });

    return { fecha: dia, fechaAnterior: anterior, subidas: consulta('DESC').map(preparar), bajadas: consulta('ASC').map(preparar) };
  }

  // ---------- Estadísticas por jornada (para los vídeos) ----------

  /** Guarda lo que hizo un futbolista en cada jornada (de LectorFantasy.estadisticasDeTemporada). */
  guardarEstadisticas(futbolistaId, jornadas) {
    const sql = this.#db.prepare(`
      INSERT INTO estadistica_jornada (futbolista_id, jornada, puntos, minutos, goles, asistencias, ocasiones, entradas_area,
        paradas, goles_encajados, amarillas, rojas, once_ideal, estadisticas, actualizado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(futbolista_id, jornada) DO UPDATE SET
        puntos = excluded.puntos, minutos = excluded.minutos, goles = excluded.goles, asistencias = excluded.asistencias,
        ocasiones = excluded.ocasiones, entradas_area = excluded.entradas_area, paradas = excluded.paradas,
        goles_encajados = excluded.goles_encajados, amarillas = excluded.amarillas, rojas = excluded.rojas,
        once_ideal = excluded.once_ideal, estadisticas = excluded.estadisticas, actualizado_en = excluded.actualizado_en
    `);
    enTransaccion(this.#db, () => {
      for (const j of jornadas) {
        sql.run(String(futbolistaId), j.jornada, j.puntos, j.minutos, j.goles, j.asistencias, j.ocasiones, j.entradasArea,
          j.paradas, j.golesEncajados, j.amarillas, j.rojas, j.onceIdeal ? 1 : 0, j.bruto ? JSON.stringify(j.bruto) : null, ahora());
      }
    });
    this.#db.prepare('UPDATE futbolistas SET estadisticas_traidas_en = ? WHERE id = ?').run(ahora(), String(futbolistaId));
  }

  /** Futbolistas a los que hoy aún no se les han pedido las estadísticas. Se piden una vez al día. */
  futbolistasSinEstadisticas(limite = 20) {
    return this.#db
      .prepare(`
        SELECT id FROM futbolistas
        WHERE posicion_id != 5 AND (estadisticas_traidas_en IS NULL OR substr(estadisticas_traidas_en, 1, 10) < ?)
        ORDER BY estadisticas_traidas_en IS NOT NULL, valor_actual DESC LIMIT ?
      `)
      .all(hoy(), limite)
      .map((f) => f.id);
  }

  cuantosSinEstadisticas() {
    return this.#db
      .prepare('SELECT COUNT(*) AS n FROM futbolistas WHERE posicion_id != 5 AND (estadisticas_traidas_en IS NULL OR substr(estadisticas_traidas_en, 1, 10) < ?)')
      .get(hoy()).n;
  }

  /** Las últimas n jornadas con estadísticas guardadas, de la más nueva a la más vieja. */
  #jornadasRecientes(n) {
    return this.#db
      .prepare('SELECT DISTINCT jornada FROM estadistica_jornada WHERE minutos > 0 ORDER BY jornada DESC LIMIT ?')
      .all(n)
      .map((x) => x.jornada);
  }

  /** Ficha común de un futbolista para los vídeos: foto, equipo, precio y variación del último día. */
  #fichaParaVideo(id) {
    const f = this.#db
      .prepare(`
        SELECT f.id, f.nombre, f.posicion_id, f.estado, f.foto, f.valor_actual, f.puntos_temporada, f.media, f.equipo_real_id,
               e.nombre AS equipo, e.escudo
        FROM futbolistas f LEFT JOIN equipos e ON e.id = f.equipo_real_id WHERE f.id = ?
      `)
      .get(String(id));
    if (!f) return null;
    const ultimos = this.#db
      .prepare('SELECT valor FROM valor_futbolista WHERE futbolista_id = ? AND valor IS NOT NULL ORDER BY fecha DESC LIMIT 2')
      .all(String(id));
    const POSICIONES = { 1: 'portero', 2: 'defensa', 3: 'centrocampista', 4: 'delantero' };
    const valor = ultimos[0]?.valor ?? f.valor_actual;
    const anterior = ultimos[1]?.valor ?? valor;
    return {
      id: f.id,
      nombre: f.nombre,
      posicion: POSICIONES[f.posicion_id] || null,
      estado: f.estado,
      foto: f.foto,
      equipo: f.equipo ? { id: f.equipo_real_id, nombre: f.equipo, escudo: f.escudo } : null,
      valor,
      valorAnterior: anterior,
      variacion: valor != null && anterior != null ? valor - anterior : 0,
      porcentaje: anterior ? Math.round(((valor - anterior) / anterior) * 1000) / 10 : null,
      puntos: f.puntos_temporada,
      media: f.media,
    };
  }

  /**
   * Rankings de estadísticas para los vídeos. Devuelve los futbolistas con una métrica principal
   * (numero, etiqueta, corta) y detalles para las etiquetas de la tarjeta.
   *
   *   chollos:        valen 3 M o menos; más puntos por millón (mínimo 4 partidos y 250 minutos).
   *   infravalorados: valen entre 3 y 20 M; más puntos por partido jugado (mínimo 5 partidos).
   *   porteros:       más paradas en la temporada (mínimo 3 partidos).
   *   creadores:      más creación: 3 por asistencia + ocasiones creadas + media por entrada al área.
   *   en-forma:       más puntos en las tres últimas jornadas (mínimo 2 jugadas).
   */
  rankingDeEstadisticas({ tipo, limite = 5 }) {
    const temporada = this.#db
      .prepare(`
        SELECT s.futbolista_id AS id, f.posicion_id, f.valor_actual AS valor,
               SUM(s.minutos > 0) AS partidos, SUM(s.minutos) AS minutos, SUM(COALESCE(s.puntos, 0)) AS puntos,
               SUM(s.goles) AS goles, SUM(s.asistencias) AS asistencias, SUM(s.ocasiones) AS ocasiones,
               SUM(s.entradas_area) AS entradas, SUM(s.paradas) AS paradas,
               SUM(s.minutos >= 60 AND s.goles_encajados = 0) AS porterias_a_cero
        FROM estadistica_jornada s JOIN futbolistas f ON f.id = s.futbolista_id
        WHERE f.posicion_id != 5
        GROUP BY s.futbolista_id
      `)
      .all();
    const coma = (n, d = 1) => n.toFixed(d).replace('.', ',');
    const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
    let elegidos = [];

    if (tipo === 'chollos') {
      elegidos = temporada
        .filter((t) => t.valor && t.valor <= 3e6 && t.partidos >= 4 && t.minutos >= 250 && t.puntos > 0)
        .map((t) => ({ t, m: t.puntos / (t.valor / 1e6) }))
        .sort((a, b) => b.m - a.m)
        .map(({ t, m }) => ({
          id: t.id,
          metrica: { numero: coma(m), etiqueta: 'PUNTOS POR MILLÓN', corta: 'PTS/M' },
          detalles: [plural(t.puntos, 'PUNTO', 'PUNTOS'), plural(t.partidos, 'PARTIDO', 'PARTIDOS'), `${t.minutos} MIN`],
        }));
    } else if (tipo === 'infravalorados') {
      elegidos = temporada
        .filter((t) => t.valor && t.valor > 3e6 && t.valor <= 20e6 && t.partidos >= 5)
        .map((t) => ({ t, m: t.puntos / t.partidos }))
        .sort((a, b) => b.m - a.m)
        .map(({ t, m }) => ({
          id: t.id,
          metrica: { numero: coma(m), etiqueta: 'PUNTOS POR PARTIDO', corta: 'PTS/PART.' },
          detalles: [plural(t.puntos, 'PUNTO', 'PUNTOS'), plural(t.partidos, 'PARTIDO', 'PARTIDOS')],
        }));
    } else if (tipo === 'porteros') {
      elegidos = temporada
        .filter((t) => t.posicion_id === 1 && t.partidos >= 3)
        .sort((a, b) => b.paradas - a.paradas)
        .map((t) => ({
          id: t.id,
          metrica: { numero: String(t.paradas), etiqueta: 'PARADAS', corta: 'PARADAS' },
          detalles: [plural(t.porterias_a_cero, 'PORTERÍA A CERO', 'PORTERÍAS A CERO'), plural(t.partidos, 'PARTIDO', 'PARTIDOS')],
        }));
    } else if (tipo === 'creadores') {
      elegidos = temporada
        .filter((t) => t.partidos >= 3)
        .map((t) => ({ t, m: Math.round(3 * t.asistencias + t.ocasiones + 0.5 * t.entradas) }))
        .sort((a, b) => b.m - a.m)
        .map(({ t, m }) => ({
          id: t.id,
          metrica: { numero: String(m), etiqueta: 'DE CREACIÓN', corta: 'CREACIÓN' },
          detalles: [plural(t.asistencias, 'ASIST.', 'ASIST.'), plural(t.ocasiones, 'OCASIÓN', 'OCASIONES'), `${t.entradas} AL ÁREA`],
        }));
    } else if (tipo === 'en-forma') {
      const jornadas = this.#jornadasRecientes(3);
      if (jornadas.length === 0) return { tipo, jornadas, futbolistas: [] };
      const huecos = jornadas.map(() => '?').join(', ');
      const filas = this.#db
        .prepare(`
          SELECT s.futbolista_id AS id, SUM(COALESCE(s.puntos, 0)) AS puntos, SUM(s.minutos > 0) AS jugadas,
                 GROUP_CONCAT(s.jornada || ':' || COALESCE(s.puntos, 0)) AS desglose
          FROM estadistica_jornada s JOIN futbolistas f ON f.id = s.futbolista_id
          WHERE s.jornada IN (${huecos}) AND f.posicion_id != 5
          GROUP BY s.futbolista_id HAVING jugadas >= 2
          ORDER BY puntos DESC
        `)
        .all(...jornadas);
      elegidos = filas.map((t) => ({
        id: t.id,
        metrica: { numero: String(t.puntos), etiqueta: `PUNTOS EN ${jornadas.length} JORNADAS`, corta: 'PTS' },
        detalles: String(t.desglose)
          .split(',')
          .map((x) => x.split(':').map(Number))
          .sort((a, b) => a[0] - b[0])
          .map(([j, p]) => `J${j}: ${p}`),
      }));
    } else {
      throw new Error(`Tipo de ranking desconocido: ${tipo}`);
    }

    const futbolistas = [];
    for (const e of elegidos) {
      if (futbolistas.length >= limite) break;
      const ficha = this.#fichaParaVideo(e.id);
      if (ficha) futbolistas.push({ ...ficha, metrica: e.metrica, detalles: e.detalles });
    }
    return { tipo, jornadas: this.#jornadasRecientes(3), futbolistas };
  }

  /**
   * Datos de la previa de un partido: los últimos cinco resultados de cada equipo y los tres
   * futbolistas de los dos equipos con más puntos en las tres últimas jornadas.
   */
  previaDePartido(localId, visitanteId) {
    const forma = (equipoId) =>
      this.#db
        .prepare(`
          SELECT p.jornada, p.local_id, p.visitante_id, p.goles_local, p.goles_visitante,
                 el.nombre AS local, ev.nombre AS visitante
          FROM partidos p
          LEFT JOIN equipos el ON el.id = p.local_id LEFT JOIN equipos ev ON ev.id = p.visitante_id
          WHERE p.estado = 7 AND (p.local_id = ? OR p.visitante_id = ?)
          ORDER BY p.fecha DESC LIMIT 5
        `)
        .all(String(equipoId), String(equipoId))
        .map((p) => {
          const enCasa = String(p.local_id) === String(equipoId);
          const propios = enCasa ? p.goles_local : p.goles_visitante;
          const ajenos = enCasa ? p.goles_visitante : p.goles_local;
          return {
            jornada: p.jornada,
            rival: enCasa ? p.visitante : p.local,
            enCasa,
            marcador: `${p.goles_local}-${p.goles_visitante}`,
            resultado: propios > ajenos ? 'V' : propios < ajenos ? 'D' : 'E',
          };
        });

    const jornadas = this.#jornadasRecientes(3);
    const huecos = jornadas.map(() => '?').join(', ') || 'NULL';
    const vigilar = this.#db
      .prepare(`
        SELECT s.futbolista_id AS id, SUM(COALESCE(s.puntos, 0)) AS puntos,
               GROUP_CONCAT(s.jornada || ':' || COALESCE(s.puntos, 0)) AS desglose
        FROM estadistica_jornada s JOIN futbolistas f ON f.id = s.futbolista_id
        WHERE s.jornada IN (${huecos}) AND f.equipo_real_id IN (?, ?) AND f.posicion_id != 5
        GROUP BY s.futbolista_id ORDER BY puntos DESC LIMIT 3
      `)
      .all(...jornadas, String(localId), String(visitanteId))
      .map((t) => ({
        ...this.#fichaParaVideo(t.id),
        metrica: { numero: String(t.puntos), etiqueta: `PUNTOS EN ${jornadas.length} JORNADAS`, corta: 'PTS' },
        detalles: String(t.desglose)
          .split(',')
          .map((x) => x.split(':').map(Number))
          .sort((a, b) => a[0] - b[0])
          .map(([j, p]) => `J${j}: ${p}`),
      }));

    return { formaLocal: forma(localId), formaVisitante: forma(visitanteId), vigilar };
  }

  /** Futbolistas que un manager tiene ahora mismo y no están en condiciones de jugar. */
  futbolistasConProblema(equipoId, estados = ['injured', 'suspended', 'doubtful']) {
    const huecos = estados.map(() => '?').join(', ');
    return this.#db
      .prepare(`
        SELECT f.id, f.nombre, f.estado, f.posicion_id
        FROM historial_propiedad p JOIN futbolistas f ON f.id = p.futbolista_id
        WHERE p.equipo_id = ? AND p.hasta IS NULL AND f.estado IN (${huecos})
      `)
      .all(String(equipoId), ...estados);
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

  /**
   * Guarda la serie completa de valor de un futbolista.
   *
   * Fantasy devuelve todos los días de la temporada de una vez, así que no
   * hay que acumularla poco a poco.
   */
  guardarHistoricoDeValor(futbolistaId, entradas) {
    const sql = this.#db.prepare(`
      INSERT INTO valor_futbolista (fecha, futbolista_id, valor, pujas)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(fecha, futbolista_id) DO UPDATE SET
        valor = excluded.valor,
        pujas = COALESCE(excluded.pujas, valor_futbolista.pujas)
    `);
    enTransaccion(this.#db, () => {
      for (const e of entradas) sql.run(e.fecha, String(futbolistaId), e.valor, e.pujas ?? null);
    });
    return entradas.length;
  }

  /**
   * Futbolistas a los que todavía no se les ha pedido la serie de precios.
   *
   * Se mira una marca propia, no cuántas filas tienen: un futbolista que
   * lleva pocos días en la competición tiene una serie corta de verdad, y
   * contando filas volvía a salir como pendiente en cada tanda.
   */
  futbolistasSinHistorico(limite = 60) {
    return this.#db
      .prepare(`SELECT f.id FROM futbolistas f WHERE ${SIN_HISTORICO} LIMIT ?`)
      .all(...fechasHueco(), limite)
      .map((f) => f.id);
  }

  cuantosSinHistorico() {
    return this.#db.prepare(`SELECT COUNT(*) AS n FROM futbolistas f WHERE ${SIN_HISTORICO}`).get(...fechasHueco()).n;
  }

  marcarHistoricoTraido(futbolistaId) {
    this.#db.prepare('UPDATE futbolistas SET historico_traido_en = ? WHERE id = ?').run(ahora(), String(futbolistaId));
  }

  hayValoresDe(fecha) {
    return Boolean(this.#db.prepare('SELECT 1 FROM valor_futbolista WHERE fecha = ? LIMIT 1').get(fecha));
  }

  serieDeValor(futbolistaId) {
    return this.#db
      .prepare('SELECT fecha, valor, pujas, puntos, media FROM valor_futbolista WHERE futbolista_id = ? ORDER BY fecha')
      .all(String(futbolistaId));
  }

  // ---------- Equipos reales ----------

  guardarEquipos(equipos) {
    const sql = this.#db.prepare(`
      INSERT INTO equipos (id, nombre, escudo, actualizado_en) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, escudo = excluded.escudo, actualizado_en = excluded.actualizado_en
    `);
    enTransaccion(this.#db, () => {
      for (const e of equipos) sql.run(e.id, e.nombre, e.escudo, ahora());
    });
  }

  equipos() {
    return this.#db.prepare('SELECT * FROM equipos ORDER BY nombre').all();
  }

  hayEquipos() {
    return Boolean(this.#db.prepare('SELECT 1 FROM equipos LIMIT 1').get());
  }

  // ---------- Partidos ----------

  /**
   * Guarda los partidos de una jornada.
   *
   * `finalizado_en` se escribe una sola vez, cuando el partido pasa a
   * finalizado. No puede usarse `actualizado_en` para eso: cambia en cada
   * lectura, así que nunca cumpliría la espera de quince minutos.
   */
  guardarPartidos(partidos, jornada, estadoFinalizado, { historico = false } = {}) {
    const sql = this.#db.prepare(`
      INSERT INTO partidos (id, jornada, fecha, local_id, visitante_id, estado, goles_local, goles_visitante, actualizado_en, finalizado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        estado = excluded.estado,
        goles_local = excluded.goles_local,
        goles_visitante = excluded.goles_visitante,
        actualizado_en = excluded.actualizado_en,
        finalizado_en = COALESCE(partidos.finalizado_en, excluded.finalizado_en)
    `);
    const cambios = [];
    enTransaccion(this.#db, () => {
      for (const p of partidos) {
        const previo = this.#db
          .prepare('SELECT estado, goles_local, goles_visitante, finalizado_en FROM partidos WHERE id = ?')
          .get(p.id);
        // Al rellenar jornadas pasadas (historico), la hora de final es la del partido, no la de ahora:
        // si no, el bot los tomaría por recién terminados y mandaría su resumen al grupo.
        const finalizadoAhora = historico ? p.fecha : ahora();
        const finalizado = p.estadoBruto === estadoFinalizado ? previo?.finalizado_en || finalizadoAhora : previo?.finalizado_en || null;
        sql.run(p.id, jornada, p.fecha, p.localId, p.visitanteId, p.estadoBruto, p.golesLocal, p.golesVisitante, ahora(), finalizado);
        if (previo && previo.estado !== p.estadoBruto) {
          cambios.push({ partidoId: p.id, estadoAntes: previo.estado, estadoAhora: p.estadoBruto });
        }
      }
    });
    return cambios;
  }

  /** Partidos que terminaron hace menos del margen indicado. */
  partidosReciénTerminados(jornada, estadoFinalizado, desde) {
    return this.#db
      .prepare('SELECT * FROM partidos WHERE jornada = ? AND estado = ? AND finalizado_en IS NOT NULL AND finalizado_en >= ?')
      .all(jornada, estadoFinalizado, desde);
  }

  partidosDeLaJornada(jornada) {
    return this.#db.prepare('SELECT * FROM partidos WHERE jornada = ? ORDER BY fecha').all(jornada);
  }

  /**
   * Partidos que ya pueden resumirse.
   *
   * El límite inferior evita mandar resúmenes viejos. Sin él, un partido que
   * lleva días terminado y nunca se resumió, porque el bot estuvo parado o
   * porque Telegram no estaba configurado, saldría de golpe como si acabara
   * de acabar.
   */
  partidosPendientesDeResumen(jornada, estadoFinalizado, antesDe, desde) {
    return this.#db
      .prepare(`
        SELECT * FROM partidos
        WHERE jornada = ? AND estado = ? AND resumen_enviado_en IS NULL
          AND finalizado_en IS NOT NULL AND finalizado_en <= ? AND finalizado_en >= ?
      `)
      .all(jornada, estadoFinalizado, antesDe, desde);
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

  // ---------- Grupos de Telegram ----------

  /**
   * Anota un grupo en el que se ha visto al bot.
   *
   * Sirve para que el administrador elija el grupo con un clic en vez de
   * buscar su identificador a mano, que es lo más incómodo de configurar un
   * bot de Telegram.
   */
  anotarGrupo({ chatId, titulo, tipo }) {
    this.#db
      .prepare(`
        INSERT INTO grupos_vistos (chat_id, titulo, tipo, visto_en) VALUES (?, ?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET titulo = excluded.titulo, visto_en = excluded.visto_en
      `)
      .run(String(chatId), titulo ?? null, tipo ?? null, ahora());
  }

  gruposVistos() {
    return this.#db.prepare('SELECT * FROM grupos_vistos ORDER BY visto_en DESC').all();
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
