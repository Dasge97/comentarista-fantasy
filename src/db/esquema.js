/**
 * Esquema de la base de datos.
 *
 * Hay dos clases de tabla. Las de estado guardan la última lectura válida y
 * se actualizan. Las de histórico solo reciben filas nuevas: nunca se
 * actualiza ni se borra una fila existente, porque el usuario quiere el
 * archivo completo para funciones de mercado futuras.
 *
 * Cada migración es una entrada de la lista. Para cambiar el esquema se
 * añade una entrada nueva al final; nunca se edita una anterior.
 */
export const MIGRACIONES = [
  {
    nombre: '001-inicial',
    sql: `
      -- ============ ESTADO ============

      -- Managers de la liga. Se refresca desde la API.
      CREATE TABLE managers (
        manager_id    TEXT PRIMARY KEY,
        equipo_id     TEXT NOT NULL UNIQUE,
        nombre        TEXT NOT NULL,
        es_servicio   INTEGER NOT NULL DEFAULT 0,
        actualizado_en TEXT NOT NULL
      );

      -- Qué usuario de Telegram es qué manager. Lo elige el propio amigo.
      CREATE TABLE vinculaciones (
        telegram_id   TEXT PRIMARY KEY,
        manager_id    TEXT NOT NULL UNIQUE,
        nombre_telegram TEXT,
        creada_en     TEXT NOT NULL,
        FOREIGN KEY (manager_id) REFERENCES managers(manager_id)
      );

      -- Quién puede entrar en la web. Solo el administrador da altas.
      CREATE TABLE usuarios (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id   TEXT UNIQUE,
        manager_id    TEXT UNIQUE,
        nombre        TEXT NOT NULL,
        rol           TEXT NOT NULL CHECK (rol IN ('administrador', 'participante')),
        activo        INTEGER NOT NULL DEFAULT 1,
        creado_en     TEXT NOT NULL
      );

      -- Códigos de un solo uso que reparte el bot para entrar en la web.
      CREATE TABLE codigos_acceso (
        codigo        TEXT PRIMARY KEY,
        usuario_id    INTEGER NOT NULL,
        caduca_en     TEXT NOT NULL,
        usado_en      TEXT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      -- Sesiones abiertas en la web.
      CREATE TABLE sesiones_web (
        token         TEXT PRIMARY KEY,
        usuario_id    INTEGER NOT NULL,
        creada_en     TEXT NOT NULL,
        caduca_en     TEXT NOT NULL,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      -- Ajustes y claves. Las claves se guardan cifradas.
      CREATE TABLE configuracion (
        clave         TEXT PRIMARY KEY,
        valor         TEXT,
        es_secreto    INTEGER NOT NULL DEFAULT 0,
        actualizado_en TEXT NOT NULL
      );

      -- Última lectura válida de cada futbolista alineado.
      -- estadisticas es el objeto de Fantasy en JSON.
      -- puntos puede ser NULL: significa que no hay dato de esa jornada,
      -- que no es lo mismo que cero.
      CREATE TABLE estado_jugador (
        jornada       INTEGER NOT NULL,
        equipo_id     TEXT NOT NULL,
        futbolista_id TEXT NOT NULL,
        puntos        INTEGER,
        estadisticas  TEXT,
        observado_en  TEXT NOT NULL,
        PRIMARY KEY (jornada, equipo_id, futbolista_id)
      );

      -- Última lectura válida de cada manager.
      CREATE TABLE estado_manager (
        jornada           INTEGER NOT NULL,
        equipo_id         TEXT NOT NULL,
        puntos_jornada    INTEGER,
        puntos_generales  INTEGER,
        posicion          INTEGER,
        observado_en      TEXT NOT NULL,
        PRIMARY KEY (jornada, equipo_id)
      );

      -- Cambios de puesto detectados que aún no se han publicado.
      -- Se exige verlos repetidos varias lecturas porque la puntuación
      -- sube y baja durante el partido.
      CREATE TABLE candidatos_posicion (
        clave         TEXT PRIMARY KEY,
        equipo_id     TEXT NOT NULL,
        posicion      INTEGER NOT NULL,
        posicion_previa INTEGER NOT NULL,
        veces         INTEGER NOT NULL DEFAULT 1,
        primera_vez   TEXT NOT NULL,
        ultima_vez    TEXT NOT NULL
      );

      -- Qué se ha publicado ya. Evita repetir tras un reinicio.
      CREATE TABLE mensajes_enviados (
        clave         TEXT PRIMARY KEY,
        destino       TEXT NOT NULL,
        texto         TEXT,
        enviado_en    TEXT NOT NULL
      );

      -- ============ HISTÓRICO ============

      CREATE TABLE historial_jugador (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        jornada       INTEGER NOT NULL,
        equipo_id     TEXT NOT NULL,
        futbolista_id TEXT NOT NULL,
        puntos        INTEGER,
        estadisticas  TEXT,
        observado_en  TEXT NOT NULL
      );
      CREATE INDEX idx_hist_jugador ON historial_jugador (futbolista_id, jornada);
      CREATE INDEX idx_hist_jugador_equipo ON historial_jugador (equipo_id, jornada);

      CREATE TABLE historial_manager (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        jornada           INTEGER NOT NULL,
        equipo_id         TEXT NOT NULL,
        puntos_jornada    INTEGER,
        puntos_generales  INTEGER,
        posicion          INTEGER,
        observado_en      TEXT NOT NULL
      );
      CREATE INDEX idx_hist_manager ON historial_manager (equipo_id, jornada);

      -- Quién tenía a cada futbolista y desde cuándo.
      -- hasta es NULL mientras lo sigue teniendo.
      CREATE TABLE historial_propiedad (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        futbolista_id TEXT NOT NULL,
        equipo_id     TEXT NOT NULL,
        desde         TEXT NOT NULL,
        hasta         TEXT
      );
      CREATE INDEX idx_propiedad_futbolista ON historial_propiedad (futbolista_id);
      CREATE INDEX idx_propiedad_abierta ON historial_propiedad (equipo_id, hasta);

      -- Registro oficial de movimientos de la liga, copiado tal cual.
      CREATE TABLE actividad (
        id            TEXT PRIMARY KEY,
        tipo          INTEGER NOT NULL,
        manager_id    TEXT,
        futbolista_id TEXT,
        importe       INTEGER,
        fecha         TEXT NOT NULL,
        registrada_en TEXT NOT NULL
      );
      CREATE INDEX idx_actividad_fecha ON actividad (fecha);
      CREATE INDEX idx_actividad_manager ON actividad (manager_id, fecha);

      CREATE TABLE historial_mercado (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        entrada_id    TEXT NOT NULL,
        futbolista_id TEXT NOT NULL,
        precio        INTEGER,
        expira        TEXT,
        estado        TEXT,
        pujas         INTEGER,
        observado_en  TEXT NOT NULL
      );
      CREATE INDEX idx_mercado_entrada ON historial_mercado (entrada_id);

      -- Una fila diaria por futbolista, aunque el valor no cambie.
      -- Una serie de precios con huecos es más difícil de usar.
      CREATE TABLE valor_futbolista (
        fecha         TEXT NOT NULL,
        futbolista_id TEXT NOT NULL,
        valor         INTEGER,
        puntos        INTEGER,
        media         REAL,
        PRIMARY KEY (fecha, futbolista_id)
      );

      -- Catálogo de futbolistas de la competición.
      CREATE TABLE futbolistas (
        id              TEXT PRIMARY KEY,
        nombre          TEXT NOT NULL,
        posicion_id     INTEGER,
        equipo_real_id  TEXT,
        estado          TEXT,
        actualizado_en  TEXT NOT NULL
      );

      -- Partidos, para saber cuándo hay que sondear.
      CREATE TABLE partidos (
        id            TEXT PRIMARY KEY,
        jornada       INTEGER NOT NULL,
        fecha         TEXT NOT NULL,
        local_id      TEXT,
        visitante_id  TEXT,
        estado        INTEGER,
        goles_local   INTEGER,
        goles_visitante INTEGER,
        resumen_enviado_en TEXT,
        actualizado_en TEXT NOT NULL
      );
      CREATE INDEX idx_partidos_jornada ON partidos (jornada);

      -- Registro de incidencias, para verlas desde la web.
      CREATE TABLE incidencias (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        nivel         TEXT NOT NULL,
        origen        TEXT NOT NULL,
        mensaje       TEXT NOT NULL,
        ocurrida_en   TEXT NOT NULL
      );
      CREATE INDEX idx_incidencias_fecha ON incidencias (ocurrida_en);
    `,
  },
  {
    // En una compra a otro manager hay dos partes: quien paga y quien cobra.
    // El registro de actividad trae los dos, y el cálculo del dinero necesita
    // el segundo para abonarle la venta.
    nombre: '002-segundo-manager-en-actividad',
    sql: `
      ALTER TABLE actividad ADD COLUMN manager2_id TEXT;
      ALTER TABLE actividad ADD COLUMN jornada INTEGER;
    `,
  },
];
