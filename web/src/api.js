/**
 * Llamadas a la API. La sesión viaja en una cookie, así que no hay que
 * guardar ningún token en el navegador.
 */
async function peticion(ruta, opciones = {}) {
  const respuesta = await fetch(`/api${ruta}`, {
    credentials: 'same-origin',
    headers: opciones.cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    method: opciones.metodo || 'GET',
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  if (!respuesta.ok) {
    const error = new Error(datos?.error || `La petición falló con código ${respuesta.status}`);
    error.estado = respuesta.status;
    throw error;
  }
  return datos;
}

export const api = {
  yo: () => peticion('/yo'),
  entrar: (contrasena) => peticion('/entrar', { metodo: 'POST', cuerpo: { contrasena } }),
  entrarConCodigo: (codigo) => peticion('/entrar/codigo', { metodo: 'POST', cuerpo: { codigo } }),
  salir: () => peticion('/salir', { metodo: 'POST' }),

  estado: () => peticion('/estado'),
  configuracion: () => peticion('/configuracion'),
  guardarConfiguracion: (cambios) => peticion('/configuracion', { metodo: 'PUT', cuerpo: cambios }),
  cambiarContrasena: (contrasena) => peticion('/contrasena', { metodo: 'PUT', cuerpo: { contrasena } }),

  usuarios: () => peticion('/usuarios'),
  crearUsuario: (datos) => peticion('/usuarios', { metodo: 'POST', cuerpo: datos }),
  borrarUsuario: (id) => peticion(`/usuarios/${id}`, { metodo: 'DELETE' }),

  forzarLectura: () => peticion('/acciones/lectura', { metodo: 'POST' }),
  probarRedactor: () => peticion('/acciones/probar-redactor', { metodo: 'POST' }),
  modelosDisponibles: () => peticion('/acciones/modelos'),

  telegram: () => peticion('/telegram'),
  elegirGrupo: (chatId) => peticion('/telegram/grupo', { metodo: 'POST', cuerpo: { chatId } }),
  simular: (datos) => peticion('/acciones/simular', { metodo: 'POST', cuerpo: datos }),
  notificar: (destino, texto) => peticion('/acciones/notificar', { metodo: 'POST', cuerpo: { destino, texto } }),
  calibrarDinero: (managerId, dineroReal) =>
    peticion('/acciones/calibrar-dinero', { metodo: 'POST', cuerpo: { managerId, dineroReal } }),

  incidencias: () => peticion('/incidencias'),
  mensajes: () => peticion('/mensajes'),
  tablas: () => peticion('/tablas'),
  tabla: (nombre, salto = 0) => peticion(`/tablas/${nombre}?salto=${salto}&limite=100`),

  clasificacion: () => peticion('/liga/clasificacion'),
  managers: () => peticion('/liga/managers'),
  manager: (equipoId) => peticion(`/liga/manager/${equipoId}`),
  dinero: () => peticion('/liga/dinero'),
  mercado: () => peticion('/liga/mercado'),
  movimientos: () => peticion('/liga/movimientos'),
  valorDe: (futbolistaId) => peticion(`/liga/futbolista/${futbolistaId}/valor`),
  buscarFutbolistas: (texto) => peticion(`/liga/futbolistas?nombre=${encodeURIComponent(texto)}&limite=25`),
  futbolistas: (filtros) => peticion(`/liga/futbolistas?${new URLSearchParams(
    Object.entries(filtros).filter(([, v]) => v !== '' && v != null),
  )}`),
  futbolista: (id) => peticion(`/liga/futbolista/${id}`),
  equipos: () => peticion('/liga/equipos'),
};

/** Formatea una cifra de dinero en millones, que es como se habla en Fantasy. */
export function millones(valor) {
  if (valor == null) return '—';
  return `${(valor / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M`;
}

export function fechaCorta(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
