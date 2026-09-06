const HOST = 'https://fantasy-api.llt-services.com';

// Cabeceras que envía la aplicación oficial. Sin x-app la API responde
// de forma distinta, así que se mandan siempre.
const CABECERAS = {
  'x-app': '2',
  'x-lang': 'es',
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

export class ErrorFantasy extends Error {
  constructor(mensaje, { estado, ruta, cuerpo } = {}) {
    super(mensaje);
    this.name = 'ErrorFantasy';
    this.estado = estado;
    this.ruta = ruta;
    this.cuerpo = cuerpo;
  }
}

/**
 * Cliente de solo lectura de la API de LaLiga Fantasy.
 *
 * Solo expone GET a propósito. El bot no debe pujar, vender, pagar cláusulas
 * ni cambiar alineaciones, así que no existe forma de hacerlo desde aquí.
 */
export class ClienteFantasy {
  #sesion;
  #tiempoLimite;

  constructor({ sesion, tiempoLimiteMs = 25000 }) {
    this.#sesion = sesion;
    this.#tiempoLimite = tiempoLimiteMs;
  }

  async #peticion(ruta, bearer) {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), this.#tiempoLimite);
    try {
      const respuesta = await fetch(`${HOST}${ruta}`, {
        headers: { ...CABECERAS, Authorization: `Bearer ${bearer}` },
        signal: control.signal,
      });
      const texto = await respuesta.text();
      let datos = null;
      if (texto.trim()) {
        try {
          datos = JSON.parse(texto);
        } catch {
          datos = texto;
        }
      }
      return { estado: respuesta.status, datos };
    } finally {
      clearTimeout(temporizador);
    }
  }

  /**
   * Hace un GET autenticado. Si la API responde 401, renueva la sesión
   * y reintenta una vez. Un segundo 401 se considera un fallo real.
   *
   * Devuelve el cuerpo de la respuesta. Un 204 devuelve null: significa
   * que la consulta es válida pero no hay contenido, por ejemplo la
   * alineación de un manager que no jugó esa jornada.
   */
  async get(ruta) {
    let resultado = await this.#intentar(ruta);

    if (resultado.estado === 401) {
      this.#sesion.invalidar();
      resultado = await this.#intentar(ruta);
    }

    if (resultado.estado === 204) return null;

    if (resultado.estado < 200 || resultado.estado >= 300) {
      throw new ErrorFantasy(`La API respondió HTTP ${resultado.estado}`, {
        estado: resultado.estado,
        ruta,
        cuerpo: resultado.datos,
      });
    }

    return resultado.datos;
  }

  /**
   * Un intento con reintentos cortos.
   *
   * Fantasy corta peticiones y devuelve 502 cuando se le pide mucho seguido.
   * Sin reintentar, una lectura durante un partido se perdía entera y el
   * aviso llegaba con el siguiente ciclo. Ocurrió el 6 de septiembre de 2026:
   * cuatro ciclos seguidos fallaron y una asistencia se avisó una hora tarde.
   */
  async #intentar(ruta, intentos = 3) {
    let ultimo = null;
    for (let i = 0; i < intentos; i += 1) {
      try {
        const bearer = await this.#sesion.token();
        const resultado = await this.#peticion(ruta, bearer);
        // Un fallo del servidor merece otro intento; un 4xx no, porque
        // volvería a responder lo mismo.
        if (resultado.estado < 500) return resultado;
        ultimo = resultado;
      } catch (error) {
        ultimo = { estado: 0, datos: null, error };
      }
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
    if (ultimo?.error) throw ultimo.error;
    return ultimo;
  }
}
