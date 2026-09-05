import Anthropic from '@anthropic-ai/sdk';

const MODELO = 'claude-opus-5';

/**
 * Escribe el comentario que se publica en el grupo.
 *
 * El modelo solo redacta. Los hechos vienen ya calculados: quién adelanta a
 * quién, con cuántos puntos y qué futbolista lo ha provocado. El modelo no
 * decide quién ha marcado ni calcula clasificaciones.
 *
 * Si el modelo falla o tarda, se publica igualmente con una frase sencilla
 * construida con los mismos datos. Un fallo del modelo no puede dejar al
 * grupo sin el aviso.
 */
export class Redactor {
  #cliente = null;
  #clave = '';

  configurar(clave) {
    if (clave === this.#clave) return;
    this.#clave = clave;
    this.#cliente = clave ? new Anthropic({ apiKey: clave }) : null;
  }

  get disponible() {
    return Boolean(this.#cliente);
  }

  /**
   * @param {object} datos Hechos ya comprobados.
   * @param {string} tono Instrucción de estilo, editable desde la web.
   */
  async comentarAdelantamiento(datos, tono) {
    const respaldo = fraseSencilla(datos);
    if (!this.#cliente) return { texto: respaldo, delModelo: false };

    try {
      const respuesta = await this.#cliente.beta.messages.create({
        model: MODELO,
        max_tokens: 500,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: [
          tono,
          '',
          'Escribes un mensaje corto para el grupo de Telegram de una liga de Fantasy entre amigos.',
          'Reglas que no puedes romper:',
          '- Usa solo los datos que te doy. No inventes goles, minutos, rivales ni cifras.',
          '- Si no te doy la causa de un cambio, no la supongas.',
          '- Dos o tres frases como mucho. Sin encabezados ni listas.',
          '- Puedes usar algún emoji, pero pocos.',
          '- Escribe en español de España.',
        ].join('\n'),
        messages: [{ role: 'user', content: JSON.stringify(datos, null, 2) }],
      });

      if (respuesta.stop_reason === 'refusal') {
        return { texto: respaldo, delModelo: false, motivo: 'el modelo declinó escribirlo' };
      }

      const texto = respuesta.content
        .filter((bloque) => bloque.type === 'text')
        .map((bloque) => bloque.text)
        .join('')
        .trim();

      return texto ? { texto, delModelo: true } : { texto: respaldo, delModelo: false };
    } catch (error) {
      return { texto: respaldo, delModelo: false, motivo: error.message };
    }
  }
}

/**
 * Frase de respaldo, con los mismos datos y sin gracia.
 * Se usa cuando no hay clave configurada o el modelo falla.
 */
function fraseSencilla(datos) {
  const partes = datos.adelantamientos.map(
    (a) => `${a.adelanta} adelanta a ${a.adelantado} (${a.puntosAdelanta}-${a.puntosAdelantado})`,
  );
  const motivo = datos.causas?.length
    ? ` Ha sido por ${datos.causas.map((c) => `${c.futbolista} (${c.que})`).join(', ')}.`
    : '';
  return `📊 Cambio en la clasificación. ${partes.join('. ')}.${motivo} Puntuación provisional.`;
}
