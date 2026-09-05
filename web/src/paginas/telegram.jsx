import { useState } from 'react';
import { api, fechaCorta } from '../api.js';
import {
  Aviso,
  Cabecera,
  Campo,
  Cargando,
  Casilla,
  Columnas,
  SubPestanas,
  Tabla,
  Tarjeta,
  useDatos,
  usarPestana,
} from '../componentes/comunes.jsx';

const PESTANAS = [
  { id: 'estado', titulo: 'El bot y el grupo' },
  { id: 'gente', titulo: 'Quién se ha identificado' },
  { id: 'probar', titulo: 'Probar los mensajes' },
  { id: 'registro', titulo: 'Mensajes enviados' },
];

/**
 * Todo lo de Telegram en un sitio: qué bot es, en qué grupo publica, quién
 * se ha identificado y qué mensajes ha mandado.
 */
export function TelegramAdmin() {
  const { datos, error, cargando, recargar } = useDatos(() => api.telegram());
  const { datos: enviados, recargar: recargarMensajes } = useDatos(() => api.mensajes());
  const [pestana, setPestana] = usarPestana('telegram', 'estado');
  const [mensaje, setMensaje] = useState(null);

  if (cargando) return <Cargando que="la información de Telegram" />;

  const usuario = datos?.bot?.username;

  return (
    <>
      <Cabecera titulo="Telegram">El bot, el grupo donde comenta y quién está identificado.</Cabecera>
      <Aviso>{error}</Aviso>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}

      <SubPestanas pestanas={PESTANAS} activa={pestana} alCambiar={setPestana} />

      {pestana === 'estado' ? (
        <ElBotYElGrupo
          datos={datos}
          usuario={usuario}
          alCambiar={(m) => {
            setMensaje(m);
            recargar();
            recargarMensajes();
          }}
        />
      ) : null}

      {pestana === 'gente' ? <LaGente datos={datos} usuario={usuario} /> : null}

      {pestana === 'probar' ? (
        <Simulador vinculaciones={datos?.vinculaciones || []} alTerminar={recargarMensajes} />
      ) : null}

      {pestana === 'registro' ? (
        <Tarjeta titulo="Mensajes enviados" explica="Todo lo que ha salido del bot, en orden. Incluye las simulaciones.">
          <Tabla
            filas={(enviados || []).slice(0, 60)}
            vacio="Todavía no ha enviado nada."
            columnas={[
              { titulo: 'Cuándo', valor: (f) => fechaCorta(f.enviado_en) },
              { titulo: 'A dónde', valor: (f) => f.destino },
              {
                titulo: 'Texto',
                valor: (f) => <span style={{ whiteSpace: 'normal' }}>{(f.texto || '').slice(0, 220)}</span>,
              },
            ]}
          />
        </Tarjeta>
      ) : null}
    </>
  );
}

function ElBotYElGrupo({ datos, usuario, alCambiar }) {
  const [manual, setManual] = useState('');
  const grupos = datos?.gruposVistos || [];

  async function elegir(chatId) {
    try {
      await api.elegirGrupo(chatId);
      alCambiar({ tipo: 'bien', texto: 'Grupo elegido. He mandado un mensaje de prueba, míralo en el grupo.' });
    } catch (e) {
      alCambiar({ tipo: 'error', texto: e.message });
    }
  }

  return (
    <>
      <Columnas>
        <Tarjeta titulo="El bot">
          {!usuario ? (
            <Aviso tipo="ojo">No hay token configurado, o Telegram lo rechaza. Ponlo en Configuración.</Aviso>
          ) : (
            <p style={{ marginTop: 0 }}>
              Es <b>@{usuario}</b>. Tus amigos lo buscan por ese nombre en Telegram y le escriben.
            </p>
          )}
          <p className="nota" style={{ marginBottom: 0 }}>
            Publicación: {datos?.silenciado ? 'silenciado del todo' : 'activa'} · privados{' '}
            {datos?.publicarPrivados ? 'sí' : 'no'} · grupo {datos?.publicarGrupo ? 'sí' : 'no'}. Se cambia en
            Configuración, pestaña Publicación.
          </p>
        </Tarjeta>

        <Tarjeta titulo="El grupo donde comenta">
          {datos?.grupoElegido ? (
            <p style={{ marginTop: 0 }}>
              Publica en <code>{datos.grupoElegido}</code>.
            </p>
          ) : (
            <Aviso tipo="ojo">Todavía no hay grupo elegido, así que no comenta en ninguna parte.</Aviso>
          )}
          <p className="nota" style={{ marginBottom: 0 }}>
            Para que aparezca un grupo, mete a <b>@{usuario || 'tubot'}</b> en él. El bot se entera solo. Si ya estaba
            dentro, escribe cualquier mensaje mencionándolo.
          </p>
        </Tarjeta>
      </Columnas>

      <Tarjeta titulo="Grupos donde está el bot">
        <Tabla
          filas={grupos}
          vacio="Todavía no he visto ningún grupo."
          columnas={[
            { titulo: 'Grupo', valor: (g) => g.titulo || 'sin nombre' },
            { titulo: 'Identificador', valor: (g) => <code>{g.chat_id}</code> },
            { titulo: 'Visto', valor: (g) => fechaCorta(g.visto_en) },
            {
              titulo: '',
              valor: (g) =>
                g.chat_id === datos.grupoElegido ? (
                  <span className="etiqueta bien">elegido</span>
                ) : (
                  <button type="button" className="accion suave" onClick={() => elegir(g.chat_id)}>
                    Usar este
                  </button>
                ),
            },
          ]}
        />

        <form
          style={{ marginTop: 18 }}
          onSubmit={(e) => {
            e.preventDefault();
            elegir(manual.trim());
          }}
        >
          <Campo etiqueta="O escribe el identificador a mano" pista="Solo si ya lo sabes.">
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="-1001234567890" />
          </Campo>
          <button className="accion" type="submit" disabled={!manual.trim()}>
            Usar este grupo
          </button>
        </form>
      </Tarjeta>
    </>
  );
}

function LaGente({ datos, usuario }) {
  return (
    <Columnas>
      <Tarjeta titulo="Identificados" explica="Reciben los avisos de sus futbolistas por privado.">
        <Tabla
          filas={datos?.vinculaciones}
          vacio="Nadie se ha identificado todavía."
          columnas={[
            { titulo: 'Persona', valor: (v) => v.nombre_telegram || v.telegram_id },
            { titulo: 'Manager', valor: (v) => v.manager_nombre || v.manager_id },
            { titulo: 'Identificador', valor: (v) => <code>{v.telegram_id}</code> },
            { titulo: 'Desde', valor: (v) => fechaCorta(v.creada_en) },
          ]}
        />
      </Tarjeta>

      <Tarjeta titulo="Cómo se apunta cada uno">
        <p className="nota" style={{ marginTop: 0 }}>
          Cuando entran en el grupo, el bot les saluda allí y les pone un botón que abre el chat privado. De un toque.
        </p>
        <p className="nota">
          En ese chat les explico qué hago y les salen los botones con los managers libres. Eligen el suyo y ya está.
        </p>
        <p className="nota" style={{ marginBottom: 0 }}>
          Si se equivocan, escriben <code>/soltar</code> y vuelven a elegir. Si lo prefieren, pueden empezar por su
          cuenta buscando <b>@{usuario || 'el bot'}</b> y escribiendo <code>/yosoy</code>.
        </p>
      </Tarjeta>
    </Columnas>
  );
}

/**
 * Reproduce los mensajes de una jornada ya jugada.
 *
 * Sirve para ver cómo queda todo sin esperar a que haya partido. Los datos
 * son reales: los goles y los puntos son los que ocurrieron de verdad.
 */
function Simulador({ vinculaciones, alTerminar }) {
  const { datos: managers } = useDatos(() => api.managers());
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
      const r = await api.simular({ jornada: Number(jornada), equipoId, destino, tambienAlGrupo: alGrupo });
      setResultado(r);
      alTerminar();
    } catch (e) {
      setResultado({ error: e.message });
    } finally {
      setEnMarcha(false);
    }
  }

  return (
    <Columnas>
      <Tarjeta
        titulo="Probar cómo quedan los mensajes"
        explica="Reproduce lo que habría enviado el bot en una jornada ya jugada. Los datos son reales, no inventados, y todo llega marcado como simulación."
      >
        {vinculaciones.length === 0 ? (
          <Aviso tipo="ojo">
            Todavía no hay nadie identificado. Escríbele al bot por privado, usa /yosoy y elige tu manager.
          </Aviso>
        ) : null}

        <form onSubmit={lanzar}>
          <Campo etiqueta="Jornada ya jugada">
            <input value={jornada} onChange={(e) => setJornada(e.target.value)} inputMode="numeric" />
          </Campo>
          <Campo etiqueta="Manager cuyos avisos se reproducen">
            <select value={equipoId} onChange={(e) => setEquipoId(e.target.value)}>
              <option value="">Elige…</option>
              {(managers || []).map((m) => (
                <option key={m.equipo_id} value={m.equipo_id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="A quién se le manda todo">
            <select value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Elige…</option>
              {vinculaciones.map((v) => (
                <option key={v.telegram_id} value={v.telegram_id}>
                  {v.nombre_telegram || v.manager_nombre || v.telegram_id}
                </option>
              ))}
            </select>
          </Campo>
          <Casilla
            etiqueta="Publicar también el comentario en el grupo, para que lo vean todos"
            valor={alGrupo}
            alCambiar={setAlGrupo}
          />
          <button className="accion" type="submit" disabled={enMarcha || !equipoId || !destino}>
            {enMarcha ? 'Enviando…' : 'Simular la jornada'}
          </button>
        </form>
      </Tarjeta>

      <Tarjeta titulo="Qué se ha enviado">
        {!resultado ? (
          <p className="nota" style={{ margin: 0 }}>
            Aquí sale el detalle de cada mensaje: los avisos de gol y asistencia, el resumen de un partido y el
            comentario del grupo.
          </p>
        ) : null}
        {resultado?.error ? <Aviso>{resultado.error}</Aviso> : null}
        {resultado?.enviados ? (
          <>
            <p className="nota" style={{ marginTop: 0 }}>
              {resultado.enviados.length} mensajes, con {resultado.hechos} hechos encontrados en esa jornada.
            </p>
            <Tabla
              filas={resultado.enviados}
              columnas={[
                { titulo: 'Qué', valor: (f) => f.etiqueta },
                {
                  titulo: 'Llegó',
                  valor: (f) =>
                    f.ok ? <span className="etiqueta bien">sí</span> : <span className="etiqueta mal">{f.motivo}</span>,
                },
              ]}
            />
          </>
        ) : null}
      </Tarjeta>
    </Columnas>
  );
}
