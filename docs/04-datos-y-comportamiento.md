# Datos y comportamiento esperado

Este documento recoge conceptos que conviene preservar cuando se decida la implementación. No selecciona framework, lenguaje, base de datos, colas, hosting ni separación en servicios.

## Datos mínimos deseados

| Concepto | Información útil | Matiz importante |
| --- | --- | --- |
| Liga | ID, nombre, competición y temporada | No mezclar temporadas ni modalidades |
| Manager/equipo | IDs de cuenta y de equipo, nombre visible | Identificar la cuenta de servicio y excluirla de la narración |
| Usuario Telegram | ID estable, preferencias, vinculación | El alias visible puede cambiar |
| Plantilla | Futbolistas y propietario observados | La propiedad actual no prueba quién puntuó con él en una jornada anterior |
| Alineación de jornada | Equipo, jornada, XI y reglas aplicables | Diferenciarla de la alineación que se está editando |
| Puntuación | Jugador, jornada, puntos y hora de observación | Cero, ausencia y error son estados diferentes |
| Clasificación | Alcance semanal/general, posición y puntos | Los acumulados pueden incorporar ya la jornada actual |
| Partido | ID, equipos, estado, jornada y calendario | Puede aplazarse o reanudarse |
| Evento deportivo | Tipo, jugador, minuto, ID y revisiones | Puede corregirse, desaparecer o llegar tarde |

Capitán, banquillo automático, entrenador, penalizaciones y otras reglas solo se incorporarán según las reglas reales de la liga y los datos disponibles. No asumir que sumar once puntuaciones reproduce cualquier modalidad.

## Integración aislada

El usuario propuso conceptualmente un `FantasyProvider` con operaciones como `getLeagues`, `getManagers`, `getSquad`, `getLineup`, `getPlayerScores` y `getStandings`.

Es una orientación para aislar la fragilidad de los endpoints. La interfaz final se discutirá tras la prueba. Conviene que cualquier respuesta pueda expresar origen, jornada/temporada, hora de observación, disponibilidad y si la lectura está completa.

El resto del sistema debería depender de datos normalizados, no de los nombres internos de campos ni de las rutas de LaLigaApp. No es una exigencia de desarrollar ahora conectores para otras plataformas.

## Cruce con datos deportivos

La relación esencial es: acontecimiento del futbolista → identificación del futbolista en Fantasy → managers cuyo XI válido lo incluye → efectos y destinatarios.

Mantener una correspondencia entre IDs de cada proveedor, usando nombre, equipo y otros datos para resolver dudas. Evitar unir automáticamente solo por un apellido. Si no hay correspondencia fiable, registrar el evento sin notificar un propietario inventado.

Los sucesos pueden afectar también a porteros o defensas del rival. El evento permite describir la situación deportiva; el descuento exacto de puntos debe confirmarse con Fantasy o con una regla validada expresamente.

## Dos relojes

Un gol y su puntuación Fantasy no tienen por qué llegar a la vez. La ayuda de Fantasy describe actualizaciones a los pocos minutos. Se puede enviar el gol al detectarlo y confirmar puntos después.

Ejemplo conceptual de polling:

| Hora de observación | Puntos |
| --- | --- |
| 20:41 | 7 |
| 20:42 | 7 |
| 20:43 | 11 |

Se detecta un cambio observado de +4. No se conoce por esa diferencia la causa exacta ni el momento exacto de actualización. No reconstruir goles a partir de incrementos de puntos.

La frecuencia de lectura debe adaptarse a partidos en juego, cambios observados, límites del proveedor y disponibilidad. Leer ligas y plantillas con menor frecuencia que puntuaciones puede ahorrar consultas. No se ha decidido un intervalo de producción.

## Detección y publicación

1. Obtener y validar una nueva observación.
2. Normalizarla conservando IDs, alcance y momento.
3. Compararla con el último estado válido del mismo alcance.
4. Generar diferencias y acontecimientos relevantes.
5. Seleccionar destinatarios y aplicar preferencias, agrupación y límites de mensajes.
6. Registrar qué se envió para no repetirlo en la siguiente consulta o tras reiniciar.

Este orden describe comportamiento, no una elección de arquitectura. La primera observación establece una referencia; no debe anunciar todos los puntos históricos como si acabaran de ganarse.

## Casos que requieren tratamiento explícito

| Caso | Comportamiento deseado |
| --- | --- |
| Gol anulado o autor corregido | Corregir la narración, evitando dos goles definitivos incompatibles |
| Puntos revisados a la baja | Aceptar diferencias negativas y volver a calcular el estado provisional |
| Dos managers empatados | Describir empate en puntos; respetar el desempate oficial para posiciones |
| Lectura incompleta de un manager | No convertirlo en cero ni anunciar adelantamientos basados en la ausencia |
| Actualización desigual entre equipos | Esperar una comparación suficientemente coherente antes de narrar un cambio |
| API caída o sesión caducada | Conservar último estado válido; indicar antigüedad y suspender afirmaciones que dependan de datos nuevos |
| Reinicio o recuperación | Evitar repetir toda la jornada; reconciliar y resumir solo si aporta valor |
| Partido aplazado/reanudado | Mantener asociación a su jornada Fantasy según la fuente |
| Venta tras comenzar jornada | Usar XI histórico y reglas de puntuación; no atribuir por propiedad actual únicamente |
| Usuario bloquea al bot | Detener intentos repetidos de privado y conservar control de suscripción |
| Cuenta de servicio en ranking | Excluirla de posiciones narradas del grupo y aclarar si difieren del ranking oficial |

## Resúmenes y clasificación

Separar claramente:

- Puntos de la jornada actual.
- Clasificación general.
- Puntos mostrados por Fantasy.
- Cálculos propios provisionales, si se acuerda usarlos.

Si la clasificación general ya contiene la jornada, no sumarla otra vez. Una bonificación, capitán o sustitución puede exigir un cómputo diferente. El final del encuentro no confirma que la puntuación Fantasy sea definitiva.

## Sesión y datos personales

Solo se necesita custodiar la sesión de la cuenta dedicada para el caso acordado. El usuario se autentica por una vía segura disponible. Mantener secretos fuera de Git, documentación, capturas y registros públicos; un token de una cuenta dedicada sigue siendo un secreto.

La vinculación Telegram/manager es personalización, no un acceso a su cuenta de Fantasy. El grupo debe poder corregirla y eliminarla. No publicar información que no sea visible para los participantes de la liga. La cuenta de servicio debe actuar como lectora una vez preparada.

## Qué no se ha elegido

Persistencia concreta, concurrencia, mecanismo de tareas, despliegue, observabilidad, proveedor de fútbol, IA generativa, interfaz administrativa, coste máximo y política final de avisos. Decidirlos a partir de la prueba y del tamaño real de la liga.
