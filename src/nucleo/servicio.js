import { LectorFantasy } from '../fantasy/lector.js';
import { adelantamientos, culpables, hechosDeJugador, resumenDePartido } from './detector.js';
import { avisoDeHecho, datosParaElComentario, resumenPrivadoDePartido } from './mensajes.js';
import { calcularDinero } from './dinero.js';
import { hoy } from '../db/db.js';

const ESTADO_FINALIZADO = 7;
const ESTADOS_EN_JUEGO = [3, 4];

/**
 * Servicio principal.
 *
 * Decide cuándo leer, guarda lo leído, detecta los hechos y los publica.
 * Todo corre en el mismo proceso de Node que sirve la web.
 */
export class Servicio {
  #almacen;
  #usuarios;
  #config;
  #telegram;
  #redactor;
  #ficheroSesion;
  #lector = null;
  #vivo = false;
  #ultimoCicloLento = 0;
  #jornada = null;
  #jornadaLeidaEn = 0;

  estado = {
    arrancado: false,
    ultimaLectura: null,
    ultimoError: null,
    lecturaCompleta: null,
    proximoCiclo: null,
    ritmo: 'parado',
  };

  constructor({ almacen, usuarios, config, telegram, redactor, ficheroSesion }) {
    this.#ficheroSesion = ficheroSesion;
    this.#almacen = almacen;
    this.#usuarios = usuarios;
    this.#config = config;
    this.#telegram = telegram;
    this.#redactor = redactor;
  }

  #anotar(nivel, mensaje) {
    this.#almacen.anotarIncidencia(nivel, 'servicio', mensaje);
    if (nivel === 'error') this.estado.ultimoError = { mensaje: String(mensaje), cuando: new Date().toISOString() };
  }

  /** Rehace el lector cuando cambian las credenciales desde la web. */
  refrescarConfiguracion() {
    const email = this.#config.obtener('fantasy_email');
    const password = this.#config.obtener('fantasy_password');
    this.#lector = email && password ? new LectorFantasy({ email, password, ficheroSesion: this.#ficheroSesion }) : null;
    this.#telegram.cambiarToken(this.#config.obtener('telegram_token'));
    this.#redactor.configurar(
      this.#config.obtener('anthropic_api_key'),
      this.#config.obtener('anthropic_base_url'),
      this.#config.obtener('anthropic_modelo'),
    );
  }

  get lector() {
    return this.#lector;
  }

  get configurado() {
    return Boolean(this.#lector && this.#config.obtener('liga_id'));
  }

  arrancar() {
    this.refrescarConfiguracion();
    this.#vivo = true;
    this.estado.arrancado = true;
    this.#bucle();
  }

  parar() {
    this.#vivo = false;
    this.estado.arrancado = false;
    this.estado.ritmo = 'parado';
  }

  get vivo() {
    return this.#vivo;
  }

  async #bucle() {
    while (this.#vivo) {
      let espera = this.#config.numero('segundos_en_reposo') * 1000;
      try {
        if (this.configurado) {
          espera = await this.#unCiclo();
        } else {
          this.estado.ritmo = 'sin configurar';
          espera = 30000;
        }
      } catch (error) {
        this.#anotar('error', `Ciclo fallido: ${error.message}`);
        espera = 60000;
      }
      this.estado.proximoCiclo = new Date(Date.now() + espera).toISOString();
      await new Promise((r) => setTimeout(r, espera));
    }
  }

  /** Un ciclo completo. Devuelve cuántos milisegundos esperar hasta el siguiente. */
  async #unCiclo() {
    const jornada = await this.#jornadaActual();
    const partidos = await this.#actualizarPartidos(jornada.numero);
    const ritmo = this.#decidirRitmo(partidos, jornada.numero);
    this.estado.ritmo = ritmo.nombre;

    if (ritmo.leerPuntuacion) {
      await this.#leerPuntuacion(jornada.numero);
      await this.#resumenesDePartidosTerminados(jornada.numero, partidos);
    }

    if (Date.now() - this.#ultimoCicloLento > 10 * 60000) {
      this.#ultimoCicloLento = Date.now();
      await this.#cicloLento();
    }

    this.#usuarios.limpiar();
    this.estado.ultimaLectura = new Date().toISOString();
    return ritmo.esperaMs;
  }

  async #jornadaActual() {
    if (this.#jornada && Date.now() - this.#jornadaLeidaEn < 10 * 60000) return this.#jornada;
    this.#jornada = await this.#lector.jornadaActual();
    this.#jornadaLeidaEn = Date.now();
    return this.#jornada;
  }

  async #actualizarPartidos(jornada) {
    const calendario = await this.#lector.calendario(jornada);
    this.#almacen.guardarPartidos(calendario, jornada, ESTADO_FINALIZADO);
    return calendario;
  }

  /**
   * Elige el ritmo según lo que esté pasando.
   *
   * Después del último partido se sigue leyendo un rato porque la puntuación
   * se mueve unos quince minutos más, según la experiencia del usuario.
   */
  #decidirRitmo(partidos, jornada) {
    const rapido = this.#config.numero('segundos_entre_lecturas') * 1000;
    const reposo = this.#config.numero('segundos_en_reposo') * 1000;
    const antelacion = this.#config.numero('minutos_antes_del_partido') * 60000;
    const estabilizacion = this.#config.numero('minutos_estabilizacion') * 60000;
    const ahora = Date.now();

    if (partidos.some((p) => ESTADOS_EN_JUEGO.includes(p.estadoBruto))) {
      return { nombre: 'partido en juego', leerPuntuacion: true, esperaMs: rapido };
    }

    // Tras el pitido final la puntuación sigue moviéndose unos minutos. Se
    // mide desde el momento en que el partido pasó a finalizado, no desde la
    // última lectura, que cambia cada minuto.
    const desde = new Date(ahora - estabilizacion).toISOString();
    if (this.#almacen.partidosReciénTerminados(jornada, ESTADO_FINALIZADO, desde).length > 0) {
      return { nombre: 'ajustando puntos tras el partido', leerPuntuacion: true, esperaMs: rapido };
    }

    const proximo = partidos
      .filter((p) => p.estadoBruto === 1)
      .map((p) => new Date(p.fecha).getTime())
      .filter((t) => t > ahora)
      .sort((a, b) => a - b)[0];

    if (proximo && proximo - ahora <= antelacion) {
      return { nombre: 'a punto de empezar', leerPuntuacion: true, esperaMs: rapido };
    }
    if (proximo) {
      // Despertar justo antes del partido, sin pasarse del ciclo de reposo.
      return { nombre: 'esperando al próximo partido', leerPuntuacion: false, esperaMs: Math.min(reposo, Math.max(30000, proximo - ahora - antelacion)) };
    }
    return { nombre: 'sin partidos', leerPuntuacion: false, esperaMs: reposo };
  }

  // ---------- Lectura de puntuación ----------

  async #leerPuntuacion(jornada) {
    const ligaId = this.#config.obtener('liga_id');
    const servicio = this.#config.obtener('manager_servicio');

    const clasificacion = await this.#lector.clasificacion(ligaId);
    this.#almacen.guardarManagers(clasificacion, servicio);

    const reales = clasificacion.filter((f) => f.managerId !== servicio);

    // Se guarda la clasificación anterior antes de escribir la nueva, para
    // poder comparar el orden.
    const antes = reales
      .map((f) => {
        const previo = this.#almacen.db
          .prepare('SELECT posicion, puntos_generales FROM estado_manager WHERE jornada = ? AND equipo_id = ?')
          .get(jornada, f.equipoId);
        return previo ? { equipoId: f.equipoId, posicion: previo.posicion, puntos: previo.puntos_generales } : null;
      })
      .filter(Boolean);

    const lectura = await this.#lector.alineacionesDeLaJornada(reales.map((r) => r.equipoId), jornada);
    this.estado.lecturaCompleta = lectura.completa;

    if (!lectura.completa) {
      // Una clasificación construida sobre una lectura incompleta no es
      // válida. Se guarda lo leído pero no se narra ningún adelantamiento.
      this.#anotar('aviso', `Lectura incompleta: fallaron ${lectura.fallos.length} equipos`);
    }

    // Guardar puntuación de futbolistas y recoger los cambios.
    const cambiosDeJugador = [];
    for (const [equipoId, alineacion] of lectura.alineaciones) {
      if (!alineacion) continue;
      for (const jugador of alineacion.jugadores) {
        const cambio = this.#almacen.guardarLecturaJugador({
          jornada,
          equipoId,
          futbolistaId: jugador.id,
          puntos: jugador.puntos,
          estadisticas: jugador.estadisticas,
        });
        if (cambio) cambiosDeJugador.push({ ...cambio, jugador });
      }
    }

    // Guardar puntuación de managers.
    for (const fila of reales) {
      const alineacion = lectura.alineaciones.get(fila.equipoId);
      this.#almacen.guardarLecturaManager({
        jornada,
        equipoId: fila.equipoId,
        puntosJornada: alineacion ? alineacion.puntos : fila.puntosJornada,
        puntosGenerales: fila.puntos,
        posicion: this.#posicionSinServicio(reales, fila.equipoId),
      });
    }

    await this.#publicarPrivados(cambiosDeJugador);

    if (lectura.completa) {
      await this.#publicarGrupo({ jornada, antes, reales, cambiosDeJugador });
    }
  }

  /**
   * Posición dentro de la clasificación que narra el bot, que excluye a la
   * cuenta de servicio. Puede no coincidir con la que muestra Fantasy.
   */
  #posicionSinServicio(reales, equipoId) {
    const ordenados = [...reales].sort((a, b) => b.puntos - a.puntos);
    return ordenados.findIndex((f) => f.equipoId === equipoId) + 1;
  }

  // ---------- Publicación ----------

  async #publicarPrivados(cambios) {
    if (!this.#config.activo('publicar_privados') || this.#config.activo('silenciado')) return;

    for (const cambio of cambios) {
      const hechos = hechosDeJugador(cambio);
      if (hechos.length === 0) continue;

      const manager = this.#almacen.managerPorEquipo(cambio.equipoId);
      if (!manager) continue;
      const vinculacion = this.#usuarios.vinculacionDeManager(manager.manager_id);
      if (!vinculacion) continue;

      for (const hecho of hechos) {
        const clave = `privado:${vinculacion.telegram_id}:${hecho.clave}`;
        if (this.#almacen.yaEnviado(clave)) continue;

        const texto = avisoDeHecho({
          hecho,
          futbolista: cambio.jugador?.nombre || cambio.futbolistaId,
          puntos: cambio.ahora.puntos,
        });
        const resultado = await this.#telegram.enviar(vinculacion.telegram_id, texto);

        if (resultado.ok) {
          this.#almacen.marcarEnviado(clave, `privado:${vinculacion.telegram_id}`, texto);
        } else if (resultado.bloqueado) {
          // Ha bloqueado al bot. Se anota como enviado para no reintentar
          // en bucle en cada lectura.
          this.#almacen.marcarEnviado(clave, `bloqueado:${vinculacion.telegram_id}`, null);
          this.#anotar('aviso', `El usuario ${vinculacion.telegram_id} ha bloqueado al bot`);
        }
      }
    }
  }

  async #publicarGrupo({ jornada, antes, reales, cambiosDeJugador }) {
    const grupo = this.#config.obtener('telegram_grupo');
    if (!grupo || !this.#config.activo('publicar_grupo') || this.#config.activo('silenciado')) return;
    if (antes.length === 0) return; // Primera lectura: es la referencia.

    const despues = reales.map((f) => ({
      equipoId: f.equipoId,
      posicion: this.#posicionSinServicio(reales, f.equipoId),
      puntos: f.puntos,
    }));

    const detectados = adelantamientos(antes, despues);
    const necesarias = this.#config.numero('lecturas_para_confirmar');
    const vivos = new Set(detectados.map((a) => a.clave));

    // Un adelantamiento que se deshace deja de contar.
    for (const clave of this.#almacen.candidatosVivos()) {
      if (!vivos.has(clave)) this.#almacen.olvidarCandidato(clave);
    }

    const confirmados = [];
    for (const a of detectados) {
      if (this.#almacen.yaEnviado(`grupo:${jornada}:${a.clave}`)) continue;
      const veces = this.#almacen.anotarCandidato({
        clave: a.clave,
        equipoId: a.adelanta,
        posicion: a.posicionNueva,
        posicionPrevia: antes.find((x) => x.equipoId === a.adelanta)?.posicion ?? 0,
      });
      if (veces >= necesarias) confirmados.push(a);
    }

    if (confirmados.length === 0) return;

    const nombre = (equipoId) => this.#almacen.managerPorEquipo(equipoId)?.nombre || equipoId;
    const conNombres = confirmados.map((a) => ({
      ...a,
      nombreAdelanta: nombre(a.adelanta),
      nombreAdelantado: nombre(a.adelantado),
    }));

    // Por qué ha pasado. Se sacan los futbolistas que han movido la
    // puntuación, en vez de suponer la causa.
    const causas = [];
    for (const a of confirmados) {
      for (const c of culpables(cambiosDeJugador, a.adelanta).slice(0, 2)) {
        const jugador = cambiosDeJugador.find((x) => x.futbolistaId === c.futbolistaId)?.jugador;
        causas.push({
          manager: nombre(a.adelanta),
          futbolista: jugador?.nombre || c.futbolistaId,
          que: c.hechos.length ? c.hechos.map((h) => h.nombre).join(' y ') : `${c.diferencia > 0 ? '+' : ''}${c.diferencia} puntos`,
        });
      }
    }

    const clasificacion = [...reales]
      .sort((a, b) => b.puntos - a.puntos)
      .map((f, i) => ({ posicion: i + 1, nombre: nombre(f.equipoId), puntos: f.puntos }));

    const datos = datosParaElComentario({ adelantamientos: conNombres, causas, clasificacion });
    const { texto, delModelo, motivo } = await this.#redactor.comentarAdelantamiento(datos, this.#config.obtener('tono'));
    if (motivo) this.#anotar('aviso', `El redactor usó el respaldo: ${motivo}`);

    const resultado = await this.#telegram.enviar(grupo, texto);
    if (resultado.ok) {
      for (const a of confirmados) {
        this.#almacen.marcarEnviado(`grupo:${jornada}:${a.clave}`, 'grupo', texto);
        this.#almacen.olvidarCandidato(a.clave);
      }
      this.#anotar('info', `Comentario publicado en el grupo${delModelo ? '' : ' (texto de respaldo)'}`);
    } else {
      this.#anotar('error', `No se pudo publicar en el grupo: ${resultado.motivo}`);
    }
  }

  // ---------- Resúmenes de final de partido ----------

  async #resumenesDePartidosTerminados(jornada, calendario) {
    if (!this.#config.activo('publicar_privados') || this.#config.activo('silenciado')) return;

    const estabilizacion = this.#config.numero('minutos_estabilizacion');
    const limite = new Date(Date.now() - estabilizacion * 60000).toISOString();
    // Un partido que lleva más de seis horas terminado ya no se resume: el
    // momento ha pasado y solo desconcertaría al grupo.
    const caducidad = new Date(Date.now() - 6 * 3600000).toISOString();
    const pendientes = this.#almacen.partidosPendientesDeResumen(jornada, ESTADO_FINALIZADO, limite, caducidad);

    for (const partido of pendientes) {
      const equipos = [partido.local_id, partido.visitante_id];
      const marcador = `${partido.goles_local}-${partido.goles_visitante}`;

      for (const manager of this.#almacen.managersReales()) {
        const vinculacion = this.#usuarios.vinculacionDeManager(manager.manager_id);
        if (!vinculacion) continue;

        let alineacion;
        try {
          alineacion = await this.#lector.alineacion(manager.equipo_id, jornada);
        } catch (error) {
          this.#anotar('aviso', `No se pudo leer la alineación de ${manager.nombre}: ${error.message}`);
          continue;
        }
        if (!alineacion) continue;

        const resumen = resumenDePartido({ alineacion, equiposDelPartido: equipos, jornada });
        if (!resumen) continue; // No tenía futbolistas en ese partido.

        const clave = `resumen:${partido.id}:${manager.manager_id}`;
        if (this.#almacen.yaEnviado(clave)) continue;

        const texto = resumenPrivadoDePartido({ resumen, marcador });
        const resultado = await this.#telegram.enviar(vinculacion.telegram_id, texto);
        if (resultado.ok || resultado.bloqueado) this.#almacen.marcarEnviado(clave, `privado:${vinculacion.telegram_id}`, texto);
      }

      this.#almacen.marcarResumenEnviado(partido.id);
    }
  }

  // ---------- Lecturas que alimentan el histórico ----------

  async #cicloLento() {
    const ligaId = this.#config.obtener('liga_id');
    if (!ligaId) return;

    // La lista de managers debe existir aunque no haya partidos: el bot la
    // necesita para que cada amigo elija quién es.
    try {
      const clasificacion = await this.#lector.clasificacion(ligaId);
      this.#almacen.guardarManagers(clasificacion, this.#config.obtener('manager_servicio'));
    } catch (error) {
      this.#anotar('aviso', `No se pudo refrescar la lista de managers: ${error.message}`);
    }

    try {
      const actividad = await this.#lector.actividadCompleta(ligaId);
      const nuevas = this.#almacen.guardarActividad(actividad);
      if (nuevas.length > 0) {
        this.#anotar('info', `${nuevas.length} movimientos nuevos en la liga`);
        // Un movimiento cambia las plantillas: conviene mirarlas ya, para
        // que el cambio de propietario quede con una hora cercana a la real.
        await this.#sincronizarPlantillas(ligaId);
      }
    } catch (error) {
      this.#anotar('aviso', `No se pudo leer la actividad: ${error.message}`);
    }

    try {
      this.#almacen.guardarMercado(await this.#lector.mercado(ligaId));
    } catch (error) {
      this.#anotar('aviso', `No se pudo leer el mercado: ${error.message}`);
    }

    try {
      const jornada = await this.#jornadaActual();
      await this.#rellenarJornadasPasadas(jornada.numero);
    } catch (error) {
      this.#anotar('aviso', `No se pudieron recuperar las jornadas pasadas: ${error.message}`);
    }

    // Catálogo y valores: una vez al día basta.
    if (!this.#almacen.hayValoresDe(hoy())) {
      try {
        const futbolistas = await this.#lector.futbolistas();
        this.#almacen.guardarFutbolistas(futbolistas);
        this.#almacen.guardarValoresDelDia(futbolistas);
        await this.#sincronizarPlantillas(ligaId);
        this.#anotar('info', `Valores del día guardados: ${futbolistas.length} futbolistas`);
      } catch (error) {
        this.#anotar('aviso', `No se pudieron leer los valores de mercado: ${error.message}`);
      }
    }
  }

  /**
   * Recupera los resultados de las jornadas ya jugadas.
   *
   * El bot ha arrancado a mitad de temporada, así que sin esto la pantalla
   * de cada manager solo mostraría la jornada en curso. Se hace una vez por
   * jornada pasada y queda anotado hasta dónde se ha llegado.
   */
  async #rellenarJornadasPasadas(jornadaActual) {
    const hecho = this.#config.numero('jornadas_rellenadas');
    if (hecho >= jornadaActual - 1) return;

    const managers = this.#almacen.managersReales();
    if (managers.length === 0) return;

    for (let jornada = hecho + 1; jornada < jornadaActual; jornada += 1) {
      let leidas = 0;
      for (const manager of managers) {
        try {
          const alineacion = await this.#lector.alineacion(manager.equipo_id, jornada);
          if (!alineacion) continue;
          for (const jugador of alineacion.jugadores) {
            this.#almacen.guardarLecturaJugador({
              jornada,
              equipoId: manager.equipo_id,
              futbolistaId: jugador.id,
              puntos: jugador.puntos,
              estadisticas: jugador.estadisticas,
            });
          }
          this.#almacen.guardarLecturaManager({
            jornada,
            equipoId: manager.equipo_id,
            puntosJornada: alineacion.puntos,
            puntosGenerales: null,
            posicion: null,
          });
          leidas += 1;
        } catch (error) {
          this.#anotar('aviso', `No se pudo recuperar la jornada ${jornada} de ${manager.nombre}: ${error.message}`);
        }
      }
      // Las posiciones de esa jornada se calculan con lo leído, ordenando
      // por los puntos de la jornada.
      this.#colocarPuestosDeJornada(jornada);
      this.#config.poner('jornadas_rellenadas', String(jornada));
      this.#anotar('info', `Recuperada la jornada ${jornada}: ${leidas} managers`);
    }
  }

  #colocarPuestosDeJornada(jornada) {
    const filas = this.#almacen.db
      .prepare('SELECT equipo_id, puntos_jornada FROM estado_manager WHERE jornada = ? ORDER BY puntos_jornada DESC')
      .all(jornada);
    const actualizar = this.#almacen.db.prepare('UPDATE estado_manager SET posicion = ? WHERE jornada = ? AND equipo_id = ?');
    filas.forEach((fila, indice) => actualizar.run(indice + 1, jornada, fila.equipo_id));
  }

  async #sincronizarPlantillas(ligaId) {
    for (const manager of this.#almacen.managers()) {
      try {
        const plantilla = await this.#lector.plantilla(ligaId, manager.equipo_id);
        this.#almacen.sincronizarPlantilla(manager.equipo_id, plantilla.futbolistas.map((f) => f.id));
      } catch (error) {
        this.#anotar('aviso', `No se pudo leer la plantilla de ${manager.nombre}: ${error.message}`);
      }
    }
  }

  // ---------- Consultas para la web ----------

  dineroDeCadaManager() {
    const presupuesto = this.#config.numero('presupuesto_inicial');
    const managers = this.#almacen.managers();
    const calculo = calcularDinero(this.#almacen.todaLaActividad(), presupuesto, managers.map((m) => m.manager_id));
    return calculo.map((c) => ({
      ...c,
      nombre: managers.find((m) => m.manager_id === c.managerId)?.nombre,
      sinPresupuesto: !presupuesto,
    }));
  }

  /**
   * Deduce el presupuesto inicial a partir del dinero real de un manager.
   *
   * La API no deja leer el dinero de un rival, pero el usuario sí ve el suyo
   * en la aplicación oficial. Con esa cifra y los movimientos registrados se
   * despeja el presupuesto de partida, que es el mismo para todos.
   *
   * Sin calibrar, las cifras de dinero se desplazan todas por igual: las
   * diferencias entre managers son correctas, el valor absoluto no.
   */
  calibrarPresupuesto({ managerId, dineroReal }) {
    const calculo = calcularDinero(this.#almacen.todaLaActividad(), 0, [managerId]);
    const movimiento = calculo[0]?.dinero ?? 0;
    const inicial = Math.round(dineroReal - movimiento);
    this.#config.poner('presupuesto_inicial', String(inicial));
    return {
      presupuestoInicial: inicial,
      movimientoNeto: movimiento,
      managerId: String(managerId),
    };
  }

  /** Comprueba que la clave y la dirección del modelo funcionan. */
  probarRedactor() {
    return this.#redactor.comprobar();
  }

  /** Lectura forzada desde el panel de administración. */
  async forzarLectura() {
    if (!this.configurado) throw new Error('Faltan credenciales o identificador de liga.');
    const jornada = await this.#jornadaActual();
    await this.#actualizarPartidos(jornada.numero);
    await this.#leerPuntuacion(jornada.numero);
    this.#ultimoCicloLento = 0;
    this.estado.ultimaLectura = new Date().toISOString();
    return { jornada: jornada.numero, completa: this.estado.lecturaCompleta };
  }
}
