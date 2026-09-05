import { hechosDeJugador, resumenDePartido } from './detector.js';
import { avisoDeHecho, datosParaElComentario, resumenPrivadoDePartido } from './mensajes.js';

const CABECERA = '🧪 <i>Simulación con datos reales de una jornada ya jugada. No está pasando ahora.</i>';

/**
 * Reproduce los mensajes de una jornada ya disputada.
 *
 * Sirve para ver cómo queda todo sin esperar a que haya partido. Usa datos
 * reales leídos de Fantasy, no inventados: los goles, las asistencias y los
 * puntos son los que ocurrieron de verdad en esa jornada.
 *
 * Los mensajes se marcan como simulación, y se apuntan en el registro con
 * una clave propia para que no impidan enviar los de verdad más adelante.
 */
export class Simulacion {
  #lector;
  #almacen;
  #config;
  #telegram;
  #redactor;

  constructor({ lector, almacen, config, telegram, redactor }) {
    this.#lector = lector;
    this.#almacen = almacen;
    this.#config = config;
    this.#telegram = telegram;
    this.#redactor = redactor;
  }

  #plantillas() {
    return {
      goals: this.#config.obtener('plantilla_goals'),
      goal_assist: this.#config.obtener('plantilla_goal_assist'),
      penalty_save: this.#config.obtener('plantilla_penalty_save'),
      penalty_won: this.#config.obtener('plantilla_penalty_won'),
      penalty_failed: this.#config.obtener('plantilla_penalty_failed'),
      correccion: this.#config.obtener('plantilla_correccion'),
      colaPuntos: this.#config.obtener('plantilla_cola_puntos'),
    };
  }

  /**
   * @param {object} opciones
   * @param {number} opciones.jornada Jornada ya jugada.
   * @param {string} opciones.equipoId Equipo cuyos avisos privados se reproducen.
   * @param {string} opciones.destino Chat al que se manda todo.
   * @param {boolean} opciones.tambienAlGrupo Publicar además el comentario en el grupo.
   */
  async ejecutar({ jornada, equipoId, destino, tambienAlGrupo = false }) {
    const enviados = [];
    const avisar = async (chat, texto, etiqueta) => {
      const resultado = await this.#telegram.enviar(chat, texto);
      this.#almacen.marcarEnviado(`simulacion:${Date.now()}:${enviados.length}`, `simulacion:${chat}`, texto);
      enviados.push({ etiqueta, chat: String(chat), ok: resultado.ok, motivo: resultado.motivo || null });
      return resultado;
    };

    await avisar(destino, `${CABECERA}\n\nJornada ${jornada}. Empiezo.`, 'cabecera');

    const alineacion = await this.#lector.alineacion(equipoId, jornada);
    if (!alineacion) {
      await avisar(destino, 'Ese manager no jugó esa jornada, así que no hay nada que reproducir.', 'sin datos');
      return { enviados, jornada };
    }

    // ---- Avisos privados de los hechos de sus futbolistas ----
    const hechos = [];
    for (const jugador of alineacion.jugadores) {
      if (!jugador.estadisticas) continue;
      // Se comparan sus estadísticas contra un punto de partida vacío, que
      // es lo que produce la lista de todo lo que hizo en la jornada.
      const cambio = {
        jornada,
        equipoId: String(equipoId),
        futbolistaId: jugador.id,
        antes: { puntos: 0, estadisticas: {} },
        ahora: { puntos: jugador.puntos, estadisticas: jugador.estadisticas },
        esPrimeraLectura: false,
      };
      for (const hecho of hechosDeJugador(cambio)) hechos.push({ hecho, jugador });
    }

    if (hechos.length === 0) {
      await avisar(destino, 'En esa jornada ninguno de tus futbolistas marcó, asistió ni tuvo penaltis.', 'sin hechos');
    } else {
      for (const { hecho, jugador } of hechos) {
        const texto = avisoDeHecho({
          hecho,
          futbolista: jugador.nombre,
          puntos: jugador.puntos,
          plantillas: this.#plantillas(),
        });
        await avisar(destino, texto, `privado: ${hecho.nombre} de ${jugador.nombre}`);
      }
    }

    // ---- Resumen de final de partido ----
    // Solo se guardan los partidos de la jornada en curso, así que para una
    // jornada pasada hay que pedir el calendario a Fantasy.
    const partidos = await this.#partidosDe(jornada);
    let resumenHecho = false;
    for (const partido of partidos) {
      const resumen = resumenDePartido({
        alineacion,
        equiposDelPartido: [partido.localId, partido.visitanteId],
        jornada,
      });
      if (!resumen) continue;
      const texto = resumenPrivadoDePartido({
        resumen,
        marcador: `${partido.golesLocal ?? '?'}-${partido.golesVisitante ?? '?'}`,
      });
      await avisar(destino, texto, `resumen de un partido con ${resumen.jugadores.length} de tus futbolistas`);
      resumenHecho = true;
      break; // Con un partido de ejemplo basta para ver cómo queda.
    }
    if (!resumenHecho) {
      await avisar(destino, 'No he encontrado ningún partido de esa jornada con futbolistas tuyos.', 'sin resumen');
    }

    // ---- Comentario de grupo ----
    const comentario = await this.#comentarioDeEjemplo(jornada);
    if (comentario) {
      await avisar(destino, `${CABECERA}\n\n${comentario}`, 'comentario del grupo, copia privada');
      const grupo = this.#config.obtener('telegram_grupo');
      if (tambienAlGrupo && grupo) {
        await avisar(grupo, `${CABECERA}\n\n${comentario}`, 'comentario publicado en el grupo');
      }
    }

    await avisar(destino, 'Fin de la simulación.', 'cierre');
    return { enviados, jornada, hechos: hechos.length };
  }

  /**
   * Partidos de una jornada. Se piden a Fantasy porque la base de datos solo
   * guarda los de la jornada en curso.
   */
  async #partidosDe(jornada) {
    try {
      return await this.#lector.calendario(jornada);
    } catch {
      // Si Fantasy no responde, se usa lo que haya guardado, adaptando los
      // nombres de columna a los que devuelve el calendario.
      return this.#almacen.partidosDeLaJornada(jornada).map((p) => ({
        localId: p.local_id,
        visitanteId: p.visitante_id,
        golesLocal: p.goles_local,
        golesVisitante: p.goles_visitante,
      }));
    }
  }

  /**
   * Construye un comentario de grupo con un adelantamiento real de esa
   * jornada: quién quedó primero y quién segundo, y qué futbolistas del
   * primero puntuaron más.
   */
  async #comentarioDeEjemplo(jornada) {
    const filas = this.#almacen.db
      .prepare(`
        SELECT e.equipo_id, e.puntos_jornada, m.nombre
        FROM estado_manager e JOIN managers m ON m.equipo_id = e.equipo_id
        WHERE e.jornada = ? AND m.es_servicio = 0 AND e.puntos_jornada IS NOT NULL
        ORDER BY e.puntos_jornada DESC
      `)
      .all(jornada);
    if (filas.length < 2) return null;

    const [primero, segundo] = filas;
    const alineacion = await this.#lector.alineacion(primero.equipo_id, jornada);
    const mejores = (alineacion?.jugadores || [])
      .filter((j) => j.puntos != null)
      .sort((a, b) => b.puntos - a.puntos)
      .slice(0, 2);

    const datos = datosParaElComentario({
      adelantamientos: [
        {
          nombreAdelanta: primero.nombre,
          nombreAdelantado: segundo.nombre,
          posicionNueva: 1,
          puntosAdelanta: primero.puntos_jornada,
          puntosAdelantado: segundo.puntos_jornada,
        },
      ],
      causas: mejores.map((j) => ({
        manager: primero.nombre,
        futbolista: j.nombre,
        que: `${j.puntos} puntos`,
      })),
      clasificacion: filas.map((f, i) => ({ posicion: i + 1, nombre: f.nombre, puntos: f.puntos_jornada })),
    });

    const { texto } = await this.#redactor.comentarAdelantamiento(datos, this.#config.obtener('tono'));
    return texto;
  }
}
