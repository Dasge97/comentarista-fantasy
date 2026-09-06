/**
 * Textos de los mensajes.
 *
 * Los privados se escriben con plantillas: son avisos de hechos y lo que
 * importa es que lleguen rápido y sean exactos. El comentario del grupo lo
 * redacta el modelo de lenguaje, y estas plantillas son su respaldo.
 */

const escapar = (texto) =>
  String(texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Aviso privado de un hecho de un futbolista propio.
 *
 * El texto sale de las plantillas que el administrador edita en la web. Los
 * huecos son {jugador}, {puntos} y {que}. Si una plantilla se deja vacía, se
 * usa una frase mínima para que el aviso llegue igualmente.
 */
export function avisoDeHecho({ hecho, futbolista, puntos, plantillas = {} }) {
  const nombre = escapar(futbolista);

  const rellenar = (texto) =>
    String(texto)
      .replaceAll('{jugador}', nombre)
      .replaceAll('{puntos}', puntos == null ? '—' : String(puntos))
      .replaceAll('{que}', escapar(hecho.nombre === 'gol' ? 'el gol' : `la ${hecho.nombre}`));

  if (hecho.rectificacion) {
    const plantilla = plantillas.correccion || '↩️ Corrección: a <b>{jugador}</b> le han quitado {que}.';
    return rellenar(plantilla);
  }

  const plantilla = plantillas[hecho.tipo] || `📣 <b>{jugador}</b>: ${escapar(hecho.nombre)}.`;
  const cola = puntos != null && plantillas.colaPuntos ? `
${rellenar(plantillas.colaPuntos)}` : '';
  return rellenar(plantilla) + cola;
}

/**
 * Aviso privado de una buena actuación: muchas paradas, muchos despejes.
 *
 * Los huecos son {jugador}, {cuantas}, {que} y {puntos_accion}.
 */
export function avisoDeActuacion({ actuacion, futbolista, plantilla }) {
  const texto = plantilla || '👏 <b>{jugador}</b> lleva {cuantas} {que}, y eso le da {puntos_accion} puntos.';
  return String(texto)
    .replaceAll('{jugador}', escapar(futbolista))
    .replaceAll('{cuantas}', String(actuacion.cuantas))
    .replaceAll('{que}', escapar(actuacion.nombre))
    .replaceAll('{puntos_accion}', String(actuacion.puntosQueAporta));
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
