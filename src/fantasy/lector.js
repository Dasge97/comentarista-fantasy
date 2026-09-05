import { crearSesion } from './auth.js';
import { ClienteFantasy } from './cliente.js';
import {
  normalizarAlineacion,
  normalizarCalendario,
  normalizarClasificacion,
  normalizarClasificacionJornada,
  normalizarLiga,
} from './normalizar.js';

/**
 * Lector de LaLiga Fantasy.
 *
 * Es la única pieza que conoce las rutas de la API. Si Fantasy cambia una
 * ruta, se toca aquí y nada más. El resto del bot trabaja con los objetos
 * ya normalizados.
 *
 * Las rutas salen del cliente publicado en Externoak/LaLigaApp, fichero
 * src/services/api.js, y se comprobaron una por una contra la liga real
 * el 5 de septiembre de 2026.
 */
export class LectorFantasy {
  #cliente;
  #cmp;

  constructor({ email, password, ficheroSesion, competicionId = '1' }) {
    this.sesion = crearSesion({ email, password, fichero: ficheroSesion });
    this.#cliente = new ClienteFantasy({ sesion: this.sesion });
    this.#cmp = `/api/v1/competition/${competicionId}`;
  }

  get estadoSesion() {
    return this.sesion.estado;
  }

  /** Datos de la cuenta con la que se ha iniciado sesión. */
  async usuarioActual() {
    const datos = await this.#cliente.get('/api/v4/user/me?x-lang=es');
    return {
      managerId: String(datos.id),
      nombre: datos.managerName,
      baneado: Boolean(datos.banned),
    };
  }

  /** Ligas a las que pertenece la cuenta. Incluye las reglas de cada una. */
  async ligas() {
    const datos = await this.#cliente.get(`${this.#cmp}/leagues?x-lang=es`);
    return (datos || []).map(normalizarLiga);
  }

  /** Clasificación general. El campo `puntos` ya incluye la jornada en curso. */
  async clasificacion(ligaId) {
    const datos = await this.#cliente.get(`${this.#cmp}/leagues/${ligaId}/standing?x-lang=es`);
    return normalizarClasificacion(datos);
  }

  /** Clasificación de una jornada aislada. */
  async clasificacionJornada(ligaId, jornada) {
    const datos = await this.#cliente.get(`${this.#cmp}/leagues/${ligaId}/standing/${jornada}?x-lang=es`);
    return normalizarClasificacionJornada(datos);
  }

  /**
   * Once de un equipo en una jornada concreta.
   *
   * Devuelve null si la API responde 204, que significa que ese equipo no
   * participó en esa jornada. Es el caso de la cuenta de servicio en las
   * jornadas anteriores a su entrada en la liga.
   */
  async alineacion(equipoId, jornada) {
    const datos = await this.#cliente.get(`${this.#cmp}/teams/${equipoId}/lineup/week/${jornada}?x-lang=es`);
    return normalizarAlineacion(datos, { equipoId, jornada });
  }

  /** Plantilla completa de un equipo dentro de la liga. */
  async plantilla(ligaId, equipoId) {
    const datos = await this.#cliente.get(`${this.#cmp}/leagues/${ligaId}/teams/${equipoId}?x-lang=es`);
    return {
      equipoId: String(equipoId),
      valor: datos.teamValue != null ? Number(datos.teamValue) : null,
      futbolistas: (datos.players || []).map((entrada) => {
        const maestro = entrada.playerMaster || entrada;
        return {
          id: String(maestro.id),
          nombre: maestro.nickname || maestro.name,
          equipoRealNombre: maestro.team?.name || null,
          puntosTemporada: maestro.points != null ? Number(maestro.points) : null,
        };
      }),
    };
  }

  /** Jornada en curso y si está en directo. */
  async jornadaActual() {
    const datos = await this.#cliente.get(`${this.#cmp}/week/current?x-lang=es`);
    return {
      numero: Number(datos.weekNumber),
      anterior: datos.previousWeek != null ? Number(datos.previousWeek) : null,
      siguiente: datos.nextWeek != null ? Number(datos.nextWeek) : null,
      enDirecto: Boolean(datos.isLive),
      abre: datos.openingWeekDate,
      cierra: datos.closingWeekDate,
    };
  }

  /** Partidos de una jornada, con estado y marcador. */
  async calendario(jornada) {
    const datos = await this.#cliente.get(`${this.#cmp}/calendar?weekNumber=${jornada}&x-lang=es`);
    return normalizarCalendario(datos);
  }

  /**
   * Mercado de la liga.
   *
   * Trae dos cosas distintas mezcladas, que conviene separar:
   * `marketPlayerLeague` son futbolistas libres que ofrece el juego, y
   * `marketPlayerTeam` son futbolistas que un manager ha puesto a la venta.
   * Solo los segundos tienen vendedor y cláusula de rescisión.
   *
   * No incluye el importe de las pujas ajenas, solo cuántas hay.
   */
  async mercado(ligaId) {
    const datos = await this.#cliente.get(`${this.#cmp}/league/${ligaId}/market?x-lang=es`);
    return (datos || []).map((entrada) => {
      const deManager = entrada.discr === 'marketPlayerTeam';
      const vendedor = entrada.sellerTeam || entrada.playerTeam?.manager ? entrada.sellerTeam : null;
      return {
        id: String(entrada.id),
        origen: deManager ? 'manager' : 'libre',
        futbolistaId: String(entrada.playerMaster?.id),
        futbolistaNombre: entrada.playerMaster?.nickname || entrada.playerMaster?.name,
        precio: entrada.salePrice != null ? Number(entrada.salePrice) : null,
        expira: entrada.expirationDate,
        estado: entrada.status,
        // Los libres cuentan pujas; los de manager cuentan ofertas.
        numeroDePujas: Number(entrada.numberOfBids ?? entrada.numberOfOffers ?? 0),
        vendedorEquipoId: vendedor?.id ? String(vendedor.id) : null,
        vendedorNombre: vendedor?.manager?.managerName || entrada.playerTeam?.manager?.managerName || null,
        clausula: entrada.playerTeam?.buyoutClause != null ? Number(entrada.playerTeam.buyoutClause) : null,
      };
    });
  }

  /** Actividad de la liga: fichajes, ventas y movimientos. */
  async actividad(ligaId, indice = 0) {
    const datos = await this.#cliente.get(`${this.#cmp}/leagues/${ligaId}/activity/${indice}?x-lang=es`);
    return (datos || []).map((entrada) => ({
      id: String(entrada.id),
      tipo: Number(entrada.activityTypeId),
      managerId: entrada.user1Id != null ? String(entrada.user1Id) : null,
      // En una compra a otro manager, user2Id es quien vende y cobra.
      manager2Id: entrada.user2Id != null ? String(entrada.user2Id) : null,
      futbolistaId: entrada.playerMasterId != null ? String(entrada.playerMasterId) : null,
      importe: entrada.amount != null ? Number(entrada.amount) : null,
      jornada: entrada.weekNumber != null ? Number(entrada.weekNumber) : null,
      fecha: entrada.createdAt,
    }));
  }

  /**
   * Toda la actividad de la liga, recorriendo las páginas hasta el final.
   * El registro llega hasta el arranque de la liga, así que la primera vez
   * se descarga el histórico completo.
   */
  async actividadCompleta(ligaId, paginasMaximas = 20) {
    const vistas = new Map();
    for (let i = 0; i < paginasMaximas; i += 1) {
      const pagina = await this.actividad(ligaId, i);
      if (pagina.length === 0) break;
      const antes = vistas.size;
      for (const entrada of pagina) vistas.set(entrada.id, entrada);
      // Si una página no aporta nada nuevo, se ha llegado al final.
      if (vistas.size === antes) break;
    }
    return [...vistas.values()];
  }

  /** Catálogo completo de futbolistas con su valor de mercado. */
  async futbolistas() {
    const datos = await this.#cliente.get(`${this.#cmp}/players?x-lang=es`);
    return (datos || []).map((f) => ({
      id: String(f.id),
      nombre: f.nickname || f.name,
      posicionId: f.positionId != null ? Number(f.positionId) : null,
      equipoRealId: f.teamId != null ? String(f.teamId) : null,
      estado: f.playerStatus || null,
      valor: f.marketValue != null ? Number(f.marketValue) : null,
      puntos: f.points != null ? Number(f.points) : null,
      media: f.averagePoints != null ? Number(f.averagePoints) : null,
    }));
  }

  /** Dinero de la cuenta propia. Para un rival responde HTTP 403. */
  async dineroPropio(equipoId) {
    const datos = await this.#cliente.get(`${this.#cmp}/teams/${equipoId}/money?x-lang=es`);
    return { dinero: Number(datos.teamMoney), invertido: Number(datos.teamInvestment ?? 0) };
  }

  /**
   * Lee la alineación de la jornada de todos los equipos indicados.
   *
   * Si falla la lectura de un equipo, no se descarta ese equipo en silencio:
   * la lectura se marca como incompleta. Una clasificación construida sobre
   * una lectura incompleta no es válida y el bot no debe narrarla.
   */
  async alineacionesDeLaJornada(equipoIds, jornada) {
    const alineaciones = new Map();
    const fallos = [];

    for (const equipoId of equipoIds) {
      try {
        alineaciones.set(String(equipoId), await this.alineacion(equipoId, jornada));
      } catch (error) {
        fallos.push({ equipoId: String(equipoId), motivo: error.message });
      }
    }

    return {
      jornada: Number(jornada),
      alineaciones,
      fallos,
      completa: fallos.length === 0,
      observadoEn: new Date().toISOString(),
    };
  }
}
