import fs from 'node:fs';
import crypto from 'node:crypto';

// Inicio de sesión de LaLiga Fantasy (Azure AD B2C).
//
// LaLiga retiró el 15 de octubre de 2026 el inicio de sesión directo con
// correo y contraseña (la política B2C_1A_ResourceOwnerv2 responde 404).
// Desde entonces solo funciona entrar en la página de LaLiga, en el
// navegador, con código de autorización y PKCE. Es lo mismo que hace
// Externoak/LaLigaApp desde su versión 3.5.5, en src/services/authService.js.
//
// El flujo:
//   1. prepararLogin() da la dirección de la página de LaLiga.
//   2. El administrador entra ahí con la cuenta del bot. Al terminar, la
//      página intenta abrir authredirect://com.lfp.laligafantasy?code=...
//      El navegador no sabe abrir esa dirección, pero la deja escrita en la
//      consola de las herramientas de desarrollador.
//   3. completarLogin() recibe esa dirección, cambia el código por tokens y
//      los guarda.
//   4. Después, renovar() mantiene la sesión con el refresh token, sin
//      volver a pasar por la página.
const BASE = 'https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0';
const CLIENTE = 'af88bcff-1157-40a0-b579-030728aacf0b';
const POLITICA = 'B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN';
const REDIRECT_URI = 'authredirect://com.lfp.laligafantasy';

// Se considera caducado cinco minutos antes de la hora real, para no
// empezar una petición con un token que caduca a mitad de camino.
const MARGEN_CADUCIDAD_MS = 5 * 60 * 1000;

// Tiempo que vale una dirección de login preparada.
const VALIDEZ_LOGIN_MS = 20 * 60 * 1000;

/** No hay sesión utilizable: alguien tiene que entrar en la página de LaLiga desde el panel. */
export class ErrorSinSesion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorSinSesion';
    this.sinSesion = true;
  }
}

const base64url = (buffer) => buffer.toString('base64url');

async function pedirTokens(cuerpo) {
  const respuesta = await fetch(`${BASE}/token?p=${POLITICA}`, {
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
    const motivo = String(datos?.error_description || datos?.error || texto.slice(0, 200));
    const error = new Error(`Autenticación rechazada (HTTP ${respuesta.status}): ${motivo.split('\n')[0]}`);
    error.estado = respuesta.status;
    throw error;
  }

  return datos;
}

function normalizarTokens(respuesta) {
  // Con el alcance "openid offline_access", B2C devuelve id_token y no
  // access_token. La API acepta el id_token como Bearer (comprobado el
  // 5 de septiembre de 2026 contra /api/v4/user/me).
  const segundos = Number(respuesta.id_token_expires_in || respuesta.expires_in || 3600);
  return {
    bearer: respuesta.access_token || respuesta.id_token,
    idToken: respuesta.id_token || null,
    refreshToken: respuesta.refresh_token || null,
    clienteId: CLIENTE,
    caducaEn: Date.now() + segundos * 1000,
    obtenidoEn: Date.now(),
  };
}

/** Saca el código de la dirección authredirect://...?code=...&state=..., o acepta un código suelto. */
export function leerRespuestaDeLogin(texto) {
  let limpio = String(texto || '').trim();
  const inicio = limpio.indexOf('authredirect://');
  if (inicio >= 0) limpio = limpio.slice(inicio);
  limpio = limpio.split(/\s/)[0].replace(/['"’]+$/, '');
  if (!limpio) throw new Error('No has pegado nada.');
  if (!limpio.includes('=')) return { codigo: limpio, estado: null };

  const parametros = new URLSearchParams(limpio.slice(limpio.indexOf('?') + 1).split('#')[0]);
  const errorB2C = parametros.get('error_description') || parametros.get('error');
  if (errorB2C) throw new Error(`La página de LaLiga devolvió un error: ${errorB2C}`);
  const codigo = parametros.get('code');
  if (!codigo) {
    throw new Error('En lo que has pegado no hay ningún "code=". Copia la dirección completa que empieza por authredirect://');
  }
  return { codigo, estado: parametros.get('state') };
}

export class Sesion {
  #fichero;
  #tokens = null;
  #enCurso = null;
  #pendiente = null; // login preparado: { verificador, estado, creadoEn }
  #renovacionFallida = null; // motivo del último fallo definitivo al renovar

  constructor({ fichero }) {
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

  /** true si hace falta que alguien entre en la página de LaLiga desde el panel. */
  get necesitaLogin() {
    return !this.#tokens?.refreshToken || Boolean(this.#renovacionFallida);
  }

  get estado() {
    const base = { necesitaLogin: this.necesitaLogin, motivo: this.#renovacionFallida };
    if (!this.#tokens) return { ...base, activa: false };
    return {
      ...base,
      activa: !this.caducado,
      caducaEn: new Date(this.#tokens.caducaEn).toISOString(),
      minutosRestantes: Math.round((this.#tokens.caducaEn - Date.now()) / 60000),
      tieneRefresco: Boolean(this.#tokens.refreshToken),
      ultimoLogin: this.#tokens.loginEn ? new Date(this.#tokens.loginEn).toISOString() : null,
    };
  }

  /**
   * Devuelve un Bearer válido. Renueva con el refresh token si hace falta.
   * Varias llamadas simultáneas comparten la misma renovación en curso.
   * Si no hay forma de renovar, lanza ErrorSinSesion.
   */
  async token() {
    if (!this.caducado) return this.#tokens.bearer;
    if (this.necesitaLogin) {
      throw new ErrorSinSesion(
        this.#renovacionFallida
          ? `La sesión de Fantasy no se puede renovar (${this.#renovacionFallida}). Hay que volver a entrar desde el panel, en Estado.`
          : 'No hay sesión de Fantasy. Hay que entrar desde el panel, en Estado.',
      );
    }
    if (!this.#enCurso) {
      this.#enCurso = this.renovar().finally(() => {
        this.#enCurso = null;
      });
    }
    await this.#enCurso;
    return this.#tokens.bearer;
  }

  /** Renueva el token con el refresh token, sin pasar por la página de LaLiga. */
  async renovar() {
    const anterior = this.#tokens;
    if (!anterior?.refreshToken) throw new ErrorSinSesion('No hay refresh token guardado.');
    try {
      const respuesta = await pedirTokens({
        grant_type: 'refresh_token',
        refresh_token: anterior.refreshToken,
        client_id: anterior.clienteId || CLIENTE,
        scope: 'openid offline_access',
      });
      const nuevos = normalizarTokens(respuesta);
      // Si B2C no devuelve un refresh token nuevo, se conserva el anterior.
      nuevos.refreshToken = nuevos.refreshToken || anterior.refreshToken;
      nuevos.loginEn = anterior.loginEn || null;
      this.#tokens = nuevos;
      this.#guardarEnDisco();
      return this.estado;
    } catch (error) {
      // Un 400 o 401 de B2C significa que el refresh token ya no vale
      // (caducado, revocado o cifrado con una clave que ya no existe).
      // Reintentar no sirve: hace falta entrar otra vez. Los fallos de red
      // o los 5xx pueden arreglarse solos y no se marcan.
      if (error.estado === 400 || error.estado === 401) {
        this.#renovacionFallida = error.message;
        throw new ErrorSinSesion(
          `La sesión de Fantasy no se puede renovar (${error.message}). Hay que volver a entrar desde el panel, en Estado.`,
        );
      }
      throw error;
    }
  }

  /** Prepara un login nuevo y devuelve la dirección de la página de LaLiga. */
  prepararLogin() {
    const verificador = base64url(crypto.randomBytes(32));
    const reto = base64url(crypto.createHash('sha256').update(verificador).digest());
    const estado = base64url(crypto.randomBytes(16));
    this.#pendiente = { verificador, estado, creadoEn: Date.now() };

    // No se manda prompt=login: esta política puede rechazarlo.
    const parametros = new URLSearchParams({
      p: POLITICA,
      client_id: CLIENTE,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: 'openid offline_access',
      code_challenge: reto,
      code_challenge_method: 'S256',
      state: estado,
      nonce: estado,
    });
    return {
      url: `${BASE}/authorize?${parametros.toString()}`,
      caducaEn: new Date(Date.now() + VALIDEZ_LOGIN_MS).toISOString(),
    };
  }

  /** Recibe la dirección authredirect://... que dejó la página de LaLiga y guarda los tokens. */
  async completarLogin(texto) {
    const pendiente = this.#pendiente;
    if (!pendiente || Date.now() - pendiente.creadoEn > VALIDEZ_LOGIN_MS) {
      throw new Error('No hay ningún login preparado, o ha caducado. Pulsa otra vez el botón que abre la página de LaLiga.');
    }
    const { codigo, estado } = leerRespuestaDeLogin(texto);
    if (estado && estado !== pendiente.estado) {
      throw new Error('Esa dirección es de un intento anterior. Copia la del último login que has hecho.');
    }

    const respuesta = await pedirTokens({
      grant_type: 'authorization_code',
      client_id: CLIENTE,
      code: codigo,
      redirect_uri: REDIRECT_URI,
      code_verifier: pendiente.verificador,
      scope: 'openid offline_access',
    });
    if (!respuesta.access_token && !respuesta.id_token) {
      throw new Error('LaLiga respondió sin token. Vuelve a intentarlo.');
    }

    this.#tokens = { ...normalizarTokens(respuesta), loginEn: Date.now() };
    this.#pendiente = null;
    this.#renovacionFallida = null;
    this.#guardarEnDisco();
    return this.estado;
  }

  /** Marca la sesión como caducada. La siguiente petición pedirá un token nuevo. */
  invalidar() {
    if (this.#tokens) this.#tokens.caducaEn = 0;
  }
}

export function crearSesion({ fichero }) {
  return new Sesion({ fichero });
}
