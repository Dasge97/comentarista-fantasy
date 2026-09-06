import { useState } from 'react';
import { api, fechaCorta, millones } from '../api.js';
import {
  Aviso,
  Cabecera,
  Campo,
  Cargando,
  Columnas,
  Tabla,
  Tarjeta,
  useDatos,
} from '../componentes/comunes.jsx';
import GraficoLinea from '../componentes/GraficoLinea.jsx';

const POSICIONES = [
  { id: '', nombre: 'Todas' },
  { id: '1', nombre: 'Porteros' },
  { id: '2', nombre: 'Defensas' },
  { id: '3', nombre: 'Centrocampistas' },
  { id: '4', nombre: 'Delanteros' },
  { id: '5', nombre: 'Entrenadores' },
];

const ESTADOS = [
  { id: '', nombre: 'Todos' },
  { id: 'ok', nombre: 'Disponibles' },
  { id: 'injured', nombre: 'Lesionados' },
  { id: 'doubtful', nombre: 'En duda' },
  { id: 'suspended', nombre: 'Sancionados' },
  { id: 'out_of_league', nombre: 'Fuera de la liga' },
];

const NOMBRE_ESTADO = {
  ok: 'disponible',
  injured: 'lesionado',
  doubtful: 'en duda',
  suspended: 'sancionado',
  out_of_league: 'fuera',
};

const ORDENES = [
  { id: 'valor', nombre: 'Valor de mercado' },
  { id: 'puntos', nombre: 'Puntos de la temporada' },
  { id: 'media', nombre: 'Media por jornada' },
  { id: 'cambio', nombre: 'Lo que ha subido en euros' },
  { id: 'cambio_porcentaje', nombre: 'Lo que ha subido en porcentaje' },
  { id: 'nombre', nombre: 'Nombre' },
];

const PERIODOS = [
  { id: '1', nombre: 'Ayer' },
  { id: '7', nombre: 'Última semana' },
  { id: '30', nombre: 'Último mes' },
  { id: '365', nombre: 'Toda la temporada' },
];

const POR_PAGINA = 50;

export function Futbolistas() {
  const [filtros, setFiltros] = useState({
    nombre: '',
    posicion: '',
    equipo: '',
    estado: '',
    propietario: '',
    orden: 'valor',
    sentido: 'desc',
    dias: '7',
  });
  const [salto, setSalto] = useState(0);
  const [abierto, setAbierto] = useState(null);

  const { datos: equipos } = useDatos(() => api.equipos());
  const { datos: managers } = useDatos(() => api.managers());
  const { datos, error, cargando } = useDatos(
    () => api.futbolistas({ ...filtros, limite: POR_PAGINA, salto }),
    [JSON.stringify(filtros), salto],
  );

  function cambiar(clave, valor) {
    setFiltros((f) => ({ ...f, [clave]: valor }));
    setSalto(0);
  }

  const filas = datos?.filas || [];
  const total = datos?.total || 0;

  return (
    <>
      <Cabecera titulo="Futbolistas">
        Los {total > 0 ? total : ''} futbolistas de la competición, con su precio y quién de la liga los tiene.
      </Cabecera>
      <Aviso>{error}</Aviso>

      <Tarjeta titulo="Filtros">
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <Campo etiqueta="Nombre">
            <input value={filtros.nombre} onChange={(e) => cambiar('nombre', e.target.value)} placeholder="Buscar…" />
          </Campo>
          <Campo etiqueta="Posición">
            <select value={filtros.posicion} onChange={(e) => cambiar('posicion', e.target.value)}>
              {POSICIONES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Equipo">
            <select value={filtros.equipo} onChange={(e) => cambiar('equipo', e.target.value)}>
              <option value="">Todos</option>
              {(equipos || []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Estado">
            <select value={filtros.estado} onChange={(e) => cambiar('estado', e.target.value)}>
              {ESTADOS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Quién lo tiene">
            <select value={filtros.propietario} onChange={(e) => cambiar('propietario', e.target.value)}>
              <option value="">Cualquiera</option>
              <option value="libre">Nadie de la liga</option>
              <option value="ocupado">Alguien de la liga</option>
              {(managers || []).map((m) => (
                <option key={m.equipo_id} value={m.equipo_id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Ordenar por">
            <select value={filtros.orden} onChange={(e) => cambiar('orden', e.target.value)}>
              {ORDENES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="De mayor a menor">
            <select value={filtros.sentido} onChange={(e) => cambiar('sentido', e.target.value)}>
              <option value="desc">Sí</option>
              <option value="asc">No, al revés</option>
            </select>
          </Campo>
          <Campo etiqueta="La subida se mide contra">
            <select value={filtros.dias} onChange={(e) => cambiar('dias', e.target.value)}>
              {PERIODOS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </Tarjeta>

      {cargando ? (
        <Cargando que="los futbolistas" />
      ) : (
        <Tarjeta titulo={`${total} futbolistas`}>
          <Tabla
            filas={filas}
            vacio="Ningún futbolista cumple esos filtros."
            columnas={[
              { titulo: 'Futbolista', valor: (f) => f.nombre },
              { titulo: 'Equipo', valor: (f) => f.equipo_nombre || <span className="suave">—</span> },
              {
                titulo: 'Estado',
                valor: (f) =>
                  f.estado === 'ok' ? (
                    <span className="suave">disponible</span>
                  ) : (
                    <span className={`etiqueta ${f.estado === 'injured' || f.estado === 'suspended' ? 'mal' : 'ojo'}`}>
                      {NOMBRE_ESTADO[f.estado] || f.estado}
                    </span>
                  ),
              },
              { titulo: 'Lo tiene', valor: (f) => f.propietario || <span className="suave">nadie</span> },
              { titulo: 'Valor', valor: (f) => millones(f.valor), numerica: true },
              {
                titulo: 'Cambio',
                numerica: true,
                valor: (f) =>
                  f.cambio == null ? (
                    <span className="suave">—</span>
                  ) : (
                    <span className={f.cambio > 0 ? 'sube' : f.cambio < 0 ? 'baja' : 'suave'}>
                      {f.cambio > 0 ? '+' : ''}
                      {millones(f.cambio)}
                    </span>
                  ),
              },
              {
                titulo: '%',
                numerica: true,
                valor: (f) =>
                  f.cambio_porcentaje == null ? (
                    <span className="suave">—</span>
                  ) : (
                    <span className={f.cambio_porcentaje > 0 ? 'sube' : f.cambio_porcentaje < 0 ? 'baja' : 'suave'}>
                      {f.cambio_porcentaje > 0 ? '+' : ''}
                      {f.cambio_porcentaje}%
                    </span>
                  ),
              },
              { titulo: 'Puntos', valor: (f) => f.puntos_temporada ?? '—', numerica: true },
              { titulo: 'Media', valor: (f) => (f.media == null ? '—' : f.media.toFixed(1)), numerica: true },
              {
                titulo: '',
                valor: (f) => (
                  <button type="button" className="accion suave" onClick={() => setAbierto(f)}>
                    Ver
                  </button>
                ),
              },
            ]}
          />

          <div className="botonera" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="accion suave"
              disabled={salto === 0}
              onClick={() => setSalto(Math.max(0, salto - POR_PAGINA))}
            >
              Anteriores
            </button>
            <button
              type="button"
              className="accion suave"
              disabled={salto + POR_PAGINA >= total}
              onClick={() => setSalto(salto + POR_PAGINA)}
            >
              Siguientes
            </button>
            <span className="nota">
              {total === 0 ? 0 : salto + 1}–{Math.min(salto + POR_PAGINA, total)} de {total}
            </span>
          </div>
        </Tarjeta>
      )}

      {abierto ? <Ficha id={abierto.id} nombre={abierto.nombre} alCerrar={() => setAbierto(null)} /> : null}
    </>
  );
}

/** Ficha completa de un futbolista: precio, jornadas y por quién ha pasado. */
function Ficha({ id, nombre, alCerrar }) {
  const { datos, cargando } = useDatos(() => api.futbolista(id), [id]);

  if (cargando) return <Cargando que={`la ficha de ${nombre}`} />;
  if (!datos) return null;

  const puntos = (datos.serie || []).map((f) => ({ fecha: f.fecha, valor: f.valor }));

  return (
    <>
      <div className="botonera" style={{ margin: '24px 0 12px' }}>
        <button type="button" className="accion suave" onClick={alCerrar}>
          Cerrar la ficha
        </button>
      </div>

      <Tarjeta titulo={`Valor de ${datos.futbolista.nombre}`}>
        {datos.diasGuardados < 2 ? (
          <Aviso tipo="ojo">
            Todavía no tengo su histórico de precios. Se trae en segundo plano, de tanda en tanda. Vuelve en un rato.
          </Aviso>
        ) : (
          <>
            <GraficoLinea
              puntos={puntos}
              titulo={`Valor de mercado de ${datos.futbolista.nombre}`}
              formatear={millones}
            />
            <p className="nota" style={{ marginBottom: 0 }}>
              {datos.diasGuardados} días guardados, desde el {datos.serie[0]?.fecha}.
            </p>
          </>
        )}
      </Tarjeta>

      <Columnas>
        <Tarjeta titulo="Jornada a jornada">
          <Tabla
            filas={datos.jornadas}
            vacio="Todavía no ha jugado ninguna jornada con alguien de la liga."
            columnas={[
              { titulo: 'Jornada', valor: (f) => f.jornada, numerica: true },
              { titulo: 'Puntos', valor: (f) => (f.puntos == null ? '—' : f.puntos), numerica: true },
              { titulo: 'Lo alineaba', valor: (f) => f.manager || <span className="suave">—</span> },
            ]}
          />
        </Tarjeta>

        <Tarjeta titulo="Por quién ha pasado">
          <Tabla
            filas={datos.propietarios}
            vacio="Nadie de la liga lo ha tenido."
            columnas={[
              { titulo: 'Manager', valor: (f) => f.nombre || <span className="suave">—</span> },
              { titulo: 'Desde', valor: (f) => fechaCorta(f.desde) },
              { titulo: 'Hasta', valor: (f) => (f.hasta ? fechaCorta(f.hasta) : <span className="etiqueta bien">ahora</span>) },
            ]}
          />
        </Tarjeta>
      </Columnas>

      <Tarjeta titulo="Compras y ventas">
        <Tabla
          filas={datos.movimientos}
          vacio="Nunca ha cambiado de manos en esta liga."
          columnas={[
            { titulo: 'Cuándo', valor: (f) => fechaCorta(f.fecha) },
            { titulo: 'Manager', valor: (f) => f.manager || '—' },
            { titulo: 'Importe', valor: (f) => (f.importe == null ? '—' : millones(f.importe)), numerica: true },
          ]}
        />
      </Tarjeta>
    </>
  );
}
