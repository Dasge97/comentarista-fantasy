import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * Escribe el comentario que se publica en el grupo.
 *
 * Sirve tanto Anthropic como OpenAI. Se elige desde el panel, y cada
 * proveedor guarda su clave, su dirección base y su modelo por separado,
 * para poder cambiar de uno a otro sin volver a escribirlo todo.
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
  #proveedor = 'anthropic';
  #cliente = null;
  #modelo = '';
  #base = '';
  #huella = '';

  configurar({ proveedor, anthropic, openai }) {
    const elegido = proveedor === 'openai' ? 'openai' : 'anthropic';
    const ajustes = elegido === 'openai' ? openai : anthropic;
    const base = (ajustes.base || '').trim().replace(/\/$/, '');
    const huella = `${elegido}|${ajustes.clave}|${base}|${ajustes.modelo}`;
    if (huella === this.#huella) return;

    this.#huella = huella;
    this.#proveedor = elegido;
    this.#modelo = ajustes.modelo || '';
    this.#base = base;

    if (!ajustes.clave) {
      this.#cliente = null;
      return;
    }
    const opciones = { apiKey: ajustes.clave, ...(base ? { baseURL: base } : {}) };
    this.#cliente = elegido === 'openai' ? new OpenAI(opciones) : new Anthropic(opciones);
  }

  get disponible() {
    return Boolean(this.#cliente && this.#modelo);
  }

  get descripcion() {
    return {
      proveedor: this.#proveedor,
      modelo: this.#modelo || '(sin elegir)',
      base: this.#base || (this.#proveedor === 'openai' ? 'API oficial de OpenAI' : 'API oficial de Anthropic'),
    };
  }

  /** Modelos que ofrece el proveedor configurado, para elegir en el panel. */
  async modelosDisponibles() {
    if (!this.#cliente) return { ok: false, motivo: 'No hay clave configurada para este proveedor.' };
    try {
      if (this.#proveedor === 'openai') {
        const lista = await this.#cliente.models.list();
        return { ok: true, modelos: lista.data.map((m) => m.id).sort() };
      }
      const lista = await this.#cliente.models.list();
      return { ok: true, modelos: lista.data.map((m) => m.id).sort() };
    } catch (error) {
      return { ok: false, motivo: `${error.status || ''} ${error.message}`.trim() };
    }
  }

  /** Comprobación desde el panel: dice si la clave, la dirección y el modelo funcionan. */
  async comprobar() {
    if (!this.#cliente) return { ok: false, motivo: 'No hay clave configurada para este proveedor.' };
    if (!this.#modelo) return { ok: false, motivo: 'Falta elegir el modelo.' };
    try {
      const texto = await this.#escribir({
        maximoDeSalida: 60,
        instrucciones: 'Responde exactamente: funciona',
        entrada: 'Comprobación.',
      });
      return { ok: true, ...this.descripcion, texto };
    } catch (error) {
      return { ok: false, motivo: `${error.status || ''} ${error.message}`.trim() };
    }
  }

  /**
   * @param {object} datos Hechos ya comprobados.
   * @param {string} tono Instrucción de estilo, editable desde la web.
   */
  async comentarAdelantamiento(datos, tono) {
    const respaldo = fraseSencilla(datos);
    if (!this.disponible) return { texto: respaldo, delModelo: false };

    const instrucciones = [
      tono,
      '',
      'Escribes un mensaje corto para el grupo de Telegram de una liga de Fantasy entre amigos.',
      'Reglas que no puedes romper:',
      '- Usa solo los datos que te doy. No inventes goles, minutos, rivales ni cifras.',
      '- Si no te doy la causa de un cambio, no la supongas.',
      '- Dos o tres frases como mucho. Sin encabezados ni listas.',
      '- Puedes usar algún emoji, pero pocos.',
      '- Escribe en español de España.',
    ].join('\n');

    try {
      const texto = await this.#escribir({
        maximoDeSalida: 500,
        instrucciones,
        entrada: JSON.stringify(datos, null, 2),
      });
      return texto ? { texto, delModelo: true } : { texto: respaldo, delModelo: false, motivo: 'respuesta vacía' };
    } catch (error) {
      return { texto: respaldo, delModelo: false, motivo: error.message };
    }
  }

  #escribir(peticion) {
    return this.#proveedor === 'openai' ? this.#escribirOpenAI(peticion) : this.#escribirAnthropic(peticion);
  }

  /**
   * Contra la API oficial de Anthropic se pide la respuesta de reserva del
   * servidor, que evita quedarse sin texto si el modelo declina escribirlo.
   * Contra una dirección propia no se envía: comprobado el 6 de septiembre de
   * 2026 que auth2api.code-hive.space responde HTTP 400 al parámetro.
   */
  async #escribirAnthropic({ maximoDeSalida, instrucciones, entrada }) {
    const comun = {
      model: this.#modelo,
      max_tokens: maximoDeSalida,
      output_config: { effort: 'low' },
      system: instrucciones,
      messages: [{ role: 'user', content: entrada }],
    };

    const respuesta = this.#base
      ? await this.#cliente.messages.create(comun)
      : await this.#cliente.beta.messages.create({
          ...comun,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });

    if (respuesta.stop_reason === 'refusal') {
      const error = new Error('el modelo declinó escribirlo');
      error.status = 200;
      throw error;
    }

    // Los modelos que razonan devuelven primero un bloque de pensamiento
    // vacío, así que hay que quedarse solo con los bloques de texto.
    return (respuesta.content || [])
      .filter((bloque) => bloque.type === 'text')
      .map((bloque) => bloque.text)
      .join('')
      .trim();
  }

  /**
   * Los modelos nuevos de OpenAI usan `max_completion_tokens` en vez de
   * `max_tokens`. Los servidores compatibles antiguos solo entienden el
   * segundo. Se prueba el nuevo y se reintenta con el viejo si lo rechaza.
   */
  async #escribirOpenAI({ maximoDeSalida, instrucciones, entrada }) {
    const comun = {
      model: this.#modelo,
      messages: [
        { role: 'system', content: instrucciones },
        { role: 'user', content: entrada },
      ],
    };

    let respuesta;
    try {
      respuesta = await this.#cliente.chat.completions.create({ ...comun, max_completion_tokens: maximoDeSalida });
    } catch (error) {
      if (error.status !== 400) throw error;
      respuesta = await this.#cliente.chat.completions.create({ ...comun, max_tokens: maximoDeSalida });
    }

    return (respuesta.choices?.[0]?.message?.content || '').trim();
  }
}

/**
 * Frase de respaldo, con los mismos datos y sin gracia.
 * Se usa cuando no hay modelo configurado o el modelo falla.
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
