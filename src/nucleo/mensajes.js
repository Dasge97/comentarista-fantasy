/**
 * Textos de los mensajes.
 *
 * Los privados se escriben con plantillas: son avisos de hechos y lo que
 * importa es que lleguen rápido y sean exactos. El comentario del grupo lo
 * redacta el modelo de lenguaje, y estas plantillas son su respaldo.
 */

const EMOJI = {
  goals: '⚽',
  goal_assist: '🅰️',
  penalty_save: '🧤',
  penalty_won: '🎯',
  penalty_failed: '❌',
};

const escapar = (texto) =>
  String(texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Aviso privado de un hecho de un futbolista propio. */
export function avisoDeHecho({ hecho, futbolista, puntos }) {
  const nombre = escapar(futbolista);
  const icono = EMOJI[hecho.tipo] || '📣';

  if (hecho.rectificacion) {
    return `↩️ Corrección: a <b>${nombre}</b> le han quitado ${hecho.nombre === 'gol' ? 'el gol' : `la ${hecho.nombre}`}. Lo tienes en tu once.`;
  }

  const frases = {
    goals: `${icono} <b>${nombre}</b> ha marcado. Lo tienes en tu once.`,
    goal_assist: `${icono} <b>${nombre}</b> ha dado una asistencia. Lo tienes en tu once.`,
    penalty_save: `${icono} <b>${nombre}</b> ha parado un penalti. Lo tienes en tu once.`,
    penalty_won: `${icono} <b>${nombre}</b> ha provocado un penalti. Lo tienes en tu once.`,
    penalty_failed: `${icono} <b>${nombre}</b> ha fallado un penalti. Lo tienes en tu once.`,
  };

  const base = frases[hecho.tipo] || `${icono} <b>${nombre}</b>: ${escapar(hecho.nombre)}.`;
  const cola = puntos != null ? `\nVa por ${puntos} puntos en esta jornada. Provisional.` : '';
  return base + cola;
}

/** Resumen privado de lo que han hecho tus futbolistas en un partido. */
export function resumenPrivadoDePartido({ resumen, marcador, equipos }) {
  const cabecera = `📊 <b>Final del partido</b>${marcador ? ` · ${escapar(marcador)}` : ''}`;
  const lineas = resumen.jugadores
    .slice()
    .sort((a, b) => (b.puntos ?? -99) - (a.puntos ?? -99))
    .map((j) => {
      const puntos = j.puntos == null ? 'sin dato' : `${j.puntos} pts`;
      const extras = [];
      for (const h of j.hechos) extras.push(h.veces > 1 ? `${h.veces} ${h.nombre}s` : h.nombre);
      if (j.rojas > 0) extras.push('expulsado');
      else if (j.amarillas > 0) extras.push('amarilla');
      if (j.minutos === 0) extras.push('no jugó');
      const detalle = extras.length ? ` — ${extras.join(', ')}` : '';
      return `· ${escapar(j.nombre)}: ${puntos}${detalle}`;
    });

  const cola =
    resumen.sinDato > 0
      ? `\n\n${resumen.sinDato} de tus futbolistas todavía no tienen dato. La puntuación sigue ajustándose.`
      : '\n\nPuntuación provisional: Fantasy la sigue ajustando un rato más.';

  return `${cabecera}\nTus futbolistas en este partido suman <b>${resumen.aportacion} puntos</b>.${equipos ? '' : ''}\n\n${lineas.join('\n')}${cola}`;
}

/** Datos que se le pasan al modelo para que escriba el comentario del grupo. */
export function datosParaElComentario({ adelantamientos, causas, clasificacion }) {
  return {
    adelantamientos: adelantamientos.map((a) => ({
      adelanta: a.nombreAdelanta,
      adelantado: a.nombreAdelantado,
      posicionNueva: a.posicionNueva,
      puntosAdelanta: a.puntosAdelanta,
      puntosAdelantado: a.puntosAdelantado,
    })),
    causas,
    clasificacion: clasificacion.map((c) => ({ puesto: c.posicion, manager: c.nombre, puntos: c.puntos })),
    aviso: 'Los puntos son provisionales: Fantasy los sigue ajustando durante el partido y un rato después.',
  };
}
