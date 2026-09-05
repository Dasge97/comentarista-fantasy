import fs from 'node:fs';

// Valores tomados del cliente publicado en Externoak/LaLigaApp,
// fichero src/services/authService.js. La autenticación de Fantasy usa
// Azure AD B2C con dos políticas distintas: una para correo y contraseña,
// otra para el inicio de sesión interactivo.
const BASE = 'https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token';
const CLIENTE_CORREO = 'af88bcff-1157-40a0-b579-030728aacf0b';
const POLITICA_CORREO = 'B2C_1A_ResourceOwnerv2';
const POLITICA_RENOVACION = 'B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN';
const REDIRECT_URI = 'authredirect://com.lfp.laligafantasy';

// Se considera caducado cinco minutos antes de la hora real, para no
// empezar una petición con un token que caduca a mitad de camino.
const MARGEN_CADUCIDAD_MS = 5 * 60 * 1000;

async function pedirTokens(politica, cuerpo) {
  const respuesta = await fetch(`${BASE}?p=${politica}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(cuerpo).toString(),
  });

  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = null;
  }

  if (!respuesta.ok) {
    const motivo = datos?.error_description || datos?.error || texto.slice(0, 200);
    const error = new Error(`Autenticación rechazada (HTTP ${respuesta.status}): ${motivo}`);
    error.estado = respuesta.status;
    throw error;
  }

  return datos;
}

function normalizarTokens(respuesta) {
  // B2C devuelve access_token e id_token. La API acepta cualquiera de los
  // dos como Bearer, comprobado el 5 de septiembre de 2026 contra
  // /api/v4/user/me. Se usa access_token y se guarda id_token por si acaso.
  const segundos = Number(respuesta.expires_in || respuesta.id_token_expires_in || 86400);
  return {
    bearer: respuesta.access_token || respuesta.id_token,
    idToken: respuesta.id_token || null,
    refreshToken: respuesta.refresh_token || null,
    caducaEn: Date.now() + segundos * 1000,
    obtenidoEn: Date.now(),
  };
}

export class Sesion {
  #email;
  #password;
  #fichero;
  #tokens = null;
  #enCurso = null;

  constructor({ email, password, fichero }) {
    this.#email = email;
    this.#password = password;
    this.#fichero = fichero || null;
    this.#tokens = this.#leerDeDisco();
  }

  #leerDeDisco() {
    if (!this.#fichero || !fs.existsSync(this.#fichero)) return null;
    try {
      const guardado = JSON.parse(fs.readFileSync(this.#fichero, 'utf8'));
      return guardado?.bearer ? guardado : null;
    } catch {
      return null;
    }
  }

  #guardarEnDisco() {
    if (!this.#fichero || !this.#tokens) return;
    // El fichero contiene tokens, que son secretos. Permisos solo para el dueño.
    fs.writeFileSync(this.#fichero, JSON.stringify(this.#tokens, null, 2), { mode: 0o600 });
  }

  get caducado() {
    if (!this.#tokens) return true;
    return this.#tokens.caducaEn - Date.now() < MARGEN_CADUCIDAD_MS;
  }

  get estado() {
    if (!this.#tokens) return { activa: false };
    return {
      activa: !this.caducado,
      caducaEn: new Date(this.#tokens.caducaEn).toISOString(),
      minutosRestantes: Math.round((this.#tokens.caducaEn - Date.now()) / 60000),
      tieneRefresco: Boolean(this.#tokens.refreshToken),
    };
  }

  /**
   * Devuelve un Bearer válido. Renueva o vuelve a iniciar sesión si hace falta.
   * Varias llamadas simultáneas comparten la misma operación en curso, para no
   * pedir dos veces el mismo token cuando el sondeo lanza peticiones en paralelo.
   */
  async token() {
    if (!this.caducado) return this.#tokens.bearer;
    if (!this.#enCurso) {
      this.#enCurso = this.#obtenerTokenNuevo().finally(() => {
        this.#enCurso = null;
      });
    }
    await this.#enCurso;
    return this.#tokens.bearer;
  }

  async #obtenerTokenNuevo() {
    if (this.#tokens?.refreshToken) {
      try {
        await this.renovar();
        return;
      } catch {
        // La renovación ha fallado. Se intenta con correo y contraseña,
        // que siempre funciona mientras la cuenta exista.
      }
    }
    await this.iniciarSesion();
  }

  /** Inicia sesión con correo y contraseña. */
  async iniciarSesion() {
    const respuesta = await pedirTokens(POLITICA_CORREO, {
      grant_type: 'password',
      client_id: CLIENTE_CORREO,
      scope: `openid ${CLIENTE_CORREO} offline_access`,
      redirect_uri: REDIRECT_URI,
      username: this.#email,
      password: this.#password,
      response_type: 'id_token',
    });

    this.#tokens = normalizarTokens(respuesta);
    this.#guardarEnDisco();
    return this.estado;
  }

  /**
   * Renueva el token sin usar la contraseña.
   *
   * Comprobado el 5 de septiembre de 2026: la política que acepta un refresh
   * token emitido por correo y contraseña es la misma que lo emitió,
   * B2C_1A_ResourceOwnerv2. Se prueba primero. La otra queda como respaldo
   * porque LaLigaApp usa esa y podría cambiar cuál funciona.
   */
  async renovar() {
    if (!this.#tokens?.refreshToken) {
      throw new Error('No hay refresh token guardado.');
    }

    const cuerpo = {
      grant_type: 'refresh_token',
      refresh_token: this.#tokens.refreshToken,
      client_id: CLIENTE_CORREO,
      scope: 'openid offline_access',
    };

    let ultimoError = null;
    for (const politica of [POLITICA_CORREO, POLITICA_RENOVACION]) {
      try {
        const respuesta = await pedirTokens(politica, cuerpo);
        this.#tokens = normalizarTokens(respuesta);
        this.#guardarEnDisco();
        return { ...this.estado, politica };
      } catch (error) {
        ultimoError = error;
      }
    }
    throw ultimoError;
  }

  /** Marca la sesión como caducada. La siguiente petición pedirá un token nuevo. */
  invalidar() {
    if (this.#tokens) this.#tokens.caducaEn = 0;
  }
}

export function crearSesion({ email, password, fichero }) {
  return new Sesion({ email, password, fichero });
}
