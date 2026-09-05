import { useState } from 'react';
import { api, fechaCorta } from '../api.js';
import { Aviso, Cargando, Dato, Tabla, Tarjeta, useDatos } from '../componentes/comunes.jsx';

export function Estado() {
  const { datos, error, cargando, recargar } = useDatos(() => api.estado());
  const [mensaje, setMensaje] = useState(null);
  const { datos: incidencias } = useDatos(() => api.incidencias());

  async function forzar() {
    setMensaje('Leyendo…');
    try {
      const r = await api.forzarLectura();
      setMensaje(`Leída la jornada ${r.jornada}. Lectura ${r.completa ? 'completa' : 'incompleta'}.`);
      recargar();
    } catch (e) {
      setMensaje(e.message);
    }
  }

  async function verModelos() {
    setMensaje('Preguntando al proveedor…');
    try {
      const r = await api.modelosDisponibles();
      setMensaje(r.ok ? `Modelos disponibles: ${r.modelos.join(', ')}` : `No se pudo consultar: ${r.motivo}`);
    } catch (e) {
      setMensaje(e.message);
    }
  }

  async function probarModelo() {
    setMensaje('Probando el modelo…');
    try {
      const r = await api.probarRedactor();
      setMensaje(
        r.ok
          ? `El modelo responde. Proveedor ${r.proveedor}, modelo ${r.modelo}, contra ${r.base}. Ha contestado: «${r.texto}».`
          : `El modelo no responde: ${r.motivo}`,
      );
    } catch (e) {
      setMensaje(e.message);
    }
  }

  if (cargando) return <Cargando que="el estado" />;

  return (
    <>
      <h1>Estado</h1>
      <p className="bajada">Cómo va el bot ahora mismo.</p>

      <Tarjeta titulo="Qué es cada cosa">
        <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
          El bot no lee todo el rato. Mira el calendario y decide: si hay un partido en juego lee cada minuto, y si no
          hay ninguno duerme hasta que se acerque el siguiente. <b>Ritmo de lectura</b> dice en cuál de esas
          situaciones está.
        </p>
        <p className="suave" style={{ fontSize: 13, marginBottom: 0 }}>
          <b>Leer ahora</b> se salta esa espera y hace una lectura completa en el momento: clasificación, once de cada
          manager y puntos de cada futbolista. Sirve para comprobar que todo funciona sin esperar a que haya partido.
          No envía mensajes viejos: solo avisa de lo que haya cambiado desde la última lectura.
        </p>
      </Tarjeta>
      <Aviso>{error}</Aviso>

      {!datos?.configurado ? (
        <Aviso tipo="ojo">
          Falta configuración. Ve a Configuración y rellena las credenciales de Fantasy y el identificador de la liga.
        </Aviso>
      ) : null}

      <div className="rejilla">
        <Dato titulo="Ritmo de lectura" valor={datos.servicio.ritmo} detalle="Depende de si hay partidos en juego." />
        <Dato
          titulo="Última lectura"
          valor={fechaCorta(datos.servicio.ultimaLectura)}
          detalle={datos.servicio.proximoCiclo ? `La siguiente, sobre las ${fechaCorta(datos.servicio.proximoCiclo)}.` : null}
        />
        <Dato
          titulo="Sesión de Fantasy"
          valor={datos.sesionFantasy.activa ? 'Viva' : 'Caducada'}
          detalle={datos.sesionFantasy.activa ? `Le quedan ${datos.sesionFantasy.minutosRestantes} minutos.` : null}
        />
        <Dato
          titulo="Telegram"
          valor={datos.telegram.configurado ? 'Configurado' : 'Sin token'}
          detalle={datos.telegram.grupo ? 'Con grupo asignado.' : 'Falta el grupo.'}
        />
        <Dato
          titulo="Managers"
          valor={datos.managers}
          detalle={`${datos.vinculados} han dicho quiénes son por el chat del bot.`}
        />
        <Dato
          titulo="¿Se leyeron todos?"
          valor={datos.servicio.lecturaCompleta === null ? 'Sin leer aún' : datos.servicio.lecturaCompleta ? 'Sí' : 'No'}
          detalle="Si falla la lectura de algún manager, el bot calla: una clasificación a medias no se puede contar."
        />
      </div>

      <Tarjeta titulo="Acciones">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="accion" onClick={forzar}>
            Leer ahora, sin esperar
          </button>
          <button className="accion suave" onClick={probarModelo}>
            Probar el modelo que escribe
          </button>
          <button className="accion suave" onClick={verModelos}>
            Ver modelos disponibles
          </button>
        </div>
        {mensaje ? <p className="suave">{mensaje}</p> : null}
      </Tarjeta>

      {datos.servicio.ultimoError ? (
        <Aviso>
          Último error: {datos.servicio.ultimoError.mensaje} ({fechaCorta(datos.servicio.ultimoError.cuando)})
        </Aviso>
      ) : null}

      <Tarjeta titulo="Registro">
        <Tabla
          filas={(incidencias || []).slice(0, 40)}
          columnas={[
            { titulo: 'Cuándo', valor: (f) => fechaCorta(f.ocurrida_en) },
            { titulo: 'Nivel', valor: (f) => <span className="etiqueta">{f.nivel}</span> },
            { titulo: 'Origen', valor: (f) => f.origen },
            { titulo: 'Mensaje', valor: (f) => <span style={{ whiteSpace: 'normal' }}>{f.mensaje}</span> },
          ]}
        />
      </Tarjeta>
    </>
  );
}

export function Ajustes() {
  const { datos, error, cargando, recargar } = useDatos(() => api.configuracion());
  const [cambios, setCambios] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const [nuevaContrasena, setNuevaContrasena] = useState('');

  async function guardar(evento) {
    evento.preventDefault();
    try {
      await api.guardarConfiguracion(cambios);
      setCambios({});
      setMensaje('Guardado.');
      recargar();
    } catch (e) {
      setMensaje(e.message);
    }
  }

  async function cambiarContrasena(evento) {
    evento.preventDefault();
    try {
      await api.cambiarContrasena(nuevaContrasena);
      setNuevaContrasena('');
      setMensaje('Contraseña cambiada.');
    } catch (e) {
      setMensaje(e.message);
    }
  }

  if (cargando) return <Cargando que="la configuración" />;

  const secretos = (datos || []).filter((a) => a.secreto);
  const plantillas = (datos || []).filter((a) => a.clave.startsWith('plantilla_'));
  const normales = (datos || []).filter((a) => !a.secreto && !a.clave.startsWith('plantilla_'));

  return (
    <>
      <h1>Configuración</h1>
      <p className="bajada">Todo lo que el bot necesita para funcionar.</p>
      <Aviso>{error}</Aviso>
      {mensaje ? <Aviso tipo="bien">{mensaje}</Aviso> : null}

      <form onSubmit={guardar}>
        <Tarjeta titulo="Claves">
          <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
            Se guardan cifradas. Aquí se pueden cambiar, no leer: si un campo está puesto, se deja en blanco para
            conservarlo.
          </p>
          {secretos.map((a) => (
            <label key={a.clave}>
              <span>
                {a.titulo} {a.puesto ? <em className="suave">(ya está puesto)</em> : <em className="suave">(vacío)</em>}
              </span>
              <input
                type="password"
                value={cambios[a.clave] ?? ''}
                placeholder={a.puesto ? '••••••••' : ''}
                onChange={(e) => setCambios({ ...cambios, [a.clave]: e.target.value })}
              />
            </label>
          ))}
        </Tarjeta>

        <Tarjeta titulo="Ajustes">
          <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
            El <b>proveedor del modelo</b> decide quién escribe los comentarios del grupo. Las claves de Anthropic y
            de OpenAI se guardan por separado, así que puedes cambiar de uno a otro sin volver a escribirlas. Deja la
            dirección base vacía para usar la API oficial del proveedor.
          </p>
          {normales.map((a) => (
            <label key={a.clave}>
              <span>{a.titulo}</span>
              {a.clave === 'proveedor_modelo' ? (
                <select
                  value={cambios[a.clave] ?? a.valor ?? 'anthropic'}
                  onChange={(e) => setCambios({ ...cambios, [a.clave]: e.target.value })}
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                </select>
              ) : a.clave === 'tono' ? (
                <textarea
                  value={cambios[a.clave] ?? a.valor ?? ''}
                  onChange={(e) => setCambios({ ...cambios, [a.clave]: e.target.value })}
                />
              ) : (
                <input
                  value={cambios[a.clave] ?? a.valor ?? ''}
                  onChange={(e) => setCambios({ ...cambios, [a.clave]: e.target.value })}
                />
              )}
            </label>
          ))}
        </Tarjeta>

        <Tarjeta titulo="Textos de los avisos privados">
          <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
            Son los mensajes que recibe cada manager cuando uno de sus futbolistas hace algo. Los huecos se
            sustituyen: <code>{'{jugador}'}</code> por el nombre del futbolista, <code>{'{puntos}'}</code> por los que
            lleva en la jornada y <code>{'{que}'}</code> por lo que le han quitado en una corrección. Se pueden usar
            las etiquetas <code>&lt;b&gt;</code> y <code>&lt;i&gt;</code>.
          </p>
          {plantillas.map((a) => (
            <label key={a.clave}>
              <span>{a.titulo}</span>
              <input
                value={cambios[a.clave] ?? a.valor ?? ''}
                onChange={(e) => setCambios({ ...cambios, [a.clave]: e.target.value })}
              />
            </label>
          ))}
        </Tarjeta>

        <button className="accion" type="submit" disabled={Object.keys(cambios).length === 0}>
          Guardar
        </button>
      </form>

      <Tarjeta titulo="Contraseña de administrador">
        <form onSubmit={cambiarContrasena}>
          <label>
            <span>Nueva contraseña, al menos diez caracteres</span>
            <input
              type="password"
              value={nuevaContrasena}
              onChange={(e) => setNuevaContrasena(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button className="accion" type="submit" disabled={nuevaContrasena.length < 10}>
            Cambiar
          </button>
        </form>
      </Tarjeta>
    </>
  );
}

export function UsuariosAdmin() {
  const { datos, error, cargando, recargar } = useDatos(() => api.usuarios());
  const [nuevo, setNuevo] = useState({ nombre: '', telegramId: '', managerId: '' });
  const [mensaje, setMensaje] = useState(null);

  async function crear(evento) {
    evento.preventDefault();
    try {
      await api.crearUsuario(nuevo);
      setNuevo({ nombre: '', telegramId: '', managerId: '' });
      setMensaje('Dado de alta. Ya puede pedir su enlace al bot con /web.');
      recargar();
    } catch (e) {
      setMensaje(e.message);
    }
  }

  if (cargando) return <Cargando que="los usuarios" />;

  return (
    <>
      <h1>Usuarios</h1>
      <p className="bajada">Nadie se registra solo. Aquí decides quién entra en la web.</p>
      <Aviso>{error}</Aviso>
      {mensaje ? <Aviso tipo="bien">{mensaje}</Aviso> : null}

      <Tarjeta titulo="Con acceso a la web">
        <Tabla
          filas={datos?.usuarios}
          columnas={[
            { titulo: 'Nombre', valor: (f) => f.nombre },
            { titulo: 'Papel', valor: (f) => <span className="etiqueta">{f.rol}</span> },
            { titulo: 'Manager', valor: (f) => f.manager_nombre || '—' },
            { titulo: 'Telegram', valor: (f) => f.telegram_id || '—' },
            { titulo: 'Activo', valor: (f) => (f.activo ? 'Sí' : 'No') },
            {
              titulo: '',
              valor: (f) =>
                f.rol === 'administrador' ? null : (
                  <button
                    className="accion peligro"
                    onClick={async () => {
                      await api.borrarUsuario(f.id);
                      recargar();
                    }}
                  >
                    Quitar
                  </button>
                ),
            },
          ]}
        />
      </Tarjeta>

      <Tarjeta titulo="Vinculaciones de Telegram">
        <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
          Quién ha dicho ser quién en el chat privado del bot. Reciben avisos aunque no tengan acceso a la web.
        </p>
        <Tabla
          filas={datos?.vinculaciones}
          vacio="Nadie se ha vinculado todavía."
          columnas={[
            { titulo: 'Telegram', valor: (f) => f.nombre_telegram || f.telegram_id },
            { titulo: 'Identificador', valor: (f) => f.telegram_id },
            { titulo: 'Manager', valor: (f) => f.manager_nombre || f.manager_id },
            { titulo: 'Desde', valor: (f) => fechaCorta(f.creada_en) },
          ]}
        />
      </Tarjeta>

      <Tarjeta titulo="Dar acceso a alguien">
        <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
          El identificador de Telegram sale de la tabla de vinculaciones de arriba: primero que hable con el bot, luego
          le das acceso.
        </p>
        <form onSubmit={crear}>
          <label>
            <span>Nombre</span>
            <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          </label>
          <label>
            <span>Identificador de Telegram</span>
            <input value={nuevo.telegramId} onChange={(e) => setNuevo({ ...nuevo, telegramId: e.target.value })} />
          </label>
          <label>
            <span>Manager, opcional</span>
            <input value={nuevo.managerId} onChange={(e) => setNuevo({ ...nuevo, managerId: e.target.value })} />
          </label>
          <button className="accion" type="submit" disabled={!nuevo.nombre || !nuevo.telegramId}>
            Dar de alta
          </button>
        </form>
      </Tarjeta>
    </>
  );
}

export function Notificar() {
  const [texto, setTexto] = useState('');
  const [destino, setDestino] = useState('grupo');
  const [mensaje, setMensaje] = useState(null);
  const { datos } = useDatos(() => api.usuarios());
  const { datos: enviados, recargar } = useDatos(() => api.mensajes());

  async function enviar(evento) {
    evento.preventDefault();
    try {
      await api.notificar(destino, texto);
      setTexto('');
      setMensaje('Enviado.');
      recargar();
    } catch (e) {
      setMensaje(e.message);
    }
  }

  return (
    <>
      <h1>Notificaciones</h1>
      <p className="bajada">Escribir al grupo o a una persona desde aquí.</p>
      {mensaje ? <Aviso tipo="bien">{mensaje}</Aviso> : null}

      <Tarjeta>
        <form onSubmit={enviar}>
          <label>
            <span>A quién</span>
            <select value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="grupo">Al grupo</option>
              {(datos?.vinculaciones || []).map((v) => (
                <option key={v.telegram_id} value={v.telegram_id}>
                  {v.nombre_telegram || v.manager_nombre || v.telegram_id}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Mensaje</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          <button className="accion" type="submit" disabled={!texto}>
            Enviar
          </button>
        </form>
      </Tarjeta>

      <Tarjeta titulo="Últimos mensajes enviados">
        <Tabla
          filas={(enviados || []).slice(0, 30)}
          columnas={[
            { titulo: 'Cuándo', valor: (f) => fechaCorta(f.enviado_en) },
            { titulo: 'Destino', valor: (f) => f.destino },
            {
              titulo: 'Texto',
              valor: (f) => <span style={{ whiteSpace: 'normal' }}>{(f.texto || '').slice(0, 160)}</span>,
            },
          ]}
        />
      </Tarjeta>
    </>
  );
}

export function BaseDeDatos() {
  const { datos: tablas, cargando } = useDatos(() => api.tablas());
  const [elegida, setElegida] = useState(null);
  const [salto, setSalto] = useState(0);
  const { datos: contenido } = useDatos(
    () => (elegida ? api.tabla(elegida, salto) : Promise.resolve(null)),
    [elegida, salto],
  );

  if (cargando) return <Cargando que="las tablas" />;

  const columnas = contenido?.filas?.[0]
    ? Object.keys(contenido.filas[0]).map((clave) => ({
        titulo: clave,
        valor: (f) => {
          const valor = f[clave];
          if (valor == null) return <span className="suave">—</span>;
          return String(valor).slice(0, 120);
        },
      }))
    : [];

  return (
    <>
      <h1>Base de datos</h1>
      <p className="bajada">Todo lo que el bot ha ido guardando.</p>

      <Tarjeta>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(tablas || []).map((t) => (
            <button
              key={t.nombre}
              className="accion suave"
              onClick={() => {
                setElegida(t.nombre);
                setSalto(0);
              }}
              style={elegida === t.nombre ? { borderColor: 'var(--acento)', color: 'var(--acento)' } : undefined}
            >
              {t.nombre} <span className="suave">({t.filas})</span>
            </button>
          ))}
        </div>
      </Tarjeta>

      {contenido ? (
        <Tarjeta titulo={`${contenido.nombre} · ${contenido.total} filas`}>
          <Tabla filas={contenido.filas} columnas={columnas} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="accion suave" disabled={salto === 0} onClick={() => setSalto(Math.max(0, salto - 100))}>
              Anteriores
            </button>
            <button
              className="accion suave"
              disabled={salto + 100 >= contenido.total}
              onClick={() => setSalto(salto + 100)}
            >
              Siguientes
            </button>
            <span className="suave" style={{ alignSelf: 'center' }}>
              {salto + 1}–{Math.min(salto + 100, contenido.total)}
            </span>
          </div>
        </Tarjeta>
      ) : null}
    </>
  );
}

export { Dato };
