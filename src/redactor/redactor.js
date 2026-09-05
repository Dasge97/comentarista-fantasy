import Anthropic from '@anthropic-ai/sdk';

const MODELO_POR_DEFECTO = 'claude-opus-5';

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
 *
 * La dirección base es configurable. Con la API oficial de Anthropic se usa
 * la respuesta de reserva del servidor, que evita quedarse sin texto si el
 * modelo declina escribirlo. Contra otra dirección no se envía, porque no
 * todos los servidores admiten ese parámetro: comprobado el 6 de septiembre
 * de 2026 contra auth2api.code-hive.space, que responde HTTP 400.
 */
export class Redactor {
  #cliente = null;
  #clave = '';
  #base = '';
  #modelo = MODELO_POR_DEFECTO;

  configurar(clave, base = '', modelo = MODELO_POR_DEFECTO) {
    this.#modelo = modelo || MODELO_POR_DEFECTO;
    const baseLimpia = (base || '').trim().replace(/\/$/, '');
    if (clave === this.#clave && baseLimpia === this.#base) return;

    this.#clave = clave;
    this.#base = baseLimpia;
    this.#cliente = clave
      ? new Anthropic({ apiKey: clave, ...(baseLimpia ? { baseURL: baseLimpia } : {}) })
      : null;
  }

  get disponible() {
    return Boolean(this.#cliente);
  }

  get esApiOficial() {
    return !this.#base;
  }

  /** Comprobación desde el panel: dice si la clave y la dirección funcionan. */
  async comprobar() {
    if (!this.#cliente) return { ok: false, motivo: 'No hay clave configurada.' };
    try {
      const respuesta = await this.#llamar({
        max_tokens: 60,
        system: 'Responde exactamente: funciona',
        messages: [{ role: 'user', content: 'Comprobación.' }],
      });
      return { ok: true, modelo: this.#modelo, base: this.#base || 'API oficial de Anthropic', texto: textoDe(respuesta) };
    } catch (error) {
      return { ok: false, motivo: `${error.status || ''} ${error.message}`.trim() };
    }
  }

  #llamar(peticion) {
    const comun = { model: this.#modelo, output_config: { effort: 'low' }, ...peticion };

    // Contra la API oficial se pide la respuesta de reserva del servidor.
    // Contra un servidor propio no, porque puede rechazar el parámetro.
    if (this.esApiOficial) {
      return this.#cliente.beta.messages.create({
        ...comun,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    }
    return this.#cliente.messages.create(comun);
  }

  /**
   * @param {object} datos Hechos ya comprobados.
   * @param {string} tono Instrucción de estilo, editable desde la web.
   */
  async comentarAdelantamiento(datos, tono) {
    const respaldo = fraseSencilla(datos);
    if (!this.#cliente) return { texto: respaldo, delModelo: false };

    try {
      const respuesta = await this.#llamar({
        max_tokens: 500,
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

      const texto = textoDe(respuesta);
      return texto ? { texto, delModelo: true } : { texto: respaldo, delModelo: false };
    } catch (error) {
      return { texto: respaldo, delModelo: false, motivo: error.message };
    }
  }
}

/**
 * Saca el texto de la respuesta.
 *
 * Los modelos que razonan devuelven primero un bloque de pensamiento vacío,
 * así que hay que quedarse solo con los bloques de texto.
 */
function textoDe(respuesta) {
  return (respuesta.content || [])
    .filter((bloque) => bloque.type === 'text')
    .map((bloque) => bloque.text)
    .join('')
    .trim();
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
