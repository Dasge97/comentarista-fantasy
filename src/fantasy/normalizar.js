// Las estadísticas que Fantasy devuelve por futbolista y jornada.
// Cada una llega como pareja [cantidad, puntos que aporta].
// Los cinco primeros son los hechos que el bot avisa por privado.
export const HECHOS = [
  'goals',
  'goal_assist',
  'penalty_save',
  'penalty_won',
  'penalty_failed',
  'red_card',
  'second_yellow_card',
  'own_goals',
];

export const NOMBRE_HECHO = {
  goals: 'gol',
  goal_assist: 'asistencia',
  penalty_save: 'penalti parado',
  penalty_won: 'penalti provocado',
  penalty_failed: 'penalti fallado',
  red_card: 'roja',
  second_yellow_card: 'doble amarilla',
  own_goals: 'gol en propia',
};

const LINEAS = ['goalkeeper', 'defender', 'midfield', 'striker'];

const POSICIONES = {
  1: 'portero',
  2: 'defensa',
  3: 'centrocampista',
  4: 'delantero',
  5: 'entrenador',
};

/** Convierte {clave: [cantidad, puntos]} en {clave: cantidad}. */
function cantidades(estadisticas) {
  const salida = {};
  for (const [clave, valor] of Object.entries(estadisticas || {})) {
    salida[clave] = Array.isArray(valor) ? Number(valor[0]) : Number(valor);
  }
  return salida;
}

/**
 * Saca los datos de una jornada concreta del histórico de un futbolista.
 *
 * Devuelve null cuando no hay entrada para esa jornada. Ausencia y cero son
 * cosas distintas: un futbolista que no jugó no tiene entrada, y un
 * futbolista que jugó mal tiene entrada con totalPoints igual a cero.
 */
function jornadaDelFutbolista(playerMaster, jornada) {
  const entrada = (playerMaster?.lastStats || []).find((s) => Number(s.weekNumber) === Number(jornada));
  if (!entrada) return null;
  return {
    puntos: Number(entrada.totalPoints),
    estadisticas: cantidades(entrada.stats),
    enOnceIdeal: Boolean(entrada.isInIdealFormation),
  };
}

function futbolista(entrada, jornada) {
  const maestro = entrada.playerMaster || entrada;
  const datos = jornadaDelFutbolista(maestro, jornada);
  return {
    id: String(maestro.id),
    nombre: maestro.nickname || maestro.name,
    posicion: POSICIONES[maestro.positionId] || String(maestro.positionId),
    equipoRealId: maestro.teamId != null ? String(maestro.teamId) : null,
    equipoRealNombre: maestro.team?.name || null,
    // null significa que no hay dato de esa jornada. Nunca se convierte a cero.
    puntos: datos ? datos.puntos : null,
    estadisticas: datos ? datos.estadisticas : null,
    enOnceIdeal: datos ? datos.enOnceIdeal : null,
  };
}

/**
 * Normaliza la alineación de un equipo en una jornada.
 *
 * El campo `puntos` es el que da Fantasy y es el bueno. No hay que sumar
 * las puntuaciones de los futbolistas: un manager que alinea menos de once
 * recibe cero aunque sus futbolistas hayan puntuado. Se observó el
 * 5 de septiembre de 2026 con un once de nueve futbolistas que sumaban 49
 * y al que Fantasy adjudicó cero.
 */
export function normalizarAlineacion(respuesta, { equipoId, jornada }) {
  if (!respuesta) return null;

  const formacion = respuesta.formation || {};
  const jugadores = [];
  for (const linea of LINEAS) {
    for (const entrada of formacion[linea] || []) {
      jugadores.push({ ...futbolista(entrada, jornada), linea });
    }
  }

  return {
    equipoId: String(equipoId),
    jornada: Number(jornada),
    puntos: respuesta.points != null ? Number(respuesta.points) : null,
    tactica: Array.isArray(formacion.tacticalFormation) ? formacion.tacticalFormation.join('-') : null,
    onceCompleto: jugadores.length === 11,
    jugadores,
    observadoEn: new Date().toISOString(),
  };
}

/**
 * Normaliza la clasificación general de la liga.
 *
 * `points` ya incluye `livePoints`, comprobado el 5 de septiembre de 2026:
 * en los seis managers que tenían los dos campos se cumplía
 * teamPoints + livePoints = points. No hay que sumar la jornada otra vez.
 *
 * `livePoints` desaparece del objeto cuando vale cero, así que se lee como
 * null y no como cero.
 */
export function normalizarClasificacion(respuesta) {
  return (respuesta || []).map((fila) => ({
    posicion: Number(fila.position),
    posicionAnterior: fila.previousPosition != null ? Number(fila.previousPosition) : null,
    puntos: Number(fila.points),
    puntosJornada: fila.livePoints != null ? Number(fila.livePoints) : null,
    puntosAcumulados: fila.team?.teamPoints != null ? Number(fila.team.teamPoints) : null,
    equipoId: String(fila.team?.id),
    managerId: String(fila.team?.managerId ?? fila.team?.manager?.id),
    managerNombre: fila.team?.manager?.managerName || null,
    // Lo que valen sus futbolistas. Se lee de rivales, al contrario que el dinero.
    valorEquipo: fila.team?.teamValue != null ? Number(fila.team.teamValue) : null,
    observadoEn: new Date().toISOString(),
  }));
}

/** Normaliza la clasificación de una jornada concreta. Aquí `points` es solo esa jornada. */
export function normalizarClasificacionJornada(respuesta) {
  return (respuesta || []).map((fila) => ({
    posicion: Number(fila.position),
    puntos: Number(fila.points),
    equipoId: String(fila.team?.id),
    managerId: String(fila.team?.managerId ?? fila.team?.manager?.id),
    managerNombre: fila.team?.manager?.managerName || null,
  }));
}

// Estados de partido observados el 5 de septiembre de 2026.
// El 3 y el 4 aparecieron los dos con el partido en juego.
const ESTADOS_PARTIDO = {
  1: 'sin empezar',
  3: 'en juego',
  4: 'en juego',
  7: 'finalizado',
};

export function normalizarCalendario(respuesta) {
  return (respuesta || []).map((partido) => ({
    id: String(partido.id),
    fecha: partido.matchDate,
    localId: String(partido.localId),
    visitanteId: String(partido.visitorId),
    estadoBruto: Number(partido.matchState),
    estado: ESTADOS_PARTIDO[partido.matchState] || 'desconocido',
    // El marcador llega como null antes del comienzo. Se conserva null.
    golesLocal: partido.localScore != null ? Number(partido.localScore) : null,
    golesVisitante: partido.visitorScore != null ? Number(partido.visitorScore) : null,
  }));
}

export function normalizarLiga(liga) {
  const premium = liga.config?.premiumFeatures || {};
  return {
    id: String(liga.id),
    nombre: liga.name,
    managers: Number(liga.managersNumber),
    equipoPropioId: liga.team?.id != null ? String(liga.team.id) : null,
    reglas: {
      clausula: Boolean(liga.config?.features?.buyoutClause),
      capitan: Boolean(premium.captain),
      banquillo: Boolean(premium.bench),
      formaciones: Boolean(premium.formations),
      entrenador: Boolean(premium.coach),
    },
  };
}
