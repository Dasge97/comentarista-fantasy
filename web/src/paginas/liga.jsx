import { useState } from 'react';
import { api, fechaCorta, millones } from '../api.js';
import {
  Aviso,
  Cabecera,
  Campo,
  Cargando,
  Columnas,
  Dato,
  SubPestanas,
  Tabla,
  Tarjeta,
  useDatos,
  usarPestana,
} from '../componentes/comunes.jsx';
import GraficoLinea from '../componentes/GraficoLinea.jsx';

export function Clasificacion() {
  const { datos, error, cargando } = useDatos(() => api.clasificacion());
  const filas = datos?.filas || [];
  const lider = filas[0];
  const ultimo = filas[filas.length - 1];

  return (
    <>
      <Cabecera titulo="Clasificación">
        Sin la cuenta de servicio, así que los puestos pueden no coincidir con los de la aplicación oficial.
      </Cabecera>
      <Aviso>{error}</Aviso>

      {cargando ? (
        <Cargando que="la clasificación" />
      ) : (
        <>
          {lider ? (
            <div className="rejilla">
              <Dato titulo="Jornada" valor={datos.jornada ?? '—'} />
              <Dato titulo="Líder" valor={lider.nombre} detalle={`${lider.puntos_generales} puntos.`} />
              <Dato
                titulo="Diferencia con el segundo"
                valor={filas[1] ? `${lider.puntos_generales - filas[1].puntos_generales} pts` : '—'}
              />
              <Dato titulo="Farolillo rojo" valor={ultimo?.nombre} detalle={`${ultimo?.puntos_generales} puntos.`} />
            </div>
          ) : null}

          <Tarjeta
            titulo={datos?.jornada ? `Jornada ${datos.jornada}` : 'Clasificación'}
            explica="El total ya incluye los puntos de la jornada en curso. Fantasy los sigue ajustando durante el partido y un rato después."
          >
            <Tabla
              filas={filas}
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
          </Tarjeta>
        </>
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
      <Cabecera titulo="Managers">Plantilla actual y resultado de cada jornada.</Cabecera>

      <SubPestanas
        pestanas={(managers || []).map((m) => ({ id: m.equipo_id, titulo: m.nombre }))}
        activa={equipoId}
        alCambiar={setElegido}
      />

      {ficha ? (
        <Columnas>
          <Tarjeta
            titulo={`Plantilla de ${ficha.manager.nombre}`}
            explica="«Lo tiene desde» es cuándo lo vio el bot por primera vez en su plantilla, no cuándo lo fichó. Las fechas reales están en Movimientos."
          >
            <Tabla
              filas={ficha.plantilla}
              vacio="Todavía no se ha leído su plantilla."
              columnas={[
                { titulo: 'Futbolista', valor: (f) => f.nombre || `sin nombre (${f.futbolista_id})` },
                { titulo: 'Lo tiene desde', valor: (f) => fechaCorta(f.desde) },
              ]}
            />
          </Tarjeta>

          <Tarjeta
            titulo="Jornada a jornada"
            explica="«Puntos» es lo que sumó su once esa jornada. «Puesto» es en qué lugar quedó de la liga en esa jornada suelta, no en la general."
          >
            <Tabla
              filas={ficha.jornadas}
              vacio="Todavía no hay jornadas leídas."
              columnas={[
                { titulo: 'Jornada', valor: (f) => f.jornada, numerica: true },
                { titulo: 'Puntos', valor: (f) => (f.puntos_jornada == null ? '—' : f.puntos_jornada), numerica: true },
                { titulo: 'Puesto', valor: (f) => (f.posicion == null ? '—' : `${f.posicion}.º`), numerica: true },
              ]}
            />
          </Tarjeta>
        </Columnas>
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
      const r = await api.calibrarDinero(manager, Number(real.replace(/[.\s,]/g, '')));
      setResultado({ tipo: 'bien', texto: `Presupuesto inicial deducido: ${millones(r.presupuestoInicial)}.` });
      recargar();
    } catch (e) {
      setResultado({ tipo: 'error', texto: e.message });
    }
  }

  const sinCalibrar = datos?.some((d) => d.sinPresupuesto);
  const ordenados = [...(datos || [])].sort((a, b) => (b.patrimonio ?? b.dinero) - (a.patrimonio ?? a.dinero));

  return (
    <>
      <Cabecera titulo="Dinero">Calculado a partir de los movimientos de la liga, no leído de Fantasy.</Cabecera>
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
        <Tarjeta
          titulo="Quién tiene qué"
          explica="El valor del equipo es lo que valen sus futbolistas, y ese sí lo da Fantasy de todos. Sumado al dinero da lo que tiene cada uno: alguien puede ir corto de dinero solo porque lo tiene todo metido en la plantilla."
        >
          <Tabla
            filas={ordenados}
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
        </Tarjeta>
      )}

      <Columnas>
        <Tarjeta
          titulo="Calibrar con tu dinero real"
          explica="Fantasy no deja leer el dinero de otro manager. Mira el tuyo en la aplicación oficial y escríbelo aquí: con eso se deduce el presupuesto con el que empezó todo el mundo."
        >
          <form onSubmit={calibrar}>
            <Campo etiqueta="Tu manager">
              <select value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="">Elige…</option>
                {(datos || []).map((d) => (
                  <option key={d.managerId} value={d.managerId}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Tu dinero ahora mismo, en euros" pista="Sin puntos ni comas. 147,3 millones se escribe 147300000.">
              <input value={real} onChange={(e) => setReal(e.target.value)} placeholder="147300000" inputMode="numeric" />
            </Campo>
            <button className="accion" type="submit" disabled={!manager || !real}>
              Calibrar
            </button>
          </form>
          {resultado ? (
            <p className={resultado.tipo === 'error' ? 'aviso error' : 'nota'} style={{ marginBottom: 0, marginTop: 12 }}>
              {resultado.texto}
            </p>
          ) : null}
        </Tarjeta>

        <Tarjeta titulo="De dónde sale la cifra">
          <p className="nota" style={{ marginTop: 0 }}>
            Fantasy solo deja leer el dinero de la cuenta propia. Al pedir el de un rival responde que no.
          </p>
          <p className="nota">
            Así que se calcula: presupuesto inicial, menos las compras, más las ventas y los premios de jornada. Los
            movimientos están todos, desde el arranque de la liga.
          </p>
          <p className="nota" style={{ marginBottom: 0 }}>
            El presupuesto inicial es lo único que falta, y es el mismo para todos. Por eso las diferencias entre
            managers ya son exactas aunque no esté calibrado.
          </p>
        </Tarjeta>
      </Columnas>
    </>
  );
}

const FILTROS_MERCADO = [
  { id: 'todo', titulo: 'Todo' },
  { id: 'manager', titulo: 'De managers' },
  { id: 'libre', titulo: 'Libres' },
];

export function Mercado() {
  const { datos, error, cargando } = useDatos(() => api.mercado());
  const [filtro, setFiltro] = usarPestana('mercado', 'todo');

  const filas = (datos || []).filter((f) => filtro === 'todo' || (f.origen || 'libre') === filtro);

  return (
    <>
      <Cabecera titulo="Mercado">
        El mercado mezcla dos cosas. Los libres los ofrece el juego y no son de nadie. Los de manager los ha puesto a
        la venta alguien de vuestra liga.
      </Cabecera>
      <Aviso>{error}</Aviso>

      <SubPestanas pestanas={FILTROS_MERCADO} activa={filtro} alCambiar={setFiltro} />

      {cargando ? (
        <Cargando que="el mercado" />
      ) : (
        <Tarjeta explica="Fantasy no deja ver el importe de las pujas ajenas, solo cuántas hay.">
          <Tabla
            filas={filas}
            vacio="No hay nada aquí ahora mismo."
            columnas={[
              { titulo: 'Futbolista', valor: (f) => f.futbolista_nombre || `sin nombre (${f.futbolista_id})` },
              {
                titulo: 'Lo vende',
                valor: (f) =>
                  f.origen === 'manager' ? (
                    f.vendedor_nombre || 'un manager'
                  ) : (
                    <span className="suave">nadie, es libre</span>
                  ),
              },
              { titulo: 'Precio', valor: (f) => millones(f.precio), numerica: true },
              { titulo: 'Cláusula', valor: (f) => (f.clausula == null ? '—' : millones(f.clausula)), numerica: true },
              { titulo: 'Pujas', valor: (f) => f.pujas ?? 0, numerica: true },
              { titulo: 'Expira', valor: (f) => fechaCorta(f.expira) },
            ]}
          />
        </Tarjeta>
      )}
    </>
  );
}

export function Movimientos() {
  const { datos, error, cargando } = useDatos(() => api.movimientos());
  return (
    <>
      <Cabecera titulo="Movimientos">Fichajes, ventas y premios de la liga, desde que arrancó.</Cabecera>
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
              { titulo: 'Qué', valor: (f) => <span className="etiqueta">{f.tipo_nombre}</span> },
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
  const { datos: ficha } = useDatos(() => (elegido ? api.valorDe(elegido.id) : Promise.resolve(null)), [elegido?.id]);

  const puntos = (ficha?.serie || []).map((f) => ({ fecha: f.fecha, valor: f.valor }));

  return (
    <>
      <Cabecera titulo="Precios">Evolución del valor de mercado de un futbolista.</Cabecera>

      <Columnas>
        <Tarjeta titulo="Buscar futbolista">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusqueda(texto.trim());
            }}
          >
            <Campo etiqueta="Nombre" pista="Con dos letras basta.">
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Bartra" />
            </Campo>
            <button className="accion" type="submit" disabled={texto.trim().length < 2}>
              Buscar
            </button>
          </form>

          {buscando ? <Cargando que="la búsqueda" /> : null}

          {resultados && resultados.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <Tabla
                filas={resultados}
                columnas={[
                  { titulo: 'Futbolista', valor: (f) => f.nombre },
                  { titulo: 'Lo tiene', valor: (f) => f.propietario || <span className="suave">nadie</span> },
                  { titulo: 'Valor', valor: (f) => millones(f.valor), numerica: true },
                  {
                    titulo: '',
                    valor: (f) => (
                      <button
                        type="button"
                        className={`accion suave ${elegido?.id === f.id ? 'elegido' : ''}`}
                        onClick={() => setElegido(f)}
                      >
                        Ver
                      </button>
                    ),
                  },
                ]}
              />
            </div>
          ) : null}

          {busqueda.length >= 2 && resultados && resultados.length === 0 && !buscando ? (
            <p className="suave">Ningún futbolista se llama así.</p>
          ) : null}
        </Tarjeta>

        {elegido ? (
          <Tarjeta titulo={`Valor de ${elegido.nombre}`}>
            {ficha && ficha.diasGuardados < 2 ? (
              <Aviso tipo="ojo">
                Todavía no hay evolución que dibujar. El bot guarda una cifra al día y solo lleva{' '}
                {ficha.diasGuardados === 1 ? 'un día' : `${ficha.diasGuardados} días`} funcionando. Mañana ya habrá una
                línea. Fantasy no da el histórico anterior, así que la serie empieza el día que arrancó el bot.
              </Aviso>
            ) : (
              <GraficoLinea puntos={puntos} titulo={`Valor de mercado de ${elegido.nombre}`} formatear={millones} />
            )}
            <p className="nota" style={{ marginBottom: 0 }}>
              Valor de hoy: {millones(elegido.valor)}.{' '}
              {elegido.propietario ? `Lo tiene ${elegido.propietario}.` : 'No lo tiene nadie.'}
            </p>
          </Tarjeta>
        ) : (
          <Tarjeta titulo="Sin futbolista elegido">
            <p className="nota" style={{ margin: 0 }}>
              Busca uno por su nombre y pulsa «Ver». Aquí saldrá cómo ha cambiado su precio desde que arrancó el bot.
            </p>
          </Tarjeta>
        )}
      </Columnas>
    </>
  );
}
