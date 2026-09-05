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

/** Título y explicación de una página. */
export function Cabecera({ titulo, children }) {
  return (
    <header className="cabecera-pagina">
      <h1>{titulo}</h1>
      {children ? <p>{children}</p> : null}
    </header>
  );
}

/**
 * Subpestañas dentro de una página.
 *
 * Evitan la página larga de bajar y bajar: cada grupo de ajustes queda en su
 * pestaña y se ve entero sin desplazarse.
 */
export function SubPestanas({ pestanas, activa, alCambiar }) {
  return (
    <nav className="subpestanas">
      {pestanas.map((p) => (
        <button key={p.id} aria-current={p.id === activa} onClick={() => alCambiar(p.id)} type="button">
          {p.titulo}
        </button>
      ))}
    </nav>
  );
}

/** Guarda la pestaña elegida, para no perderla al recargar la página. */
export function usarPestana(clave, porDefecto) {
  const [activa, setActiva] = useState(() => {
    try {
      return localStorage.getItem(`pestana:${clave}`) || porDefecto;
    } catch {
      return porDefecto;
    }
  });
  const cambiar = useCallback(
    (id) => {
      setActiva(id);
      try {
        localStorage.setItem(`pestana:${clave}`, id);
      } catch {
        // Sin almacenamiento local la pestaña simplemente no se recuerda.
      }
    },
    [clave],
  );
  return [activa, cambiar];
}

export function Aviso({ tipo = 'error', children }) {
  if (!children) return null;
  return <div className={`aviso ${tipo}`}>{children}</div>;
}

export function Cargando({ que = 'los datos' }) {
  return <p className="suave">Cargando {que}…</p>;
}

/** Coloca sus hijos en dos columnas cuando hay sitio. */
export function Columnas({ children }) {
  return <div className="columnas">{children}</div>;
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

export function Tarjeta({ titulo, explica, children }) {
  return (
    <section className="tarjeta">
      {titulo ? <h2>{titulo}</h2> : null}
      {explica ? <p className="explica">{explica}</p> : null}
      {children}
    </section>
  );
}

export function Dato({ titulo, valor, detalle, tono }) {
  return (
    <div className="tarjeta" style={{ marginBottom: 0 }}>
      <div className="dato">
        <small>{titulo}</small>
        <span style={tono ? { color: `var(--${tono})` } : undefined}>{valor}</span>
      </div>
      {detalle ? <p className="nota" style={{ margin: '6px 0 0' }}>{detalle}</p> : null}
    </div>
  );
}

/** Campo de formulario con su etiqueta y, si hace falta, una pista debajo. */
export function Campo({ etiqueta, pista, children }) {
  return (
    <label>
      <span>{etiqueta}</span>
      {pista ? <span className="pista">{pista}</span> : null}
      {children}
    </label>
  );
}

export function Casilla({ etiqueta, valor, alCambiar }) {
  return (
    <label className="casilla">
      <input type="checkbox" checked={valor} onChange={(e) => alCambiar(e.target.checked)} />
      <span>{etiqueta}</span>
    </label>
  );
}
