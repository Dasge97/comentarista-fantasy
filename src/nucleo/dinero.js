/**
 * Cálculo del dinero de cada manager.
 *
 * La API devuelve el dinero de la cuenta propia, pero responde HTTP 403 al
 * pedir el de un rival. Así que el dinero de los demás no se lee: se calcula
 * a partir del registro de movimientos de la liga.
 *
 * Los tipos de movimiento se identificaron el 5 de septiembre de 2026
 * cruzando los movimientos recientes con la plantilla actual de cada manager:
 * si tras un movimiento el futbolista sigue en la plantilla, fue una compra;
 * si ya no está, fue una venta. Los tres tipos con dinero dieron un resultado
 * limpio, sin un solo caso contrario.
 */
export const TIPOS = {
  COMPRA_A_MANAGER: 1, // Lleva user2Id: el vendedor cobra
  CLAUSULA_PAGADA: 4, // Sin importe
  EVENTO_DE_LIGA: 5, // Sin manager ni importe
  PREMIO_SEMANAL: 6, // Lleva número de jornada e importe
  SIN_ALINEACION: 7, // Lleva jornada, sin importe
  ENTRA_EN_LA_LIGA: 9, // Sin importe
  COMPRA_AL_MERCADO: 31,
  VENTA: 33,
};

/** Cómo afecta cada tipo al dinero del manager que aparece como user1. */
const EFECTO = {
  [TIPOS.COMPRA_A_MANAGER]: -1,
  [TIPOS.COMPRA_AL_MERCADO]: -1,
  [TIPOS.VENTA]: +1,
  [TIPOS.PREMIO_SEMANAL]: +1,
};

export const NOMBRE_TIPO = {
  [TIPOS.COMPRA_A_MANAGER]: 'compra a otro manager',
  [TIPOS.CLAUSULA_PAGADA]: 'cláusula',
  [TIPOS.EVENTO_DE_LIGA]: 'evento de la liga',
  [TIPOS.PREMIO_SEMANAL]: 'premio de la jornada',
  [TIPOS.SIN_ALINEACION]: 'sin alineación',
  [TIPOS.ENTRA_EN_LA_LIGA]: 'entra en la liga',
  [TIPOS.COMPRA_AL_MERCADO]: 'compra al mercado',
  [TIPOS.VENTA]: 'venta',
};

/**
 * Calcula el dinero de cada manager a partir del presupuesto inicial y de
 * todos los movimientos registrados.
 *
 * Es una estimación mientras no se confirme el presupuesto inicial. La
 * forma de comprobarla es aplicar el mismo cálculo a la cuenta de servicio
 * y compararlo con el dinero que sí devuelve la API para la cuenta propia.
 *
 * @param {Array} movimientos Filas de la tabla actividad.
 * @param {number} presupuestoInicial Con cuánto empieza cada manager.
 * @param {Array<string>} managerIds Managers a calcular.
 */
export function calcularDinero(movimientos, presupuestoInicial, managerIds) {
  const saldo = new Map(managerIds.map((id) => [String(id), presupuestoInicial]));
  const detalle = new Map(managerIds.map((id) => [String(id), { gastado: 0, ingresado: 0, movimientos: 0 }]));

  const ordenados = [...movimientos].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  for (const m of ordenados) {
    const efecto = EFECTO[m.tipo];
    if (!efecto || m.importe == null) continue;

    const manager = String(m.manager_id ?? m.managerId ?? '');
    if (saldo.has(manager)) {
      saldo.set(manager, saldo.get(manager) + efecto * m.importe);
      const d = detalle.get(manager);
      d.movimientos += 1;
      if (efecto < 0) d.gastado += m.importe;
      else d.ingresado += m.importe;
    }

    // En una compra a otro manager, el vendedor cobra lo mismo.
    if (m.tipo === TIPOS.COMPRA_A_MANAGER) {
      const vendedor = String(m.manager2_id ?? m.manager2Id ?? '');
      if (saldo.has(vendedor)) {
        saldo.set(vendedor, saldo.get(vendedor) + m.importe);
        detalle.get(vendedor).ingresado += m.importe;
      }
    }
  }

  return managerIds.map((id) => ({
    managerId: String(id),
    dinero: saldo.get(String(id)),
    ...detalle.get(String(id)),
    // El presupuesto inicial no está confirmado, así que la cifra es
    // aproximada. La web debe decirlo.
    esEstimacion: true,
  }));
}

/**
 * Comprueba el cálculo contra el dinero real de la cuenta de servicio, que
 * es el único que la API deja leer. Devuelve la diferencia.
 */
export function comprobarContraCuentaPropia({ calculado, real }) {
  const diferencia = real - calculado;
  return {
    calculado,
    real,
    diferencia,
    // Un margen del uno por mil se considera coincidencia: los redondeos de
    // Fantasy no son visibles en el registro de movimientos.
    coincide: Math.abs(diferencia) <= Math.max(1000, Math.abs(real) * 0.001),
  };
}
