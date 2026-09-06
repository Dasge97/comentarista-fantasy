import { useState } from 'react';
import { api, fechaCorta } from '../api.js';
import {
  Aviso,
  Cabecera,
  Campo,
  Cargando,
  Casilla,
  Columnas,
  Dato,
  SubPestanas,
  Tabla,
  Tarjeta,
  useDatos,
  usarPestana,
} from '../componentes/comunes.jsx';

/**
 * Los ajustes agrupados por asunto.
 *
 * Cada grupo es una subpestaña. Así no hay que bajar por una página
 * larguísima para llegar al ajuste que se busca.
 */
const GRUPOS = [
  { id: 'modelo', titulo: 'Modelo', claves: [] },
  { id: 'fantasy', titulo: 'Fantasy', claves: ['fantasy_email', 'fantasy_password', 'liga_id', 'manager_servicio', 'presupuesto_inicial'] },
  { id: 'telegram', titulo: 'Telegram', claves: ['telegram_token', 'telegram_grupo', 'url_publica', 'saludar_al_entrar', 'bienvenida_grupo'] },
  { id: 'ritmo', titulo: 'Ritmo de lectura', claves: ['segundos_entre_lecturas', 'segundos_en_reposo', 'minutos_antes_del_partido', 'minutos_estabilizacion'] },
  {
    id: 'publicacion',
    titulo: 'Publicación',
    claves: [
      'silenciado',
      'publicar_privados',
      'publicar_grupo',
      'avisar_actuaciones',
      'puntos_para_destacar',
      'avisar_lesionados',
      'horas_antes_del_cierre',
      'anunciar_fichajes',
      'importe_minimo_fichaje',
      'lecturas_para_confirmar',
      'tono',
    ],
  },
  { id: 'textos', titulo: 'Textos de los avisos', claves: [] },
  { id: 'seguridad', titulo: 'Seguridad', claves: [] },
];

// Ajustes que valen sí o no, y se ven mejor como casilla que como campo de texto.
const CASILLAS = new Set([
  'publicar_privados',
  'publicar_grupo',
  'silenciado',
  'saludar_al_entrar',
  'avisar_actuaciones',
  'avisar_lesionados',
  'anunciar_fichajes',
]);

// Ajustes que necesitan varias líneas.
const LARGOS = new Set(['tono', 'bienvenida_grupo']);

const PISTAS = {
  segundos_entre_lecturas: 'Con un partido en juego. 60 es una lectura por minuto.',
  segundos_en_reposo: 'Cuando no hay partidos. 3600 es una hora.',
  minutos_antes_del_partido: 'Cuánto antes de empezar un partido se pasa al ritmo rápido.',
  minutos_estabilizacion: 'Fantasy sigue ajustando puntos tras el pitido final. Medido: unos cinco minutos.',
  lecturas_para_confirmar: 'Un adelantamiento debe repetirse estas lecturas seguidas antes de comentarlo en el grupo.',
  puntos_para_destacar: 'Cuántos puntos debe aportar una sola acción para avisar. Con 3 salen las buenas de verdad: seis paradas, cinco despejes. Con 1 llegarían decenas de avisos.',
  horas_antes_del_cierre: 'Cuánto antes del cierre de la alineación se avisa de lesionados y sancionados.',
  importe_minimo_fichaje: 'Por debajo de esta cifra el fichaje no se anuncia en el grupo.',
  telegram_grupo: 'Se elige con un botón en la página Telegram, sin escribirlo a mano.',
  manager_servicio: 'La cuenta que lee la liga. Se excluye de las clasificaciones que narra el bot.',
  presupuesto_inicial: 'Con cuánto empezó cada manager. Se deduce solo desde la página Dinero.',
  url_publica: 'Se usa en los enlaces de acceso que reparte el bot.',
};

export function Ajustes() {
  const { datos, error, cargando, recargar } = useDatos(() => api.configuracion());
  const [pestana, setPestana] = usarPestana('ajustes', 'modelo');
  const [cambios, setCambios] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento) {
    evento?.preventDefault();
    setGuardando(true);
    try {
      await api.guardarConfiguracion(cambios);
      setCambios({});
      setMensaje({ tipo: 'bien', texto: 'Guardado.' });
      recargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message });
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <Cargando que="la configuración" />;

  const porClave = Object.fromEntries((datos || []).map((a) => [a.clave, a]));
  const valorDe = (clave) => cambios[clave] ?? porClave[clave]?.valor ?? '';
  const poner = (clave, valor) => setCambios((previos) => ({ ...previos, [clave]: valor }));

  function campo(clave) {
    const ajuste = porClave[clave];
    if (!ajuste) return null;

    if (ajuste.secreto) {
      return (
        <Campo
          key={clave}
          etiqueta={ajuste.titulo}
          pista={ajuste.puesto ? 'Ya está puesta. Escribe una nueva solo si quieres cambiarla.' : 'Todavía no hay ninguna.'}
        >
          <input
            type="password"
            autoComplete="off"
            value={cambios[clave] ?? ''}
            placeholder={ajuste.puesto ? '••••••••••••' : ''}
            onChange={(e) => poner(clave, e.target.value)}
          />
        </Campo>
      );
    }

    if (CASILLAS.has(clave)) {
      return (
        <Casilla
          key={clave}
          etiqueta={ajuste.titulo}
          valor={valorDe(clave) === '1'}
          alCambiar={(v) => poner(clave, v ? '1' : '0')}
        />
      );
    }

    if (LARGOS.has(clave)) {
      return (
        <Campo key={clave} etiqueta={ajuste.titulo} pista={PISTAS[clave]}>
          <textarea value={valorDe(clave)} onChange={(e) => poner(clave, e.target.value)} />
        </Campo>
      );
    }

    return (
      <Campo key={clave} etiqueta={ajuste.titulo} pista={PISTAS[clave]}>
        <input value={valorDe(clave)} onChange={(e) => poner(clave, e.target.value)} />
      </Campo>
    );
  }

  const grupo = GRUPOS.find((g) => g.id === pestana) || GRUPOS[0];
  const plantillas = (datos || []).filter((a) => a.clave.startsWith('plantilla_'));
  const hayCambios = Object.keys(cambios).length > 0;

  return (
    <>
      <Cabecera titulo="Configuración">Todo lo que el bot necesita para funcionar.</Cabecera>
      <Aviso>{error}</Aviso>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}

      <SubPestanas pestanas={GRUPOS} activa={grupo.id} alCambiar={setPestana} />

      <form onSubmit={guardar}>
        {grupo.id === 'modelo' ? (
          <PestanaModelo campo={campo} valorDe={valorDe} poner={poner} hayCambios={hayCambios} />
        ) : null}

        {grupo.id === 'textos' ? (
          <Columnas>
            <Tarjeta titulo="Textos de los avisos privados">
              {plantillas.map((a) => campo(a.clave))}
            </Tarjeta>
            <Tarjeta titulo="Cómo funcionan">
              <p className="nota" style={{ marginTop: 0 }}>
                Son los mensajes que recibe cada manager cuando uno de sus futbolistas hace algo.
              </p>
              <p className="nota">
                Los huecos se sustituyen solos: <code>{'{jugador}'}</code> por el nombre del futbolista,{' '}
                <code>{'{puntos}'}</code> por los que lleva en la jornada y <code>{'{que}'}</code> por lo que le han
                quitado en una corrección.
              </p>
              <p className="nota" style={{ marginBottom: 0 }}>
                Se pueden usar las etiquetas <code>&lt;b&gt;</code> y <code>&lt;i&gt;</code>. Nada más: Telegram
                rechaza el mensaje entero si el formato está mal.
              </p>
            </Tarjeta>
          </Columnas>
        ) : null}

        {grupo.id === 'seguridad' ? <PestanaSeguridad alTerminar={setMensaje} /> : null}

        {grupo.claves.length > 0 ? (
          <Columnas>
            <Tarjeta titulo={grupo.titulo}>{grupo.claves.map(campo)}</Tarjeta>
            <AyudaDeGrupo id={grupo.id} />
          </Columnas>
        ) : null}

        {grupo.id !== 'seguridad' ? (
          <div className="barra-guardar">
            <button className="accion" type="submit" disabled={!hayCambios || guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {hayCambios ? (
              <button className="accion suave" type="button" onClick={() => setCambios({})}>
                Descartar
              </button>
            ) : null}
            <span className="nota">{hayCambios ? `${Object.keys(cambios).length} sin guardar` : 'Todo guardado'}</span>
          </div>
        ) : null}
      </form>
    </>
  );
}

/** Ayuda al lado de cada grupo de ajustes, para no llenar el formulario de texto. */
function AyudaDeGrupo({ id }) {
  const textos = {
    fantasy: [
      'Son las credenciales de la cuenta de servicio, la que está dentro de la liga solo para leer.',
      'No es tu cuenta. La tuya no la toca nadie.',
      'El identificador de la liga y el manager de servicio se rellenaron al desplegar y no suelen cambiar.',
    ],
    telegram: [
      'El token lo da @BotFather al crear el bot.',
      'El grupo no hace falta escribirlo: en la página Telegram sale la lista de grupos donde está el bot y se elige con un botón.',
      'La bienvenida es lo que publica en el grupo cuando entra alguien nuevo. El hueco {nombre} se sustituye por su nombre.',
    ],
    ritmo: [
      'El bot no lee todo el rato: mira el calendario y decide.',
      'Con un partido en juego lee cada minuto. Sin partidos, cada hora.',
      'Tras el pitido final sigue leyendo unos minutos, porque Fantasy ajusta la puntuación un rato más.',
    ],
    publicacion: [
      'Silenciar corta todo de golpe, privados y grupo.',
      'Las buenas actuaciones se miden en puntos, no en cantidad de acciones. Fantasy dice cuántos puntos vale cada estadística, así que el umbral se calibra solo para cada posición: seis paradas de un portero y cinco despejes de un defensa valen lo mismo.',
      'El número de lecturas para confirmar existe porque los puntos suben y bajan durante el partido. Con 3, un adelantamiento tarda unos tres minutos en publicarse, pero no se desmiente solo.',
      'El tono es la instrucción de estilo que recibe el modelo. Los hechos no los decide él.',
    ],
  };
  const lineas = textos[id];
  if (!lineas) return null;
  return (
    <Tarjeta titulo="Qué es esto">
      {lineas.map((linea) => (
        <p key={linea} className="nota" style={{ margin: '0 0 10px' }}>
          {linea}
        </p>
      ))}
    </Tarjeta>
  );
}

/**
 * La pestaña del modelo lleva su propia prueba.
 *
 * Antes estaba en la página de Estado, lejos de donde se escribe la clave, y
 * no había forma de saber qué modelos acepta el proveedor sin adivinarlo.
 */
function PestanaModelo({ campo, valorDe, poner, hayCambios }) {
  const [prueba, setPrueba] = useState(null);
  const [modelos, setModelos] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const proveedor = valorDe('proveedor_modelo') || 'anthropic';
  const claveModelo = proveedor === 'openai' ? 'openai_modelo' : 'anthropic_modelo';
  const listaCargada = Array.isArray(modelos);

  async function probar() {
    setOcupado(true);
    setPrueba({ estado: 'probando' });
    try {
      const r = await api.probarRedactor();
      setPrueba(r.ok ? { estado: 'bien', ...r } : { estado: 'mal', motivo: r.motivo });
    } catch (e) {
      setPrueba({ estado: 'mal', motivo: e.message });
    } finally {
      setOcupado(false);
    }
  }

  async function cargarModelos() {
    setOcupado(true);
    setModelos(null);
    try {
      const r = await api.modelosDisponibles();
      setModelos(r.ok ? r.modelos : { error: r.motivo });
    } catch (e) {
      setModelos({ error: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Columnas>
      <Tarjeta
        titulo="Quién escribe"
        explica="Los comentarios del grupo los redacta un modelo de lenguaje. Los hechos van medidos; el modelo solo pone las palabras."
      >
        <Campo etiqueta="Proveedor" pista="Cada uno guarda su clave por separado, así que puedes cambiar sin volver a escribirla.">
          <select value={proveedor} onChange={(e) => poner('proveedor_modelo', e.target.value)}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
        </Campo>

        {proveedor === 'openai' ? campo('openai_api_key') : campo('anthropic_api_key')}

        <Campo
          etiqueta="Dirección base"
          pista={`Déjalo vacío para usar la API oficial de ${proveedor === 'openai' ? 'OpenAI' : 'Anthropic'}.`}
        >
          <input
            value={valorDe(proveedor === 'openai' ? 'openai_base_url' : 'anthropic_base_url')}
            onChange={(e) => poner(proveedor === 'openai' ? 'openai_base_url' : 'anthropic_base_url', e.target.value)}
            placeholder="https://…"
          />
        </Campo>

        <Campo
          etiqueta="Modelo"
          pista="Sin modelo elegido el bot publica una frase sencilla en vez de un comentario escrito."
        >
          {listaCargada ? (
            <select value={valorDe(claveModelo)} onChange={(e) => poner(claveModelo, e.target.value)}>
              <option value="">Elige un modelo…</option>
              {modelos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input value={valorDe(claveModelo)} onChange={(e) => poner(claveModelo, e.target.value)} />
          )}
        </Campo>

        <div className="botonera">
          <button className="accion suave" type="button" onClick={cargarModelos} disabled={ocupado}>
            {listaCargada ? 'Actualizar la lista' : 'Ver qué modelos acepta'}
          </button>
          <button className="accion" type="button" onClick={probar} disabled={ocupado || hayCambios}>
            Probar
          </button>
        </div>

        {hayCambios ? (
          <p className="nota" style={{ marginBottom: 0 }}>
            Guarda primero para poder probar. La prueba usa lo que hay guardado, no lo que acabas de escribir.
          </p>
        ) : null}

        {modelos?.error ? <Aviso>No se pudo consultar la lista: {modelos.error}</Aviso> : null}
      </Tarjeta>

      <Tarjeta titulo="Resultado de la prueba">
        {!prueba ? (
          <p className="nota" style={{ margin: 0 }}>
            Pulsa «Probar» y le pido al modelo que conteste una palabra. Es la forma de saber si la clave, la dirección
            y el modelo funcionan sin esperar a que haya un adelantamiento de verdad.
          </p>
        ) : null}

        {prueba?.estado === 'probando' ? <p className="suave">Preguntando al modelo…</p> : null}

        {prueba?.estado === 'bien' ? (
          <>
            <Aviso tipo="bien">El modelo responde.</Aviso>
            <p className="nota" style={{ margin: 0 }}>
              Proveedor <b>{prueba.proveedor}</b>, modelo <b>{prueba.modelo}</b>, contra {prueba.base}.
              <br />
              Ha contestado: «{prueba.texto}».
            </p>
          </>
        ) : null}

        {prueba?.estado === 'mal' ? (
          <>
            <Aviso>{prueba.motivo}</Aviso>
            <p className="nota" style={{ margin: 0 }}>
              Si dice que falta elegir el modelo, pulsa «Ver qué modelos acepta» y elige uno de la lista. Si dice que
              la clave no vale, escríbela otra vez y guarda.
            </p>
          </>
        ) : null}
      </Tarjeta>
    </Columnas>
  );
}

function PestanaSeguridad({ alTerminar }) {
  const [nueva, setNueva] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function cambiar() {
    setEnviando(true);
    try {
      await api.cambiarContrasena(nueva);
      setNueva('');
      alTerminar({ tipo: 'bien', texto: 'Contraseña cambiada.' });
    } catch (e) {
      alTerminar({ tipo: 'error', texto: e.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Columnas>
      <Tarjeta
        titulo="Contraseña de administrador"
        explica="Es con la que entras tú. Los participantes no la usan: ellos entran con el enlace que les da el bot."
      >
        <Campo etiqueta="Nueva contraseña" pista="Al menos diez caracteres.">
          <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" />
        </Campo>
        <button className="accion" type="button" onClick={cambiar} disabled={nueva.length < 10 || enviando}>
          Cambiar la contraseña
        </button>
      </Tarjeta>
      <Tarjeta titulo="Qué guarda esta web">
        <p className="nota" style={{ marginTop: 0 }}>
          La clave del modelo, el token del bot y la contraseña de la cuenta de Fantasy. Se guardan cifradas y desde
          aquí se pueden cambiar, pero no leer.
        </p>
        <p className="nota" style={{ marginBottom: 0 }}>
          Conviene que esta contraseña no sea la misma que la de la cuenta de Fantasy: quien consiguiera una tendría
          las dos.
        </p>
      </Tarjeta>
    </Columnas>
  );
}

export function Estado() {
  const { datos, error, cargando, recargar } = useDatos(() => api.estado());
  const { datos: incidencias, recargar: recargarIncidencias } = useDatos(() => api.incidencias());
  const [mensaje, setMensaje] = useState(null);
  const [leyendo, setLeyendo] = useState(false);

  async function forzar() {
    setLeyendo(true);
    setMensaje('Leyendo…');
    try {
      const r = await api.forzarLectura();
      setMensaje(`Leída la jornada ${r.jornada}. Lectura ${r.completa ? 'completa' : 'incompleta'}.`);
      recargar();
      recargarIncidencias();
    } catch (e) {
      setMensaje(e.message);
    } finally {
      setLeyendo(false);
    }
  }

  if (cargando) return <Cargando que="el estado" />;

  return (
    <>
      <Cabecera titulo="Estado">Cómo va el bot ahora mismo.</Cabecera>
      <Aviso>{error}</Aviso>

      {!datos?.configurado ? (
        <Aviso tipo="ojo">
          Falta configuración. Ve a Configuración, pestaña Fantasy, y rellena las credenciales y el identificador de la
          liga.
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
          tono={datos.sesionFantasy.activa ? 'bien' : 'mal'}
          detalle={
            datos.sesionFantasy.activa
              ? `Le quedan ${datos.sesionFantasy.minutosRestantes} minutos.`
              : 'Se renovará sola en la próxima lectura.'
          }
        />
        <Dato
          titulo="Telegram"
          valor={datos.telegram.configurado ? 'Conectado' : 'Sin token'}
          tono={datos.telegram.configurado ? 'bien' : 'mal'}
          detalle={datos.telegram.grupo ? 'Con grupo asignado.' : 'Falta elegir el grupo.'}
        />
        <Dato titulo="Managers" valor={datos.managers} detalle={`${datos.vinculados} se han identificado en el bot.`} />
        <Dato
          titulo="¿Se leyeron todos?"
          valor={datos.servicio.lecturaCompleta === null ? 'Sin leer aún' : datos.servicio.lecturaCompleta ? 'Sí' : 'No'}
          tono={datos.servicio.lecturaCompleta === false ? 'mal' : undefined}
          detalle="Con una lectura a medias el bot calla en el grupo."
        />
      </div>

      <Columnas>
        <Tarjeta
          titulo="Leer ahora"
          explica="El bot lee según el calendario: cada minuto con partido en juego, cada hora sin partidos. Este botón se salta la espera y hace una lectura completa ya."
        >
          <button className="accion" type="button" onClick={forzar} disabled={leyendo}>
            {leyendo ? 'Leyendo…' : 'Leer ahora, sin esperar'}
          </button>
          {mensaje ? (
            <p className="nota" style={{ marginBottom: 0 }}>
              {mensaje}
            </p>
          ) : null}
        </Tarjeta>

        {datos.servicio.ultimoError ? (
          <Tarjeta titulo="Último error">
            <Aviso>{datos.servicio.ultimoError.mensaje}</Aviso>
            <p className="nota" style={{ margin: 0 }}>
              {fechaCorta(datos.servicio.ultimoError.cuando)}
            </p>
          </Tarjeta>
        ) : (
          <Tarjeta titulo="Errores">
            <p className="nota" style={{ margin: 0 }}>
              Ninguno desde que arrancó.
            </p>
          </Tarjeta>
        )}
      </Columnas>

      <Tarjeta titulo="Registro">
        <Tabla
          filas={(incidencias || []).slice(0, 50)}
          columnas={[
            { titulo: 'Cuándo', valor: (f) => fechaCorta(f.ocurrida_en) },
            {
              titulo: 'Nivel',
              valor: (f) => (
                <span className={`etiqueta ${f.nivel === 'error' ? 'mal' : f.nivel === 'aviso' ? 'ojo' : ''}`}>
                  {f.nivel}
                </span>
              ),
            },
            { titulo: 'Origen', valor: (f) => f.origen },
            { titulo: 'Mensaje', valor: (f) => <span style={{ whiteSpace: 'normal' }}>{f.mensaje}</span> },
          ]}
        />
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
      setMensaje({ tipo: 'bien', texto: 'Dado de alta. Ya puede pedir su enlace al bot con /web.' });
      recargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message });
    }
  }

  if (cargando) return <Cargando que="los usuarios" />;

  const sinAcceso = (datos?.vinculaciones || []).filter(
    (v) => !(datos?.usuarios || []).some((u) => u.telegram_id === v.telegram_id),
  );

  return (
    <>
      <Cabecera titulo="Usuarios">Quién puede entrar en esta web. Nadie se registra solo.</Cabecera>
      <Aviso>{error}</Aviso>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}

      <Tarjeta titulo="Con acceso a la web">
        <Tabla
          filas={datos?.usuarios}
          columnas={[
            { titulo: 'Nombre', valor: (f) => f.nombre },
            { titulo: 'Papel', valor: (f) => <span className="etiqueta">{f.rol}</span> },
            { titulo: 'Manager', valor: (f) => f.manager_nombre || '—' },
            { titulo: 'Telegram', valor: (f) => f.telegram_id || '—' },
            {
              titulo: 'Activo',
              valor: (f) => <span className={`etiqueta ${f.activo ? 'bien' : 'mal'}`}>{f.activo ? 'sí' : 'no'}</span>,
            },
            {
              titulo: '',
              valor: (f) =>
                f.rol === 'administrador' ? null : (
                  <button
                    type="button"
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

      <Columnas>
        <Tarjeta
          titulo="Dar acceso"
          explica="Primero tienen que hablar con el bot y elegir su manager. Después aparecen aquí y les das acceso con un botón."
        >
          <Tabla
            filas={sinAcceso}
            vacio="Todos los que han hablado con el bot ya tienen acceso."
            columnas={[
              { titulo: 'Persona', valor: (v) => v.nombre_telegram || v.telegram_id },
              { titulo: 'Manager', valor: (v) => v.manager_nombre || v.manager_id },
              {
                titulo: '',
                valor: (v) => (
                  <button
                    type="button"
                    className="accion"
                    onClick={async () => {
                      await api.crearUsuario({
                        nombre: v.nombre_telegram || v.manager_nombre || v.telegram_id,
                        telegramId: v.telegram_id,
                        managerId: v.manager_id,
                      });
                      setMensaje({ tipo: 'bien', texto: 'Dado de alta. Ya puede pedir su enlace con /web.' });
                      recargar();
                    }}
                  >
                    Dar acceso
                  </button>
                ),
              },
            ]}
          />
        </Tarjeta>

        <Tarjeta titulo="A mano" explica="Solo hace falta para alguien que todavía no ha hablado con el bot.">
          <form onSubmit={crear}>
            <Campo etiqueta="Nombre">
              <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            </Campo>
            <Campo etiqueta="Identificador de Telegram">
              <input value={nuevo.telegramId} onChange={(e) => setNuevo({ ...nuevo, telegramId: e.target.value })} />
            </Campo>
            <Campo etiqueta="Manager" pista="Opcional.">
              <input value={nuevo.managerId} onChange={(e) => setNuevo({ ...nuevo, managerId: e.target.value })} />
            </Campo>
            <button className="accion" type="submit" disabled={!nuevo.nombre || !nuevo.telegramId}>
              Dar de alta
            </button>
          </form>
        </Tarjeta>
      </Columnas>
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
      setMensaje({ tipo: 'bien', texto: 'Enviado.' });
      recargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message });
    }
  }

  return (
    <>
      <Cabecera titulo="Notificaciones">Escribir al grupo o a una persona desde aquí.</Cabecera>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}

      <Columnas>
        <Tarjeta titulo="Escribir un mensaje">
          <form onSubmit={enviar}>
            <Campo etiqueta="A quién">
              <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="grupo">Al grupo</option>
                {(datos?.vinculaciones || []).map((v) => (
                  <option key={v.telegram_id} value={v.telegram_id}>
                    {v.nombre_telegram || v.manager_nombre || v.telegram_id}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Mensaje" pista="Se pueden usar las etiquetas <b> y <i>.">
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Campo>
            <button className="accion" type="submit" disabled={!texto}>
              Enviar
            </button>
          </form>
        </Tarjeta>

        <Tarjeta titulo="Últimos mensajes enviados">
          <Tabla
            filas={(enviados || []).slice(0, 20)}
            columnas={[
              { titulo: 'Cuándo', valor: (f) => fechaCorta(f.enviado_en) },
              { titulo: 'Destino', valor: (f) => f.destino },
              {
                titulo: 'Texto',
                valor: (f) => <span style={{ whiteSpace: 'normal' }}>{(f.texto || '').slice(0, 120)}</span>,
              },
            ]}
          />
        </Tarjeta>
      </Columnas>
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
      <Cabecera titulo="Base de datos">Todo lo que el bot ha ido guardando.</Cabecera>

      <Tarjeta titulo="Tablas">
        <div className="botonera">
          {(tablas || []).map((t) => (
            <button
              key={t.nombre}
              type="button"
              className={`accion suave ${elegida === t.nombre ? 'elegido' : ''}`}
              onClick={() => {
                setElegida(t.nombre);
                setSalto(0);
              }}
            >
              {t.nombre} <span className="suave">({t.filas})</span>
            </button>
          ))}
        </div>
      </Tarjeta>

      {contenido ? (
        <Tarjeta titulo={`${contenido.nombre} · ${contenido.total} filas`}>
          <Tabla filas={contenido.filas} columnas={columnas} />
          <div className="botonera" style={{ marginTop: 14 }}>
            <button className="accion suave" type="button" disabled={salto === 0} onClick={() => setSalto(Math.max(0, salto - 100))}>
              Anteriores
            </button>
            <button
              className="accion suave"
              type="button"
              disabled={salto + 100 >= contenido.total}
              onClick={() => setSalto(salto + 100)}
            >
              Siguientes
            </button>
            <span className="nota">
              {salto + 1}–{Math.min(salto + 100, contenido.total)} de {contenido.total}
            </span>
          </div>
        </Tarjeta>
      ) : null}
    </>
  );
}
