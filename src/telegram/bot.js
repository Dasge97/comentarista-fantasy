/**
 * Conversación del bot con cada amigo.
 *
 * Atiende la vinculación: el amigo elige qué manager de la liga es, y puede
 * rectificar. Un manager solo puede estar vinculado a una persona.
 *
 * También reparte el enlace de acceso a la web, pero solo a quien el
 * administrador haya dado de alta. Nadie entra por su cuenta.
 */

const AYUDA = [
  'Soy el comentarista de vuestra liga.',
  '',
  'Comandos:',
  '/yosoy — elegir qué manager eres',
  '/quiensoy — ver con qué manager estás vinculado',
  '/soltar — soltar tu manager para que lo coja otro',
  '/web — recibir un enlace para entrar en la web',
  '/ayuda — este mensaje',
].join('\n');

export class BotTelegram {
  #telegram;
  #almacen;
  #usuarios;
  #config;
  #registrar;
  #desde = 0;
  #corriendo = false;

  constructor({ telegram, almacen, usuarios, config, registrar }) {
    this.#telegram = telegram;
    this.#almacen = almacen;
    this.#usuarios = usuarios;
    this.#config = config;
    this.#registrar = registrar || (() => {});
  }

  /** Escucha mensajes hasta que se le diga que pare. */
  async escuchar(sigueVivo) {
    if (this.#corriendo) return;
    this.#corriendo = true;
    try {
      while (sigueVivo()) {
        if (!this.#telegram.configurado) {
          await new Promise((r) => setTimeout(r, 10000));
          continue;
        }
        try {
          const novedades = await this.#telegram.recibir(this.#desde);
          for (const novedad of novedades) {
            this.#desde = novedad.update_id + 1;
            await this.#atender(novedad);
          }
        } catch (error) {
          this.#registrar('aviso', 'telegram', `Fallo al recibir mensajes: ${error.message}`);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    } finally {
      this.#corriendo = false;
    }
  }

  async #atender(novedad) {
    if (novedad.callback_query) return this.#atenderBoton(novedad.callback_query);
    const mensaje = novedad.message;
    if (!mensaje?.text) return;

    // En el grupo el bot no conversa. Solo publica lo que le toca.
    if (mensaje.chat.type !== 'private') return;

    const chatId = String(mensaje.chat.id);
    const texto = mensaje.text.trim();
    const nombre = [mensaje.from?.first_name, mensaje.from?.last_name].filter(Boolean).join(' ') || mensaje.from?.username;

    if (texto.startsWith('/start')) return this.#saludar(chatId, texto);
    if (texto.startsWith('/yosoy')) return this.#ofrecerManagers(chatId);
    if (texto.startsWith('/quiensoy')) return this.#decirQuienEs(chatId);
    if (texto.startsWith('/soltar')) return this.#soltar(chatId);
    if (texto.startsWith('/web')) return this.#enlaceWeb(chatId, nombre);
    return this.#telegram.enviar(chatId, AYUDA);
  }

  async #saludar(chatId, texto) {
    // El enlace de incorporación puede traer un parámetro. De momento solo
    // sirve para saludar y ofrecer la elección de manager.
    const vinculacion = this.#usuarios.vinculacionDe(chatId);
    if (vinculacion) {
      const manager = this.#almacen.managers().find((m) => m.manager_id === vinculacion.manager_id);
      await this.#telegram.enviar(chatId, `Ya estás vinculado como <b>${manager?.nombre || vinculacion.manager_id}</b>.\n\n${AYUDA}`);
      return;
    }
    await this.#telegram.enviar(chatId, `${AYUDA}\n\nEmpieza con /yosoy para decirme quién eres.`);
    await this.#ofrecerManagers(chatId);
  }

  async #ofrecerManagers(chatId) {
    const libres = this.#usuarios.managersLibres(this.#almacen.managersReales());
    const propia = this.#usuarios.vinculacionDe(chatId);

    if (libres.length === 0) {
      await this.#telegram.enviar(
        chatId,
        propia
          ? 'Todos los managers están cogidos. Si te has equivocado, usa /soltar y vuelve a elegir.'
          : 'Todos los managers están cogidos. Habla con el administrador de la liga.',
      );
      return;
    }

    await this.#telegram.enviar(chatId, '¿Cuál de estos managers eres?', {
      reply_markup: {
        inline_keyboard: libres.map((m) => [{ text: m.nombre, callback_data: `soy:${m.manager_id}` }]),
      },
    });
  }

  async #atenderBoton(consulta) {
    const chatId = String(consulta.message.chat.id);
    const [accion, valor] = String(consulta.data || '').split(':');
    if (accion !== 'soy') return this.#telegram.responderBoton(consulta.id, '');

    const nombreTelegram =
      [consulta.from?.first_name, consulta.from?.last_name].filter(Boolean).join(' ') || consulta.from?.username;
    const resultado = this.#usuarios.vincular(chatId, valor, nombreTelegram);

    if (!resultado.ok) {
      await this.#telegram.responderBoton(consulta.id, 'Ese manager ya está cogido');
      await this.#telegram.enviar(chatId, 'Ese manager ya lo ha cogido otra persona. Elige otro con /yosoy.');
      return;
    }

    const manager = this.#almacen.managers().find((m) => m.manager_id === valor);
    await this.#telegram.responderBoton(consulta.id, 'Hecho');
    await this.#telegram.editar(chatId, consulta.message.message_id, `Te he apuntado como <b>${manager?.nombre}</b>.`);
    await this.#telegram.enviar(
      chatId,
      'A partir de ahora te aviso por aquí de lo que hagan tus futbolistas.\n\nSi me he equivocado, usa /soltar y vuelve a elegir.',
    );
  }

  async #decirQuienEs(chatId) {
    const vinculacion = this.#usuarios.vinculacionDe(chatId);
    if (!vinculacion) {
      await this.#telegram.enviar(chatId, 'Todavía no me has dicho quién eres. Usa /yosoy.');
      return;
    }
    const manager = this.#almacen.managers().find((m) => m.manager_id === vinculacion.manager_id);
    await this.#telegram.enviar(chatId, `Estás vinculado como <b>${manager?.nombre || vinculacion.manager_id}</b>.`);
  }

  async #soltar(chatId) {
    const vinculacion = this.#usuarios.vinculacionDe(chatId);
    if (!vinculacion) {
      await this.#telegram.enviar(chatId, 'No tienes ningún manager cogido.');
      return;
    }
    this.#usuarios.desvincular(chatId);
    await this.#telegram.enviar(chatId, 'Lo he soltado. Ya lo puede coger otro. Usa /yosoy para elegir de nuevo.');
  }

  async #enlaceWeb(chatId, nombre) {
    const usuario = this.#usuarios.porTelegram(chatId);
    if (!usuario || !usuario.activo) {
      await this.#telegram.enviar(
        chatId,
        'Todavía no tienes acceso a la web. El administrador de la liga tiene que darte de alta.',
      );
      return;
    }

    const base = this.#config.obtener('url_publica') || '';
    const { codigo, minutos } = this.#usuarios.crearCodigo(usuario.id);
    const enlace = base ? `${base.replace(/\/$/, '')}/entrar?codigo=${codigo}` : `Código: ${codigo}`;
    await this.#telegram.enviar(
      chatId,
      `Aquí tienes tu acceso, ${nombre || ''}:\n${enlace}\n\nCaduca en ${minutos} minutos y solo sirve una vez.`,
    );
  }
}
