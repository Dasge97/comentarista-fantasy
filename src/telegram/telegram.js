/**
 * Cliente de la API de bots de Telegram.
 *
 * Se habla con la API por HTTP directamente. Una librería no aporta nada
 * para las cuatro llamadas que hacen falta, y añadir dependencias complica
 * la imagen de Docker.
 */
export class Telegram {
  #token;

  constructor(token) {
    this.#token = token;
  }

  get configurado() {
    return Boolean(this.#token);
  }

  cambiarToken(token) {
    this.#token = token;
  }

  async #llamar(metodo, cuerpo, { tiempoLimiteMs = 20000 } = {}) {
    if (!this.#token) throw new Error('El token del bot de Telegram no está configurado.');

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), tiempoLimiteMs);
    try {
      const respuesta = await fetch(`https://api.telegram.org/bot${this.#token}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: control.signal,
      });
      const datos = await respuesta.json();
      if (!datos.ok) {
        const error = new Error(`Telegram rechazó ${metodo}: ${datos.description}`);
        error.codigo = datos.error_code;
        error.descripcion = datos.description;
        throw error;
      }
      return datos.result;
    } finally {
      clearTimeout(temporizador);
    }
  }

  /**
   * Envía un mensaje.
   *
   * Si la persona ha bloqueado al bot, Telegram responde con un 403. No es
   * un fallo del sistema: se devuelve `bloqueado` para dejar de intentarlo
   * en vez de reintentar en bucle.
   */
  async enviar(destino, texto, opciones = {}) {
    try {
      const mensaje = await this.#llamar('sendMessage', {
        chat_id: destino,
        text: texto,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...opciones,
      });
      return { ok: true, mensajeId: mensaje.message_id };
    } catch (error) {
      if (error.codigo === 403) return { ok: false, bloqueado: true, motivo: error.descripcion };
      if (error.codigo === 429) return { ok: false, limitado: true, motivo: error.descripcion };
      return { ok: false, motivo: error.message };
    }
  }

  async editar(destino, mensajeId, texto, opciones = {}) {
    try {
      await this.#llamar('editMessageText', {
        chat_id: destino,
        message_id: mensajeId,
        text: texto,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...opciones,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, motivo: error.message };
    }
  }

  /**
   * Espera mensajes nuevos. La llamada se queda abierta hasta `espera`
   * segundos, así que no hace falta preguntar en bucle.
   */
  async recibir(desde, espera = 25) {
    return this.#llamar(
      'getUpdates',
      { offset: desde, timeout: espera, allowed_updates: ['message', 'callback_query', 'my_chat_member'] },
      { tiempoLimiteMs: (espera + 10) * 1000 },
    );
  }

  async responderBoton(callbackId, texto) {
    try {
      await this.#llamar('answerCallbackQuery', { callback_query_id: callbackId, text: texto });
    } catch {
      // Un botón caducado no es un problema que haya que registrar.
    }
  }

  async quienSoy() {
    return this.#llamar('getMe', {});
  }
}
