/**
 * Comprueba que el lector hace su trabajo contra la liga real.
 *
 * Es la prueba de aceptación de la fase 1: leer los datos de todos los
 * managers de la liga desde la sesión de la cuenta de servicio.
 *
 * Solo hace lecturas. No modifica nada en Fantasy.
 */
import { config } from '../src/config.js';
import { LectorFantasy } from '../src/fantasy/lector.js';

const lector = new LectorFantasy({
  email: config.fantasy.email,
  password: config.fantasy.password,
  ficheroSesion: config.ficheroSesion,
  competicionId: config.fantasy.competicionId,
});

function titulo(texto) {
  console.log(`\n=== ${texto} ===`);
}

titulo('Sesión y cuenta');
const usuario = await lector.usuarioActual();
console.log(`Cuenta: ${usuario.nombre} (manager ${usuario.managerId})`);
console.log(`Sesión: caduca en ${lector.estadoSesion.minutosRestantes} minutos`);

titulo('Ligas');
const ligas = await lector.ligas();
if (ligas.length === 0) {
  console.error('La cuenta no pertenece a ninguna liga. No se puede continuar.');
  process.exit(1);
}
for (const liga of ligas) {
  console.log(`${liga.nombre} (${liga.id}) · ${liga.managers} managers`);
  const activas = Object.entries(liga.reglas)
    .filter(([, valor]) => valor)
    .map(([nombre]) => nombre);
  console.log(`  reglas activas: ${activas.length ? activas.join(', ') : 'ninguna'}`);
}

const liga = ligas.find((l) => l.id === config.fantasy.ligaId) || ligas[0];

titulo('Jornada');
const jornada = await lector.jornadaActual();
console.log(`Jornada ${jornada.numero}${jornada.enDirecto ? ' (en directo)' : ''}`);

titulo('Clasificación general');
const clasificacion = await lector.clasificacion(liga.id);
for (const fila of clasificacion) {
  const servicio = fila.managerId === config.fantasy.managerServicio ? '  <- cuenta de servicio' : '';
  const enDirecto = fila.puntosJornada != null ? `, jornada ${fila.puntosJornada}` : ', jornada sin puntos';
  console.log(`${String(fila.posicion).padStart(2)} ${fila.managerNombre.padEnd(16)} ${fila.puntos} puntos${enDirecto}${servicio}`);
}

const rivales = clasificacion.filter((f) => f.managerId !== config.fantasy.managerServicio);
console.log(`\n${rivales.length} managers reales, sin contar la cuenta de servicio.`);

titulo(`Alineaciones de la jornada ${jornada.numero}`);
const lectura = await lector.alineacionesDeLaJornada(rivales.map((r) => r.equipoId), jornada.numero);

for (const rival of rivales) {
  const alineacion = lectura.alineaciones.get(rival.equipoId);
  if (!alineacion) {
    console.log(`${rival.managerNombre.padEnd(16)} sin alineación en esta jornada`);
    continue;
  }
  const sinDato = alineacion.jugadores.filter((j) => j.puntos === null).length;
  const aviso = alineacion.onceCompleto ? '' : `  <- once incompleto (${alineacion.jugadores.length})`;
  console.log(
    `${rival.managerNombre.padEnd(16)} ${String(alineacion.puntos).padStart(4)} puntos · ${alineacion.tactica} · ${sinDato} sin dato${aviso}`,
  );
}

titulo('Resultado');
if (!lectura.completa) {
  console.error('Lectura INCOMPLETA. Equipos que han fallado:');
  for (const fallo of lectura.fallos) console.error(`  ${fallo.equipoId}: ${fallo.motivo}`);
  process.exit(1);
}
console.log(`Lectura completa de ${rivales.length} managers. La fase 1 cumple su criterio.`);
