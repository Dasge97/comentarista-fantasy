import { useState } from 'react';
import { api, fechaCorta } from '../api.js';
import { Aviso, Cargando, Tabla, Tarjeta, useDatos } from '../componentes/comunes.jsx';
import { api as apiLiga } from '../api.js';

/**
 * Todo lo de Telegram en un sitio: qué bot es, en qué grupo publica, quién
 * se ha vinculado y qué mensajes ha mandado.
 */
export function TelegramAdmin() {
  const { datos, error, cargando, recargar } = useDatos(() => api.telegram());
  const { datos: enviados, recargar: recargarMensajes } = useDatos(() => api.mensajes());
  const [manual, setManual] = useState('');
  const [mensaje, setMensaje] = useState(null);

  async function elegir(chatId) {
    setMensaje('Probando…');
    try {
      await api.elegirGrupo(chatId);
      setMensaje('Grupo elegido. He mandado un mensaje de prueba, míralo en el grupo.');
      recargar();
      recargarMensajes();
    } catch (e) {
      setMensaje(e.message);
    }
  }

  if (cargando) return <Cargando que="la información de Telegram" />;

  const usuario = datos?.bot?.username;
  const grupos = datos?.gruposVistos || [];

  return (
    <>
      <h1>Telegram</h1>
      <p className="bajada">El bot, el grupo donde comenta y quién está vinculado.</p>
      <Aviso>{error}</Aviso>
      {mensaje ? <Aviso tipo="bien">{mensaje}</Aviso> : null}

      <Tarjeta titulo="El bot">
        {!usuario ? (
          <Aviso tipo="ojo">
            No hay token configurado, o Telegram lo rechaza. Ponlo en Configuración.
          </Aviso>
        ) : (
          <p style={{ marginTop: 0 }}>
            Es <b>@{usuario}</b>. Tus amigos lo buscan por ese nombre en Telegram y le escriben.
          </p>
        )}

        <p className="suave" style={{ fontSize: 13, marginBottom: 0 }}>
          Estado de publicación: {datos?.silenciado ? 'silenciado del todo' : 'activo'}
          {' · '}privados {datos?.publicarPrivados ? 'sí' : 'no'}
          {' · '}grupo {datos?.publicarGrupo ? 'sí' : 'no'}. Se cambia en Configuración.
        </p>
      </Tarjeta>

      <Tarjeta titulo="El grupo donde comenta">
        {datos?.grupoElegido ? (
          <p style={{ marginTop: 0 }}>
            Ahora publica en el grupo <code>{datos.grupoElegido}</code>.
          </p>
        ) : (
          <Aviso tipo="ojo">Todavía no hay grupo elegido, así que no comenta en ninguna parte.</Aviso>
        )}

        <p className="suave" style={{ fontSize: 13 }}>
          Para que aparezca un grupo aquí, mete a <b>@{usuario || 'tubot'}</b> en él. El bot se entera solo y lo apunta.
          Si ya estaba dentro antes, escribe cualquier mensaje en el grupo mencionándolo y también lo detecta.
        </p>

        {grupos.length > 0 ? (
          <Tabla
            filas={grupos}
            columnas={[
              { titulo: 'Grupo', valor: (g) => g.titulo || 'sin nombre' },
              { titulo: 'Identificador', valor: (g) => <code>{g.chat_id}</code> },
              { titulo: 'Visto', valor: (g) => fechaCorta(g.visto_en) },
              {
                titulo: '',
                valor: (g) =>
                  g.chat_id === datos.grupoElegido ? (
                    <span className="etiqueta">elegido</span>
                  ) : (
                    <button className="accion suave" onClick={() => elegir(g.chat_id)}>
                      Usar este
                    </button>
                  ),
              },
            ]}
          />
        ) : (
          <p className="suave">Todavía no he visto ningún grupo.</p>
        )}

        <form
          style={{ marginTop: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            elegir(manual.trim());
          }}
        >
          <label>
            <span>O escribe el identificador a mano, si ya lo sabes</span>
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="-1001234567890" />
          </label>
          <button className="accion" type="submit" disabled={!manual.trim()}>
            Usar este grupo
          </button>
        </form>
      </Tarjeta>

      <Tarjeta titulo="Quién se ha vinculado">
        <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
          Cada amigo escribe al bot, usa <code>/yosoy</code> y elige su manager de una lista de botones. A partir de
          ahí recibe sus avisos. Puede cambiarlo con <code>/soltar</code>.
        </p>
        <Tabla
          filas={datos?.vinculaciones}
          vacio="Nadie se ha vinculado todavía."
          columnas={[
            { titulo: 'Persona', valor: (v) => v.nombre_telegram || v.telegram_id },
            { titulo: 'Manager', valor: (v) => v.manager_nombre || v.manager_id },
            { titulo: 'Identificador', valor: (v) => <code>{v.telegram_id}</code> },
            { titulo: 'Desde', valor: (v) => fechaCorta(v.creada_en) },
          ]}
        />
      </Tarjeta>

      <Simulador vinculaciones={datos?.vinculaciones || []} alTerminar={recargarMensajes} />

      <Tarjeta titulo="Mensajes enviados">
        <Tabla
          filas={(enviados || []).slice(0, 40)}
          vacio="Todavía no ha enviado nada."
          columnas={[
            { titulo: 'Cuándo', valor: (f) => fechaCorta(f.enviado_en) },
            { titulo: 'A dónde', valor: (f) => f.destino },
            {
              titulo: 'Texto',
              valor: (f) => <span style={{ whiteSpace: 'normal' }}>{(f.texto || '').slice(0, 200)}</span>,
            },
          ]}
        />
      </Tarjeta>
    </>
  );
}

/**
 * Reproduce los mensajes de una jornada ya jugada.
 *
 * Sirve para ver cómo queda todo sin esperar a que haya partido. Los datos
 * son reales: los goles y los puntos son los que ocurrieron de verdad.
 */
function Simulador({ vinculaciones, alTerminar }) {
  const { datos: managers } = useDatos(() => apiLiga.managers());
  const [jornada, setJornada] = useState('3');
  const [equipoId, setEquipoId] = useState('');
  const [destino, setDestino] = useState('');
  const [alGrupo, setAlGrupo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [enMarcha, setEnMarcha] = useState(false);

  async function lanzar(evento) {
    evento.preventDefault();
    setEnMarcha(true);
    setResultado(null);
    try {
      const r = await apiLiga.simular({ jornada: Number(jornada), equipoId, destino, tambienAlGrupo: alGrupo });
      setResultado(r);
      alTerminar();
    } catch (e) {
      setResultado({ error: e.message });
    } finally {
      setEnMarcha(false);
    }
  }

  return (
    <Tarjeta titulo="Probar cómo quedan los mensajes">
      <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
        Reproduce lo que habría enviado el bot en una jornada ya jugada: los avisos de gol y asistencia, el resumen
        de un partido y el comentario del grupo. Los datos son reales, no inventados. Todo llega marcado como
        simulación para que nadie se confunda.
      </p>

      {vinculaciones.length === 0 ? (
        <Aviso tipo="ojo">
          Todavía no hay nadie vinculado. Escríbele al bot por privado, usa /yosoy y elige tu manager. Después vuelve
          aquí.
        </Aviso>
      ) : null}

      <form onSubmit={lanzar}>
        <label>
          <span>Jornada ya jugada</span>
          <input value={jornada} onChange={(e) => setJornada(e.target.value)} inputMode="numeric" />
        </label>
        <label>
          <span>Manager cuyos avisos se reproducen</span>
          <select value={equipoId} onChange={(e) => setEquipoId(e.target.value)}>
            <option value="">Elige…</option>
            {(managers || []).map((m) => (
              <option key={m.equipo_id} value={m.equipo_id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>A quién se le manda todo</span>
          <select value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Elige…</option>
            {vinculaciones.map((v) => (
              <option key={v.telegram_id} value={v.telegram_id}>
                {v.nombre_telegram || v.manager_nombre || v.telegram_id}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={alGrupo}
            onChange={(e) => setAlGrupo(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span style={{ margin: 0 }}>Publicar también el comentario en el grupo, para que lo vean todos</span>
        </label>
        <button className="accion" type="submit" disabled={enMarcha || !equipoId || !destino}>
          {enMarcha ? 'Enviando…' : 'Simular la jornada'}
        </button>
      </form>

      {resultado?.error ? <Aviso>{resultado.error}</Aviso> : null}
      {resultado?.enviados ? (
        <>
          <p className="suave">
            {resultado.enviados.length} mensajes enviados, con {resultado.hechos} hechos encontrados en esa jornada.
          </p>
          <Tabla
            filas={resultado.enviados}
            columnas={[
              { titulo: 'Qué', valor: (f) => f.etiqueta },
              { titulo: 'A dónde', valor: (f) => f.chat },
              { titulo: 'Llegó', valor: (f) => (f.ok ? 'sí' : `no: ${f.motivo}`) },
            ]}
          />
        </>
      ) : null}
    </Tarjeta>
  );
}
