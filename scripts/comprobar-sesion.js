/**
 * Comprueba que la sesión se puede renovar sin usar la contraseña.
 *
 * Es la segunda mitad del criterio de la fase 1. Si la renovación funciona,
 * el bot puede estar meses funcionando sin intervención. Si no funciona,
 * vuelve a iniciar sesión con las credenciales, que también sirve pero
 * conviene saberlo.
 */
import { config } from '../src/config.js';
import { LectorFantasy } from '../src/fantasy/lector.js';

const lector = new LectorFantasy({
  email: config.fantasy.email,
  password: config.fantasy.password,
  ficheroSesion: config.ficheroSesion,
  competicionId: config.fantasy.competicionId,
});

console.log('1. Inicio de sesión con correo y contraseña');
await lector.sesion.iniciarSesion();
console.log('   ', JSON.stringify(lector.estadoSesion));

console.log('\n2. Renovación con el refresh token');
let renovacionFunciona = false;
try {
  const resultado = await lector.sesion.renovar();
  renovacionFunciona = true;
  console.log(`    correcta, con la política ${resultado.politica}`);
  console.log('   ', JSON.stringify(lector.estadoSesion));
} catch (error) {
  console.log('    ha fallado:', error.message);
}

console.log('\n3. Una lectura después de renovar');
const usuario = await lector.usuarioActual();
console.log(`    ${usuario.nombre} (manager ${usuario.managerId})`);

console.log('\n4. Recuperación tras invalidar la sesión');
lector.sesion.invalidar();
const usuarioTrasInvalidar = await lector.usuarioActual();
console.log(`    ${usuarioTrasInvalidar.nombre}, la sesión se ha recuperado sola`);

console.log('\nResultado');
console.log(
  renovacionFunciona
    ? 'La renovación sin contraseña funciona. El bot puede mantenerse solo.'
    : 'La renovación falla. El bot volverá a iniciar sesión con las credenciales guardadas.',
);
