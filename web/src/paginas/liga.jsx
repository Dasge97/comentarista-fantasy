import { useState } from 'react';
import { api, fechaCorta, millones } from '../api.js';
import { Aviso, Cargando, Dato, Tabla, Tarjeta, useDatos } from '../componentes/comunes.jsx';
import GraficoLinea from '../componentes/GraficoLinea.jsx';

export function Clasificacion() {
  const { datos, error, cargando } = useDatos(() => api.clasificacion());

  return (
    <>
      <h1>Clasificación</h1>
      <p className="bajada">
        Sin la cuenta de servicio, así que los puestos pueden no coincidir con los de la aplicación oficial.
      </p>
      <Aviso>{error}</Aviso>
      {cargando ? (
        <Cargando que="la clasificación" />
      ) : (
        <Tarjeta titulo={datos?.jornada ? `Jornada ${datos.jornada}` : 'Clasificación'}>
          <Tabla
            filas={datos?.filas}
            vacio="Todavía no se ha leído ninguna clasificación."
            columnas={[
              { titulo: '#', valor: (_f, i) => i + 1, numerica: true },
              { titulo: 'Manager', valor: (f) => f.nombre },
              { titulo: 'Total', valor: (f) => f.puntos_generales, numerica: true },
              {
                titulo: 'Esta jornada',
                valor: (f) => (f.puntos_jornada == null ? '—' : f.puntos_jornada),
                numerica: true,
              },
              { titulo: 'Leído', valor: (f) => fechaCorta(f.observado_en) },
            ]}
          />
          <p className="suave" style={{ fontSize: 13, marginBottom: 0 }}>
            El total ya incluye los puntos de la jornada en curso. Fantasy los sigue ajustando durante el partido y un
            rato después.
          </p>
        </Tarjeta>
      )}
    </>
  );
}

export function Manager() {
  const { datos: managers, cargando } = useDatos(() => api.managers());
  const [elegido, setElegido] = useState(null);
  const equipoId = elegido || managers?.[0]?.equipo_id;
  const { datos: ficha } = useDatos(() => (equipoId ? api.manager(equipoId) : Promise.resolve(null)), [equipoId]);

  if (cargando) return <Cargando que="los managers" />;

  return (
    <>
      <h1>Managers</h1>
      <p className="bajada">Plantilla actual y puntos por jornada.</p>

      <Tarjeta>
        <label style={{ marginBottom: 0 }}>
          <span>Manager</span>
          <select value={equipoId || ''} onChange={(e) => setElegido(e.target.value)}>
            {(managers || []).map((m) => (
              <option key={m.equipo_id} value={m.equipo_id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
      </Tarjeta>

      {ficha ? (
        <>
          <Tarjeta titulo={`Plantilla de ${ficha.manager.nombre}`}>
            <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
              «Desde» es cuándo lo vio el bot por primera vez en su plantilla, no cuándo lo fichó de verdad. Para las
              fechas reales de fichaje, mira la página de Movimientos.
            </p>
            <Tabla
              filas={ficha.plantilla}
              vacio="Todavía no se ha leído su plantilla."
              columnas={[
                { titulo: 'Futbolista', valor: (f) => f.nombre || `sin nombre (${f.futbolista_id})` },
                { titulo: 'Lo tiene desde', valor: (f) => fechaCorta(f.desde) },
              ]}
            />
          </Tarjeta>

          <Tarjeta titulo="Puntos por jornada">
            <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
              Una fila por jornada disputada. «Puntos» es lo que sumó su once esa jornada. «Puesto» es en qué lugar
              quedó de la liga en esa jornada suelta, no en la clasificación general.
            </p>
            <Tabla
              filas={ficha.jornadas}
              vacio="Todavía no hay jornadas leídas."
              columnas={[
                { titulo: 'Jornada', valor: (f) => f.jornada, numerica: true },
                { titulo: 'Puntos esa jornada', valor: (f) => (f.puntos_jornada == null ? '—' : f.puntos_jornada), numerica: true },
                { titulo: 'Puesto esa jornada', valor: (f) => (f.posicion == null ? '—' : `${f.posicion}.º`), numerica: true },
              ]}
            />
          </Tarjeta>
        </>
      ) : null}
    </>
  );
}

export function Dinero() {
  const { datos, error, cargando, recargar } = useDatos(() => api.dinero());
  const [real, setReal] = useState('');
  const [manager, setManager] = useState('');
  const [resultado, setResultado] = useState(null);

  async function calibrar(evento) {
    evento.preventDefault();
    try {
      const r = await api.calibrarDinero(manager, Number(real.replace(/\./g, '').replace(/,/g, '')));
      setResultado(`Presupuesto inicial deducido: ${millones(r.presupuestoInicial)}.`);
      recargar();
    } catch (e) {
      setResultado(e.message);
    }
  }

  const sinCalibrar = datos?.some((d) => d.sinPresupuesto);

  return (
    <>
      <h1>Dinero</h1>
      <p className="bajada">Calculado a partir de los movimientos de la liga, no leído de Fantasy.</p>
      <Aviso>{error}</Aviso>

      {sinCalibrar ? (
        <Aviso tipo="ojo">
          Falta el presupuesto inicial, así que las cifras están desplazadas todas por igual. Las diferencias entre
          managers sí son correctas. Calíbralo abajo con tu dinero real.
        </Aviso>
      ) : null}

      {cargando ? (
        <Cargando que="el dinero" />
      ) : (
        <Tarjeta>
          <Tabla
            filas={[...(datos || [])].sort((a, b) => (b.patrimonio ?? b.dinero) - (a.patrimonio ?? a.dinero))}
            columnas={[
              { titulo: 'Manager', valor: (f) => f.nombre },
              { titulo: 'Dinero', valor: (f) => millones(f.dinero), numerica: true },
              { titulo: 'Valor del equipo', valor: (f) => millones(f.valorEquipo), numerica: true },
              { titulo: 'Dinero + equipo', valor: (f) => millones(f.patrimonio), numerica: true },
              { titulo: 'Gastado', valor: (f) => millones(f.gastado), numerica: true },
              { titulo: 'Ingresado', valor: (f) => millones(f.ingresado), numerica: true },
              { titulo: 'Movimientos', valor: (f) => f.movimientos, numerica: true },
            ]}
          />
          <p className="suave" style={{ fontSize: 13, marginBottom: 0 }}>
            El <b>valor del equipo</b> es lo que valen sus futbolistas, y ese sí lo da Fantasy de todos. Sumado al
            dinero da lo que tiene cada uno en total: alguien puede ir corto de dinero simplemente porque lo tiene
            todo metido en la plantilla.
          </p>
        </Tarjeta>
      )}

      <Tarjeta titulo="Calibrar con tu dinero real">
        <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
          Fantasy no deja leer el dinero de otro manager. Mira el tuyo en la aplicación oficial y escríbelo aquí: con
          eso se deduce el presupuesto con el que empezó todo el mundo.
        </p>
        <form onSubmit={calibrar}>
          <label>
            <span>Tu manager</span>
            <select value={manager} onChange={(e) => setManager(e.target.value)}>
              <option value="">Elige…</option>
              {(datos || []).map((d) => (
                <option key={d.managerId} value={d.managerId}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tu dinero ahora mismo, en euros</span>
            <input value={real} onChange={(e) => setReal(e.target.value)} placeholder="147300000" inputMode="numeric" />
          </label>
          <button className="accion" type="submit" disabled={!manager || !real}>
            Calibrar
          </button>
        </form>
        {resultado ? (
          <p className="suave" style={{ marginBottom: 0 }}>
            {resultado}
          </p>
        ) : null}
      </Tarjeta>
    </>
  );
}

export function Mercado() {
  const { datos, error, cargando } = useDatos(() => api.mercado());
  const [filtro, setFiltro] = useState('todo');

  const filas = (datos || []).filter((f) => filtro === 'todo' || f.origen === filtro);
  const deManager = (datos || []).filter((f) => f.origen === 'manager').length;
  const libres = (datos || []).filter((f) => f.origen !== 'manager').length;

  return (
    <>
      <h1>Mercado</h1>
      <p className="bajada">Lo que está a la venta ahora mismo.</p>
      <Aviso>{error}</Aviso>

      <Tarjeta>
        <p className="suave" style={{ marginTop: 0, fontSize: 13 }}>
          El mercado mezcla dos cosas. Los <b>libres</b> los ofrece el juego y no son de nadie. Los de{' '}
          <b>manager</b> los ha puesto a la venta alguien de vuestra liga, y ahí sí sale quién.
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            ['todo', `Todo (${(datos || []).length})`],
            ['manager', `De managers (${deManager})`],
            ['libre', `Libres (${libres})`],
          ].map(([valor, titulo]) => (
            <button
              key={valor}
              className="accion suave"
              onClick={() => setFiltro(valor)}
              style={filtro === valor ? { borderColor: 'var(--acento)', color: 'var(--acento)' } : undefined}
            >
              {titulo}
            </button>
          ))}
        </div>
      </Tarjeta>

      {cargando ? (
        <Cargando que="el mercado" />
      ) : (
        <Tarjeta>
          <Tabla
            filas={filas}
            vacio="El mercado está vacío o todavía no se ha leído."
            columnas={[
              { titulo: 'Futbolista', valor: (f) => f.futbolista_nombre || `sin nombre (${f.futbolista_id})` },
              {
                titulo: 'Lo vende',
                valor: (f) =>
                  f.origen === 'manager' ? f.vendedor_nombre || 'un manager' : <span className="suave">nadie, es libre</span>,
              },
              { titulo: 'Precio', valor: (f) => millones(f.precio), numerica: true },
              { titulo: 'Cláusula', valor: (f) => (f.clausula == null ? '—' : millones(f.clausula)), numerica: true },
              { titulo: 'Pujas', valor: (f) => f.pujas ?? 0, numerica: true },
              { titulo: 'Expira', valor: (f) => fechaCorta(f.expira) },
            ]}
          />
          <p className="suave" style={{ fontSize: 13, marginBottom: 0 }}>
            Fantasy no deja ver el importe de las pujas ajenas, solo cuántas hay.
          </p>
        </Tarjeta>
      )}
    </>
  );
}

export function Movimientos() {
  const { datos, error, cargando } = useDatos(() => api.movimientos());
  return (
    <>
      <h1>Movimientos</h1>
      <p className="bajada">Fichajes, ventas y premios de la liga.</p>
      <Aviso>{error}</Aviso>
      {cargando ? (
        <Cargando que="los movimientos" />
      ) : (
        <Tarjeta>
          <Tabla
            filas={datos}
            columnas={[
              { titulo: 'Cuándo', valor: (f) => fechaCorta(f.fecha) },
              { titulo: 'Manager', valor: (f) => f.manager_nombre || f.manager_id || '—' },
              { titulo: 'Qué', valor: (f) => f.tipo_nombre },
              { titulo: 'Futbolista', valor: (f) => f.futbolista_nombre || f.futbolista_id || '—' },
              { titulo: 'Importe', valor: (f) => (f.importe == null ? '—' : millones(f.importe)), numerica: true },
            ]}
          />
        </Tarjeta>
      )}
    </>
  );
}

export function Precios() {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState(null);

  const { datos: resultados, cargando: buscando } = useDatos(
    () => (busqueda.length >= 2 ? api.buscarFutbolistas(busqueda) : Promise.resolve([])),
    [busqueda],
  );
  const { datos: ficha } = useDatos(
    () => (elegido ? api.valorDe(elegido.id) : Promise.resolve(null)),
    [elegido?.id],
  );

  const puntos = (ficha?.serie || []).map((f) => ({ fecha: f.fecha, valor: f.valor }));

  return (
    <>
      <h1>Precios</h1>
      <p className="bajada">Evolución del valor de mercado de un futbolista.</p>

      <Tarjeta>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusqueda(texto.trim());
          }}
        >
          <label style={{ marginBottom: 8 }}>
            <span>Buscar futbolista por nombre</span>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Bartra" />
          </label>
          <button className="accion" type="submit" disabled={texto.trim().length < 2}>
            Buscar
          </button>
        </form>

        {buscando ? <Cargando que="la búsqueda" /> : null}

        {resultados && resultados.length > 0 ? (
          <Tabla
            filas={resultados}
            columnas={[
              { titulo: 'Futbolista', valor: (f) => f.nombre },
              { titulo: 'Lo tiene', valor: (f) => f.propietario || <span className="suave">nadie</span> },
              { titulo: 'Valor', valor: (f) => millones(f.valor), numerica: true },
              {
                titulo: '',
                valor: (f) => (
                  <button className="accion suave" onClick={() => setElegido(f)}>
                    Ver evolución
                  </button>
                ),
              },
            ]}
          />
        ) : null}

        {busqueda.length >= 2 && resultados && resultados.length === 0 && !buscando ? (
          <p className="suave">Ningún futbolista se llama así.</p>
        ) : null}
      </Tarjeta>

      {elegido ? (
        <Tarjeta titulo={`Valor de mercado de ${elegido.nombre}`}>
          {ficha && ficha.diasGuardados < 2 ? (
            <Aviso tipo="ojo">
              Todavía no hay evolución que dibujar. El bot guarda una cifra al día y solo lleva{' '}
              {ficha.diasGuardados === 1 ? 'un día' : `${ficha.diasGuardados} días`} funcionando. Mañana ya habrá una
              línea. Fantasy no da el histórico de precios anterior, así que la serie empieza el día que arrancó el bot.
            </Aviso>
          ) : (
            <GraficoLinea puntos={puntos} titulo={`Valor de mercado de ${elegido.nombre}`} formatear={millones} />
          )}
          <p className="suave" style={{ fontSize: 13, marginBottom: 0 }}>
            Valor de hoy: {millones(elegido.valor)}.
          </p>
        </Tarjeta>
      ) : (
        <p className="suave">Busca un futbolista y elige «Ver evolución».</p>
      )}
    </>
  );
}

export { Dato };
