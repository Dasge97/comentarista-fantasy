import fs from 'node:fs';
import crypto from 'node:crypto';

// Inicio de sesión de LaLiga Fantasy (Azure AD B2C).
//
// LaLiga retiró el 15 de octubre de 2026 el inicio de sesión directo con
// correo y contraseña contra el endpoint de tokens (la política
// B2C_1A_ResourceOwnerv2 responde 404). Desde entonces solo funciona la
// página de login de LaLiga, con código de autorización y PKCE.
//
// El bot rellena esa misma página como lo haría un navegador:
//   1. GET  /authorize                      → página con el formulario, cookies,
//                                             token CSRF y transacción (SETTINGS).
//   2. POST /SelfAsserted                   → correo (signInName) y contraseña
//                                             (password_login). Responde {"status":"200"}.
//   3. GET  /api/CombinedSigninAndSignup/confirmed
//                                           → 302 a authredirect://com.lfp.laligafantasy?code=...
//   4. POST /token                          → cambia el código por tokens.
// Después, renovar() mantiene la sesión con el refresh token. Si la
// renovación falla, se vuelve a entrar con la contraseña.
//
// Comprobado el 10 de noviembre de 2026. Los nombres de los campos salen de
// SA_FIELDS en el HTML de la página: si LaLiga los cambia, se leen de ahí.
const ORIGEN = 'https://login.laliga.es';
const BASE = `${ORIGEN}/laligadspprob2c.onmicrosoft.com/oauth2/v2.0`;
const CLIENTE = 'af88bcff-1157-40a0-b579-030728aacf0b';
const POLITICA = 'B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN';
const REDIRECT_URI = 'authredirect://com.lfp.laligafantasy';
const NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

// Se considera caducado cinco minutos antes de la hora real, para no
// empezar una petición con un token que caduca a mitad de camino.
const MARGEN_CADUCIDAD_MS = 5 * 60 * 1000;

/** No hay sesión utilizable y el bot no puede arreglarlo solo. */
export class ErrorSinSesion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorSinSesion';
    this.sinSesion = true;
  }
}

const huella = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

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
    const error = new Error(`Autenticación rechazada (HTTP ${respuesta.status}): ${motivo.split(/\r?\n/)[0]}`);
    error.estado = respuesta.status;
    throw error;
  }

  return datos;
}

function normalizarTokens(respuesta) {
  // Con el alcance "openid offline_access", B2C devuelve id_token y no
  // access_token. La API acepta el id_token como Bearer.
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

/** Cookies de una conversación con la página de login, como haría un navegador. */
class Cookies {
  #valores = new Map();
  guardar(respuesta) {
    for (const cookie of respuesta.headers.getSetCookie()) {
      const [par] = cookie.split(';');
      const i = par.indexOf('=');
      if (i > 0) this.#valores.set(par.slice(0, i).trim(), par.slice(i + 1));
    }
  }
  get cabecera() {
    return [...this.#valores].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

/** Entra en la página de login de LaLiga con correo y contraseña. Devuelve la respuesta de /token. */
async function entrarConContrasena(email, password) {
  const cookies = new Cookies();
  const verificador = crypto.randomBytes(32).toString('base64url');
  const reto = crypto.createHash('sha256').update(verificador).digest('base64url');
  const estado = crypto.randomBytes(12).toString('base64url');
  const urlLogin = `${BASE}/authorize?${new URLSearchParams({
    p: POLITICA,
    client_id: CLIENTE,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'openid offline_access',
    code_challenge: reto,
    code_challenge_method: 'S256',
    state: estado,
    nonce: estado,
  })}`;

  // 1. La página del formulario.
  let r = await fetch(urlLogin, { redirect: 'manual', headers: { 'User-Agent': NAVEGADOR } });
  cookies.guardar(r);
  const html = await r.text();
  const ajustes = html.match(/var SETTINGS = (\{.*?\});/s);
  if (!r.ok || !ajustes) throw new Error(`La página de login de LaLiga no se ha cargado (HTTP ${r.status}).`);
  const S = JSON.parse(ajustes[1]);
  const campos = JSON.parse(html.match(/var SA_FIELDS = (\{.*?\});/s)?.[1] || '{"AttributeFields":[]}').AttributeFields;
  const campoCorreo = campos.find((c) => !c.IS_PASSWORD && /sign|mail/i.test(c.ID))?.ID || 'signInName';
  const campoContrasena = campos.find((c) => c.IS_PASSWORD)?.ID || 'password_login';

  // 2. El formulario.
  r = await fetch(`${ORIGEN}${S.hosts.tenant}/SelfAsserted?tx=${S.transId}&p=${S.hosts.policy}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-CSRF-TOKEN': S.csrf,
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookies.cabecera,
      Origin: ORIGEN,
      Referer: urlLogin,
      'User-Agent': NAVEGADOR,
    },
    body: new URLSearchParams({ request_type: 'RESPONSE', [campoCorreo]: email, [campoContrasena]: password }).toString(),
  });
  cookies.guardar(r);
  let resultado = null;
  try {
    resultado = JSON.parse(await r.text());
  } catch {
    resultado = null;
  }
  if (String(resultado?.status) !== '200') {
    const codigo = resultado?.errorCode || '';
    // AADB2C90054: contraseña incorrecta. AADB2C90053: no existe ese correo.
    const malas = codigo === 'AADB2C90054' || codigo === 'AADB2C90053';
    const error = new Error(
      malas
        ? `LaLiga rechaza el correo o la contraseña de la cuenta del bot (${codigo}).`
        : `La página de login de LaLiga no ha aceptado el formulario: ${codigo} ${resultado?.message || `HTTP ${r.status}`}`.trim(),
    );
    error.credencialesMalas = malas;
    throw error;
  }

  // 3. La confirmación, que redirige a la app con el código.
  r = await fetch(
    `${ORIGEN}${S.hosts.tenant}/api/${S.api}/confirmed?${new URLSearchParams({
      rememberMe: 'false',
      csrf_token: S.csrf,
      tx: S.transId,
      p: S.hosts.policy,
    })}`,
    { redirect: 'manual', headers: { Cookie: cookies.cabecera, Referer: urlLogin, 'User-Agent': NAVEGADOR } },
  );
  const destino = r.headers.get('location') || '';
  const parametros = new URLSearchParams(destino.split('?')[1] || '');
  if (!parametros.get('code')) {
    const motivo = parametros.get('error_description') || `HTTP ${r.status}, sin código`;
    throw new Error(`LaLiga no ha devuelto el código de login: ${decodeURIComponent(motivo).split(/\r?\n/)[0]}`);
  }
  if (parametros.get('state') !== estado) throw new Error('LaLiga ha devuelto un código de otro intento de login.');

  // 4. El código por tokens.
  const tokens = await pedirTokens({
    grant_type: 'authorization_code',
    client_id: CLIENTE,
    code: parametros.get('code'),
    redirect_uri: REDIRECT_URI,
    code_verifier: verificador,
    scope: 'openid offline_access',
  });
  if (!tokens.access_token && !tokens.id_token) throw new Error('LaLiga ha respondido sin token.');
  return tokens;
}

export class Sesion {
  #fichero;
  #credenciales;
  #tokens = null;
  #enCurso = null;
  // Huella de las credenciales que LaLiga rechazó. Con esas no se reintenta:
  // cada intento fallido acerca la cuenta a un bloqueo. Al cambiarlas en el
  // panel, la huella deja de coincidir y se vuelve a probar.
  #rechazadas = null;
  #ultimoFallo = null;

  /** credenciales: función que devuelve { email, password } con los valores actuales del panel. */
  constructor({ fichero, credenciales }) {
    this.#fichero = fichero || null;
    this.#credenciales = credenciales || (() => ({}));
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
    const base = { ultimoFallo: this.#ultimoFallo };
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
   * Devuelve un Bearer válido: el guardado, uno renovado o uno de un login
   * nuevo. Varias llamadas simultáneas comparten la misma operación en curso.
   * Si no hay forma de conseguirlo, lanza ErrorSinSesion.
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
      } catch (error) {
        // Un 400 o 401 significa que el refresh token ya no vale: se entra
        // de nuevo con la contraseña. Un fallo de red o un 5xx puede
        // arreglarse solo, así que se deja pasar sin gastar un login.
        if (error.estado !== 400 && error.estado !== 401) throw error;
      }
    }
    await this.iniciarSesion();
  }

  /** Renueva el token con el refresh token, sin pasar por la página de login. */
  async renovar() {
    const anterior = this.#tokens;
    if (!anterior?.refreshToken) throw new Error('No hay refresh token guardado.');
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
  }

  /** Entra en la página de login de LaLiga con el correo y la contraseña del panel. */
  async iniciarSesion() {
    const { email, password } = this.#credenciales();
    if (!email || !password) {
      throw new ErrorSinSesion('Faltan el correo o la contraseña de la cuenta del bot. Ponlos en Configuración, pestaña Fantasy.');
    }
    const actual = huella(`${email}\n${password}`);
    if (this.#rechazadas === actual) {
      throw new ErrorSinSesion(
        'LaLiga rechazó la última vez este correo y esta contraseña. Cámbialos en Configuración, pestaña Fantasy; el bot no reintenta con los mismos para no bloquear la cuenta.',
      );
    }

    try {
      const respuesta = await entrarConContrasena(email, password);
      this.#tokens = { ...normalizarTokens(respuesta), loginEn: Date.now() };
      this.#rechazadas = null;
      this.#ultimoFallo = null;
      this.#guardarEnDisco();
      return this.estado;
    } catch (error) {
      this.#ultimoFallo = { mensaje: error.message, cuando: new Date().toISOString() };
      if (error.credencialesMalas) {
        this.#rechazadas = actual;
        throw new ErrorSinSesion(`${error.message} Cámbialos en Configuración, pestaña Fantasy.`);
      }
      throw error;
    }
  }

  /** Marca la sesión como caducada. La siguiente petición pedirá un token nuevo. */
  invalidar() {
    if (this.#tokens) this.#tokens.caducaEn = 0;
  }
}

export function crearSesion({ fichero, credenciales }) {
  return new Sesion({ fichero, credenciales });
}
