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
            <Tabla
              filas={ficha.plantilla}
              vacio="Todavía no se ha leído su plantilla."
              columnas={[
                { titulo: 'Futbolista', valor: (f) => f.nombre || f.futbolista_id },
                { titulo: 'Desde', valor: (f) => fechaCorta(f.desde) },
              ]}
            />
          </Tarjeta>

          <Tarjeta titulo="Puntos por jornada">
            <Tabla
              filas={ficha.jornadas}
              vacio="Todavía no hay jornadas leídas."
              columnas={[
                { titulo: 'Jornada', valor: (f) => f.jornada, numerica: true },
                { titulo: 'Puntos', valor: (f) => (f.puntos_jornada == null ? '—' : f.puntos_jornada), numerica: true },
                { titulo: 'Puesto', valor: (f) => f.posicion, numerica: true },
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
            filas={[...(datos || [])].sort((a, b) => b.dinero - a.dinero)}
            columnas={[
              { titulo: 'Manager', valor: (f) => f.nombre },
              { titulo: 'Dinero', valor: (f) => millones(f.dinero), numerica: true },
              { titulo: 'Gastado', valor: (f) => millones(f.gastado), numerica: true },
              { titulo: 'Ingresado', valor: (f) => millones(f.ingresado), numerica: true },
              { titulo: 'Movimientos', valor: (f) => f.movimientos, numerica: true },
            ]}
          />
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
  return (
    <>
      <h1>Mercado</h1>
      <p className="bajada">Lo que está a la venta ahora mismo.</p>
      <Aviso>{error}</Aviso>
      {cargando ? (
        <Cargando que="el mercado" />
      ) : (
        <Tarjeta>
          <Tabla
            filas={datos}
            vacio="El mercado está vacío o todavía no se ha leído."
            columnas={[
              { titulo: 'Futbolista', valor: (f) => f.futbolista_id },
              { titulo: 'Precio', valor: (f) => millones(f.precio), numerica: true },
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
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState(null);
  const { datos: mercado } = useDatos(() => api.mercado());
  const { datos: serie } = useDatos(
    () => (elegido ? api.valorDe(elegido.id) : Promise.resolve(null)),
    [elegido?.id],
  );

  // La búsqueda usa el mercado como catálogo rápido. Basta para empezar.
  const candidatos = (mercado || [])
    .filter((m) => String(m.futbolista_id).includes(busqueda))
    .slice(0, 20);

  const puntos = (serie || []).map((f) => ({ fecha: f.fecha, valor: f.valor }));

  return (
    <>
      <h1>Precios</h1>
      <p className="bajada">Evolución del valor de mercado de un futbolista.</p>

      <Tarjeta>
        <label style={{ marginBottom: 8 }}>
          <span>Buscar por identificador de futbolista</span>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="2638" inputMode="numeric" />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {candidatos.map((c) => (
            <button
              key={c.futbolista_id}
              className="accion suave"
              onClick={() => setElegido({ id: c.futbolista_id })}
            >
              {c.futbolista_id}
            </button>
          ))}
        </div>
      </Tarjeta>

      {elegido ? (
        <Tarjeta titulo={`Valor de mercado del futbolista ${elegido.id}`}>
          <GraficoLinea puntos={puntos} titulo={`Valor de mercado del futbolista ${elegido.id}`} formatear={millones} />
          <p className="suave" style={{ fontSize: 13, marginBottom: 0 }}>
            Se guarda una cifra al día. La serie empieza el día que el bot se puso en marcha.
          </p>
        </Tarjeta>
      ) : (
        <p className="suave">Elige un futbolista para ver su evolución.</p>
      )}
    </>
  );
}

export { Dato };
