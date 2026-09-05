import { useCallback, useEffect, useState } from 'react';

/** Carga datos de la API y expone el estado de la carga. */
export function useDatos(cargar, dependencias = []) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(() => {
    let cancelado = false;
    setCargando(true);
    cargar()
      .then((resultado) => {
        if (!cancelado) {
          setDatos(resultado);
          setError(null);
        }
      })
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  useEffect(() => recargar(), [recargar]);

  return { datos, error, cargando, recargar };
}

export function Aviso({ tipo = 'error', children }) {
  if (!children) return null;
  return <div className={`aviso ${tipo}`}>{children}</div>;
}

export function Cargando({ que = 'los datos' }) {
  return <p className="suave">Cargando {que}…</p>;
}

/**
 * Tabla sencilla. Las columnas se describen con un nombre visible y una
 * función que saca el valor de cada fila.
 */
export function Tabla({ columnas, filas, vacio = 'No hay nada todavía.' }) {
  if (!filas || filas.length === 0) return <p className="suave">{vacio}</p>;
  return (
    <div className="tabla-marco">
      <table>
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.titulo} className={c.numerica ? 'num' : undefined}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={fila.id ?? i}>
              {columnas.map((c) => (
                <td key={c.titulo} className={c.numerica ? 'num' : undefined}>
                  {c.valor(fila, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tarjeta({ titulo, children }) {
  return (
    <section className="tarjeta">
      {titulo ? <h2>{titulo}</h2> : null}
      {children}
    </section>
  );
}

export function Dato({ titulo, valor, detalle }) {
  return (
    <div className="tarjeta">
      <div className="dato">
        {valor}
        <small>{titulo}</small>
      </div>
      {detalle ? <p className="suave" style={{ margin: '8px 0 0', fontSize: 13 }}>{detalle}</p> : null}
    </div>
  );
}
