import { ACTUACIONES, HECHOS, NOMBRE_HECHO } from '../fantasy/normalizar.js';

/**
 * Convierte diferencias entre dos lecturas en hechos narrables.
 *
 * Son funciones puras: reciben datos y devuelven datos. No leen la base de
 * datos, no envían nada y no dependen de la hora.
 */

/** Lee un contador de estadística tratando la ausencia como cero contadas veces. */
function contador(estadisticas, clave) {
  if (!estadisticas) return 0;
  const valor = estadisticas[clave];
  return Number.isFinite(valor) ? valor : 0;
}

/**
 * Hechos nuevos de un futbolista, comparando dos lecturas.
 *
 * La primera lectura de un futbolista no genera hechos. Es la referencia:
 * si el bot arranca a mitad de partido, no debe anunciar como recién
 * ocurridos los goles que ya llevaban una hora marcados.
 *
 * Si un contador baja, es una corrección de Fantasy. Se devuelve como
 * rectificación, no como acontecimiento nuevo.
 */
export function hechosDeJugador(cambio) {
  if (!cambio || cambio.esPrimeraLectura) return [];

  const antes = cambio.antes?.estadisticas || null;
  const despues = cambio.ahora?.estadisticas || null;
  if (!despues) return [];

  const hechos = [];
  for (const clave of HECHOS) {
    const previo = contador(antes, clave);
    const actual = contador(despues, clave);
    if (actual === previo) continue;

    if (actual > previo) {
      // Un contador puede subir de más de uno en una sola lectura si el
      // futbolista marca dos veces entre dos consultas. Se emite un hecho
      // por cada ocurrencia, numerada, para que la clave no se repita.
      for (let n = previo + 1; n <= actual; n += 1) {
        hechos.push({
          tipo: clave,
          nombre: NOMBRE_HECHO[clave],
          ocurrencia: n,
          rectificacion: false,
          jornada: cambio.jornada,
          equipoId: cambio.equipoId,
          futbolistaId: cambio.futbolistaId,
          clave: `${clave}:${cambio.jornada}:${cambio.futbolistaId}:${n}`,
        });
      }
    } else {
      hechos.push({
        tipo: clave,
        nombre: NOMBRE_HECHO[clave],
        ocurrencia: actual,
        rectificacion: true,
        jornada: cambio.jornada,
        equipoId: cambio.equipoId,
        futbolistaId: cambio.futbolistaId,
        clave: `rect:${clave}:${cambio.jornada}:${cambio.futbolistaId}:${previo}->${actual}`,
      });
    }
  }
  return hechos;
}

/**
 * Actuaciones que merecen aviso aunque no sean un gol.
 *
 * No hay que inventarse cuántas paradas son muchas: Fantasy dice cuántos
 * puntos aporta cada estadística, así que se avisa cuando una sola pasa del
 * umbral. Con umbral 3 salen las cosas de verdad buenas: en tres jornadas de
 * la liga, 3 puntos por paradas se vio dos veces y 3 o más por despejes,
 * siete. Con umbral 1 saldrían decenas.
 *
 * @param {object} jugador Futbolista tal como lo devuelve la alineación.
 * @param {number} umbral Puntos mínimos que debe aportar una estadística.
 */
export function actuacionesDestacadas(jugador, umbral) {
  const puntos = jugador?.puntosEstadisticas;
  const cantidades = jugador?.estadisticas;
  if (!puntos || !cantidades) return [];

  const salida = [];
  for (const [clave, nombre] of Object.entries(ACTUACIONES)) {
    const aporta = Number(puntos[clave] ?? 0);
    if (aporta < umbral) continue;
    salida.push({
      tipo: clave,
      nombre,
      cuantas: Number(cantidades[clave] ?? 0),
      puntosQueAporta: aporta,
    });
  }
  return salida;
}

/**
 * Adelantamientos entre dos clasificaciones.
 *
 * Devuelve una entrada por cada pareja que ha intercambiado el orden.
 * Un solo gol puede producir varios adelantamientos a la vez, así que el
 * publicador debe agruparlos antes de escribir en el grupo.
 */
export function adelantamientos(antes, despues) {
  const posicionAntes = new Map(antes.map((f) => [f.equipoId, f.posicion]));
  const salida = [];

  for (let i = 0; i < despues.length; i += 1) {
    for (let j = 0; j < despues.length; j += 1) {
      if (i === j) continue;
      const a = despues[i];
      const b = despues[j];
      const antesA = posicionAntes.get(a.equipoId);
      const antesB = posicionAntes.get(b.equipoId);
      if (antesA == null || antesB == null) continue;
      // a estaba por detrás de b y ahora está por delante.
      if (antesA > antesB && a.posicion < b.posicion) {
        salida.push({
          adelanta: a.equipoId,
          adelantado: b.equipoId,
          posicionNueva: a.posicion,
          puntosAdelanta: a.puntos,
          puntosAdelantado: b.puntos,
          clave: `adelanta:${a.equipoId}>${b.equipoId}`,
        });
      }
    }
  }
  return salida;
}

/**
 * Qué futbolistas han hecho variar los puntos de un equipo desde la última
 * situación estable. Sirve para explicar por qué se ha producido un
 * adelantamiento en vez de suponerlo.
 */
export function culpables(cambiosDeJugador, equipoId) {
  return cambiosDeJugador
    .filter((c) => c && c.equipoId === String(equipoId) && !c.esPrimeraLectura)
    .map((c) => ({
      futbolistaId: c.futbolistaId,
      antes: c.antes?.puntos ?? null,
      ahora: c.ahora?.puntos ?? null,
      diferencia: (c.ahora?.puntos ?? 0) - (c.antes?.puntos ?? 0),
      hechos: hechosDeJugador(c).filter((h) => !h.rectificacion),
    }))
    .filter((c) => c.diferencia !== 0 || c.hechos.length > 0)
    .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
}

/**
 * Resumen de lo que han hecho los futbolistas de un manager en un partido.
 *
 * Se construye con los futbolistas del once que juegan en ese partido, no
 * restando totales antes y después. Restar totales daría datos falsos
 * cuando hay varios partidos a la vez.
 */
export function resumenDePartido({ alineacion, equiposDelPartido, jornada }) {
  const enElPartido = alineacion.jugadores.filter((j) => equiposDelPartido.includes(j.equipoRealId));
  if (enElPartido.length === 0) return null;

  const conDato = enElPartido.filter((j) => j.puntos !== null);
  return {
    jornada,
    equipoId: alineacion.equipoId,
    // Solo se suman los futbolistas de este partido. Es la aportación del
    // partido, no el total del manager.
    aportacion: conDato.reduce((suma, j) => suma + j.puntos, 0),
    jugadores: enElPartido.map((j) => ({
      futbolistaId: j.id,
      nombre: j.nombre,
      posicion: j.posicion,
      puntos: j.puntos,
      hechos: HECHOS.filter((clave) => contador(j.estadisticas, clave) > 0).map((clave) => ({
        tipo: clave,
        nombre: NOMBRE_HECHO[clave],
        veces: contador(j.estadisticas, clave),
      })),
      goleEncajados: contador(j.estadisticas, 'goals_conceded'),
      minutos: contador(j.estadisticas, 'mins_played'),
      amarillas: contador(j.estadisticas, 'yellow_card'),
      rojas: contador(j.estadisticas, 'red_card') + contador(j.estadisticas, 'second_yellow_card'),
    })),
    sinDato: enElPartido.length - conDato.length,
  };
}
