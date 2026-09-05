/**
 * Conversación del bot con cada amigo.
 *
 * Atiende la vinculación: el amigo elige qué manager de la liga es, y puede
 * rectificar. Un manager solo puede estar vinculado a una persona.
 *
 * También reparte el enlace de acceso a la web, pero solo a quien el
 * administrador haya dado de alta. Nadie entra por su cuenta.
 *
 * En los grupos el bot no conversa. Solo anota en qué grupo está, para que
 * el administrador pueda elegirlo desde el panel sin buscar identificadores
 * a mano.
 */

const escapar = (texto) =>
  String(texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MENU = {
  inline_keyboard: [
    [{ text: '¿Quién soy?', callback_data: 'menu:quiensoy' }],
    [{ text: 'Cambiar de manager', callback_data: 'menu:elegir' }],
    [{ text: 'Entrar en la web', callback_data: 'menu:web' }],
  ],
};

const AYUDA = [
  'Soy el comentarista de vuestra liga.',
  '',
  'Durante los partidos te aviso por aquí de lo que hagan tus futbolistas:',
  'goles, asistencias y penaltis. Al acabar cada partido te mando un resumen.',
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
  #nombre = null;

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
    // Avisa de que han metido o sacado al bot de un grupo. Es la forma
    // limpia de aprender el identificador del grupo, sin que nadie tenga
    // que escribir nada.
    if (novedad.my_chat_member) return this.#cambioDePertenencia(novedad.my_chat_member);
    if (novedad.callback_query) return this.#atenderBoton(novedad.callback_query);

    const mensaje = novedad.message;
    if (!mensaje) return;

    if (mensaje.chat.type !== 'private') {
      this.#anotarGrupo(mensaje.chat);
      if (mensaje.new_chat_members?.length) await this.#saludarEnElGrupo(mensaje);
      return;
    }

    if (!mensaje.text) return;

    const chatId = String(mensaje.chat.id);
    // En un grupo los comandos llegan como /orden@nombredelbot.
    const texto = mensaje.text.trim().replace(/@\w+/g, '');
    const nombre = [mensaje.from?.first_name, mensaje.from?.last_name].filter(Boolean).join(' ') || mensaje.from?.username;

    if (texto.startsWith('/start')) return this.#saludar(chatId);
    if (texto.startsWith('/yosoy')) return this.#ofrecerManagers(chatId);
    if (texto.startsWith('/quiensoy')) return this.#decirQuienEs(chatId);
    if (texto.startsWith('/soltar')) return this.#soltar(chatId);
    if (texto.startsWith('/web')) return this.#enlaceWeb(chatId, nombre);
    return this.#telegram.enviar(chatId, AYUDA, { reply_markup: MENU });
  }

  #anotarGrupo(chat) {
    this.#almacen.anotarGrupo({ chatId: chat.id, titulo: chat.title, tipo: chat.type });
  }

  /** Nombre del bot, para construir el enlace al chat privado. */
  async #nombreDelBot() {
    if (this.#nombre) return this.#nombre;
    try {
      this.#nombre = (await this.#telegram.quienSoy()).username;
    } catch {
      this.#nombre = null;
    }
    return this.#nombre;
  }

  /**
   * Saluda en el grupo a quien acaba de entrar y le ofrece un botón que abre
   * el chat privado con el bot.
   *
   * Telegram no deja que un bot escriba el primero a nadie: la persona tiene
   * que abrir la conversación. El botón la abre y manda el /start solo, así
   * que para el recién llegado es un único toque.
   */
  async #saludarEnElGrupo(mensaje) {
    if (!this.#config.activo('saludar_al_entrar')) return;

    const personas = mensaje.new_chat_members.filter((p) => !p.is_bot);
    if (personas.length === 0) return;

    const usuario = await this.#nombreDelBot();
    const nombres = personas.map((p) => p.first_name || p.username || 'nuevo').join(', ');
    const texto = this.#config.obtener('bienvenida_grupo').replaceAll('{nombre}', escapar(nombres));

    await this.#telegram.enviar(String(mensaje.chat.id), texto, {
      reply_markup: usuario
        ? { inline_keyboard: [[{ text: 'Hablar conmigo y elegir mi equipo', url: `https://t.me/${usuario}?start=grupo` }]] }
        : undefined,
    });
  }

  async #cambioDePertenencia(cambio) {
    const chat = cambio.chat;
    if (chat.type === 'private') return;

    const estado = cambio.new_chat_member?.status;
    if (['member', 'administrator'].includes(estado)) {
      this.#anotarGrupo(chat);
      this.#registrar('info', 'telegram', `El bot ha entrado en el grupo «${chat.title}» (${chat.id})`);
      await this.#telegram.enviar(
        String(chat.id),
        'Hola. Soy el comentarista de la liga.\n\nCuando el administrador me active, comentaré aquí los cambios de puesto en la clasificación. Los avisos de vuestros futbolistas van por privado: escribidme y usad /yosoy.',
      );
      return;
    }

    if (['left', 'kicked'].includes(estado)) {
      this.#registrar('aviso', 'telegram', `El bot ha salido del grupo «${chat.title}» (${chat.id})`);
    }
  }

  async #saludar(chatId) {
    const vinculacion = this.#usuarios.vinculacionDe(chatId);
    if (vinculacion) {
      const manager = this.#almacen.managers().find((m) => m.manager_id === vinculacion.manager_id);
      await this.#telegram.enviar(
        chatId,
        `Ya estás vinculado como <b>${manager?.nombre || vinculacion.manager_id}</b>.\n\n${AYUDA}`,
        { reply_markup: MENU },
      );
      return;
    }
    // Primera vez. Aquí es donde se explica todo, porque es el momento en
    // que la persona está prestando atención.
    await this.#telegram.enviar(
      chatId,
      [
        '👋 Hola. Soy el comentarista de vuestra liga de Fantasy.',
        '',
        '<b>Qué hago por ti</b>',
        'Durante los partidos te aviso por aquí en cuanto uno de tus futbolistas marca, da una asistencia, para un penalti, lo provoca o lo falla.',
        'Al terminar cada partido te mando un resumen de lo que hicieron los tuyos.',
        '',
        '<b>Qué hago en el grupo</b>',
        'Cuando alguien adelanta a otro en la clasificación, lo comento allí. Nada más: los avisos de tus futbolistas son solo para ti.',
        '',
        '<b>Qué necesito de ti</b>',
        'Solo saber cuál de los managers de la liga eres. Elígete abajo y ya está.',
        '',
        'No te pido tu cuenta de Fantasy ni tu contraseña. Leo la liga con una cuenta aparte.',
        'Si te equivocas al elegir, escribe /soltar y vuelves a empezar.',
      ].join('\n'),
    );
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
    const nombreTelegram =
      [consulta.from?.first_name, consulta.from?.last_name].filter(Boolean).join(' ') || consulta.from?.username;

    if (accion === 'menu') {
      await this.#telegram.responderBoton(consulta.id, '');
      if (valor === 'quiensoy') return this.#decirQuienEs(chatId);
      if (valor === 'elegir') return this.#ofrecerManagers(chatId);
      if (valor === 'web') return this.#enlaceWeb(chatId, nombreTelegram);
      return undefined;
    }

    if (accion !== 'soy') return this.#telegram.responderBoton(consulta.id, '');

    const resultado = this.#usuarios.vincular(chatId, valor, nombreTelegram);
    if (!resultado.ok) {
      await this.#telegram.responderBoton(consulta.id, 'Ese manager ya está cogido');
      await this.#telegram.enviar(chatId, 'Ese manager ya lo ha cogido otra persona. Elige otro con /yosoy.');
      return undefined;
    }

    const manager = this.#almacen.managers().find((m) => m.manager_id === valor);
    await this.#telegram.responderBoton(consulta.id, 'Hecho');
    await this.#telegram.editar(chatId, consulta.message.message_id, `Te he apuntado como <b>${manager?.nombre}</b>.`);
    await this.#telegram.enviar(
      chatId,
      'A partir de ahora te aviso por aquí de lo que hagan tus futbolistas.\n\nSi me he equivocado, usa /soltar y vuelve a elegir.',
      { reply_markup: MENU },
    );
    return undefined;
  }

  async #decirQuienEs(chatId) {
    const vinculacion = this.#usuarios.vinculacionDe(chatId);
    if (!vinculacion) {
      await this.#telegram.enviar(chatId, 'Todavía no me has dicho quién eres. Usa /yosoy.');
      return;
    }
    const manager = this.#almacen.managers().find((m) => m.manager_id === vinculacion.manager_id);
    await this.#telegram.enviar(chatId, `Estás vinculado como <b>${manager?.nombre || vinculacion.manager_id}</b>.`, {
      reply_markup: MENU,
    });
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
        `Todavía no tienes acceso a la web. Dile al administrador que te dé de alta con este identificador: <code>${chatId}</code>`,
      );
      return;
    }

    const base = this.#config.obtener('url_publica') || '';
    const { codigo, minutos } = this.#usuarios.crearCodigo(usuario.id);
    const enlace = base ? `${base.replace(/\/$/, '')}/entrar?codigo=${codigo}` : `Código: ${codigo}`;
    await this.#telegram.enviar(
      chatId,
      `Aquí tienes tu acceso${nombre ? `, ${nombre}` : ''}:\n${enlace}\n\nCaduca en ${minutos} minutos y solo sirve una vez.`,
    );
  }
}
