import { useMemo, useState } from 'react';

/**
 * Gráfico de línea de una sola serie.
 *
 * Una sola serie no lleva leyenda: el título ya dice qué se está mirando.
 * El último valor va etiquetado directamente, en vez de poner un número
 * sobre cada punto.
 *
 * Debajo del gráfico hay una tabla con los mismos datos, para quien no
 * distinga bien los colores o quiera la cifra exacta.
 */
export default function GraficoLinea({ puntos, titulo, formatear = (v) => v, alto = 260 }) {
  const [encima, setEncima] = useState(null);
  const [verTabla, setVerTabla] = useState(false);

  const margen = { arriba: 16, derecha: 64, abajo: 28, izquierda: 56 };
  const ancho = 720;

  const geometria = useMemo(() => {
    const validos = puntos.filter((p) => p.valor != null);
    if (validos.length < 2) return null;

    const valores = validos.map((p) => p.valor);
    let minimo = Math.min(...valores);
    let maximo = Math.max(...valores);
    if (minimo === maximo) {
      minimo -= 1;
      maximo += 1;
    }
    // Un poco de aire arriba y abajo para que la línea no toque el borde.
    const aire = (maximo - minimo) * 0.1;
    minimo -= aire;
    maximo += aire;

    const anchoUtil = ancho - margen.izquierda - margen.derecha;
    const altoUtil = alto - margen.arriba - margen.abajo;
    const x = (i) => margen.izquierda + (i / (validos.length - 1)) * anchoUtil;
    const y = (v) => margen.arriba + altoUtil - ((v - minimo) / (maximo - minimo)) * altoUtil;

    return {
      validos,
      x,
      y,
      minimo,
      maximo,
      camino: validos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' '),
      referencias: [minimo, (minimo + maximo) / 2, maximo],
    };
  }, [puntos, alto]);

  if (!geometria) {
    return <p className="suave">Todavía no hay suficientes datos para dibujar la evolución. Hace falta más de un día.</p>;
  }

  const { validos, x, y, camino, referencias } = geometria;
  const ultimo = validos[validos.length - 1];

  function alMover(evento) {
    const caja = evento.currentTarget.getBoundingClientRect();
    const posicion = ((evento.clientX - caja.left) / caja.width) * ancho;
    const anchoUtil = ancho - margen.izquierda - margen.derecha;
    const indice = Math.round(((posicion - margen.izquierda) / anchoUtil) * (validos.length - 1));
    setEncima(indice >= 0 && indice < validos.length ? indice : null);
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={titulo}
        onMouseMove={alMover}
        onMouseLeave={() => setEncima(null)}
      >
        {/* Rejilla discreta: está para orientar, no para llamar la atención. */}
        {referencias.map((valor) => (
          <g key={valor}>
            <line
              x1={margen.izquierda}
              x2={ancho - margen.derecha}
              y1={y(valor)}
              y2={y(valor)}
              stroke="var(--borde)"
              strokeWidth="1"
            />
            <text x={margen.izquierda - 8} y={y(valor) + 4} textAnchor="end" fontSize="11" fill="var(--texto-suave)">
              {formatear(valor)}
            </text>
          </g>
        ))}

        <path d={camino} fill="none" stroke="var(--acento)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Etiqueta del último valor, en lugar de un número sobre cada punto. */}
        <circle cx={x(validos.length - 1)} cy={y(ultimo.valor)} r="4" fill="var(--acento)" />
        <text
          x={x(validos.length - 1) + 10}
          y={y(ultimo.valor) + 4}
          fontSize="12"
          fill="var(--texto)"
          fontWeight="600"
        >
          {formatear(ultimo.valor)}
        </text>

        {encima != null ? (
          <g>
            <line
              x1={x(encima)}
              x2={x(encima)}
              y1={margen.arriba}
              y2={alto - margen.abajo}
              stroke="var(--texto-suave)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={x(encima)} cy={y(validos[encima].valor)} r="5" fill="var(--acento)" stroke="var(--tarjeta)" strokeWidth="2" />
          </g>
        ) : null}

        <text x={margen.izquierda} y={alto - 6} fontSize="11" fill="var(--texto-suave)">
          {validos[0].fecha}
        </text>
        <text x={ancho - margen.derecha} y={alto - 6} fontSize="11" fill="var(--texto-suave)" textAnchor="end">
          {ultimo.fecha}
        </text>
      </svg>

      <p className="suave" style={{ fontSize: 13, minHeight: 20, margin: '4px 0 0' }}>
        {encima != null
          ? `${validos[encima].fecha}: ${formatear(validos[encima].valor)}`
          : 'Pasa el ratón por encima para ver cada día.'}
      </p>

      <button className="accion suave" style={{ marginTop: 8 }} onClick={() => setVerTabla((v) => !v)}>
        {verTabla ? 'Ocultar la tabla' : 'Ver los datos en tabla'}
      </button>

      {verTabla ? (
        <div className="tabla-marco" style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {[...validos].reverse().map((p) => (
                <tr key={p.fecha}>
                  <td>{p.fecha}</td>
                  <td className="num">{formatear(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
