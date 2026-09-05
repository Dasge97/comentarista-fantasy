# Primera prueba: leer la liga con una cuenta dedicada

## Objetivo y estado

**Este es el primer asunto que el siguiente agente debe comentar con el usuario.** La pregunta práctica es si podemos aprovechar LaLigaApp para obtener los datos de la liga desde una sesión dedicada.

Estado al redactar: código de terceros revisado; ninguna cuenta creada o conectada por el agente, ninguna consulta autenticada realizada, ningún punto observado en directo. Se desconoce si el usuario ya ha preparado la cuenta por su parte.

## Conversación inicial sugerida

«Vamos a comprobar primero la integración existente con una cuenta dedicada de vuestra liga. Revisaremos participantes, plantillas, alineaciones por jornada y puntos. ¿Tienes ya creada e incorporada esa cuenta y desde qué ordenador hacemos la prueba?»

Adaptar esta apertura al contexto que dé el usuario. No empezar preguntando por todas las reglas de la liga ni por el framework.

## Preparación de la cuenta

1. Crear una cuenta nueva en la aplicación oficial de Fantasy con una identidad destinada al servicio.
2. Incorporarla a la liga mediante el mecanismo de invitación disponible.
3. Preparar el equipo según lo acordado: 11 suplentes de poco interés y venta del resto. Son operaciones manuales del usuario; no son necesarias para probar una lectura aislada ni están autorizadas como automatización.
4. Identificar el equipo de servicio para excluirlo de futuras comparaciones, premios y resúmenes del bot.

Es una cuenta participante normal. No hemos confirmado un modo espectador y no hace falta encontrarlo para este ensayo. La solución aceptada puede afectar temporalmente a jugadores del mercado al entrar y vender; el usuario acepta ese compromiso para su liga.

## Preparación de LaLigaApp

Repositorio: [Externoak/LaLigaApp](https://github.com/Externoak/LaLigaApp).

La vía manual comentada es su aplicación de escritorio para Windows:

1. Abrir [Releases](https://github.com/Externoak/LaLigaApp/releases/latest).
2. Descargar el ZIP publicado, descomprimir y abrir el ejecutable.
3. Iniciar sesión con la cuenta dedicada y seleccionar la liga.

En la investigación se encontró `v3.5.3-20`, con el archivo `LaLigaApp.zip`, construido desde `f16ba1b4a1fc30825bd9105a9c5abc0ec2dbd902`. La rama revisada tenía otro commit posterior. Registrar la versión que se ejecute: el binario publicado y el código más reciente pueden diferir.

El README documenta correo/contraseña y Google; la versión de escritorio puede abrir el inicio de sesión de LaLiga y capturar el retorno OAuth. El agente no debe prometer que la sesión se abrirá sin incidencias antes de probarla.

Si el usuario usa otro sistema o se necesita el código actual, revisar el README y los scripts del repositorio para ejecutar la aplicación desde código o Docker. No asumir que el `.exe` funciona en macOS. No elegir el stack de nuestro bot por el hecho de usar esta herramienta para validar.

## Prueba manual de lectura

Comparar con la aplicación oficial, usando la misma liga y jornada. Registrar valores y hora. Evitar capturas que muestren secretos de sesión.

| ID | Acción | Evidencia esperada | Criterio de éxito |
| --- | --- | --- | --- |
| P01 | Iniciar sesión y seleccionar liga | Liga y cuenta correctas | La cuenta dedicada accede a la liga |
| P02 | Consultar clasificación | Managers y puntos visibles | Los participantes coinciden con Fantasy |
| P03 | Abrir la plantilla de un rival | Lista de futbolistas | Coincide con el equipo de ese rival |
| P04 | Repetir con otro rival | Segunda plantilla | No depende de acceder como el propietario |
| P05 | Elegir una jornada disputada y un rival | XI histórico | Coincide con el XI que puntuó esa jornada |
| P06 | Consultar puntos individuales | Jugador, jornada y puntuación | Coinciden con Fantasy; dato ausente no equivale a cero |
| P07 | Consultar jornada en curso | XI de esa jornada | Se distingue de la alineación editable para la siguiente |
| P08 | Consultar mercado y actividad | Ofertas visibles/actividad compartida | Se obtiene el contexto visible para un miembro de la liga |
| P09 | Comparar clasificación semanal y general | Ambas puntuaciones identificadas | Se entiende qué representa cada campo |

P01–P06 son la primera comprobación central. P07–P09 completan el mapa de lectura. Si no hay una jornada o datos disponibles, registrar «pendiente/no disponible», sin declararlo fallo ni éxito.

Ver el mercado compartido no implica ver las pujas privadas o el saldo privado de otros managers. No se requieren esos datos para el objetivo inicial.

## Interpretación de resultados

- **Lectura validada:** los datos centrales coinciden y se ven rivales desde una sola sesión.
- **Lectura parcial:** funcionan plantillas pero falta, por ejemplo, el XI histórico o el significado de los puntos. Investigar esa consulta concreta.
- **Problema de acceso:** registrar error, versión y paso exacto; comprobar autenticación, ruta y compatibilidad antes de descartar el enfoque.
- **Fallo en la interfaz:** no demuestra que la API sea incapaz. Si se acuerda la comprobación técnica, inspeccionar la respuesta y su adaptación.

No pedir una cuenta de cada amigo como solución automática a un fallo de interfaz o de una ruta.

## Prueba durante un partido

Después de confirmar la lectura, elegir un partido con un jugador alineado por un manager real. Registrar la jornada, equipo Fantasy y jugador. Consultar y actualizar la pantalla varias veces mientras juega y comparar los puntos con la aplicación oficial.

| Hora UTC de observación | Jugador | Jornada | Puntos en LaLigaApp | Puntos en Fantasy oficial | Notas |
| --- | --- | --- | --- | --- | --- |
| Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Sin observación realizada |

Esto comprueba que el dato cambia. Para medir latencia deportiva necesitamos una referencia de tiempo del acontecimiento; ver un gol en TV puede incluir el retraso de emisión. La hora de nuestra consulta tampoco es necesariamente la hora a la que Fantasy actualizó el dato.

Si no hay partidos durante la sesión de trabajo, dejar preparada la prueba y marcarla pendiente. No detener otras comprobaciones de lectura por ese motivo ni crear un recordatorio sin que se solicite.

## Siguiente ensayo técnico, una vez comentado con el usuario

Un lector mínimo, aún separado del producto, podría validar:

- Respuestas JSON y campos de IDs, XI, jornada y puntos.
- Lectura de todos los managers esperados desde la cuenta dedicada.
- Renovación de sesión y comportamiento tras caducidad.
- Consultas periódicas durante un partido, con frecuencia ajustada al proveedor.
- Diferencias observadas, correcciones, datos incompletos y límites HTTP.
- Comparación entre acumulados y puntos semanales sin sumar la jornada dos veces.

No se ha fijado el lenguaje de ese ensayo ni se ha encargado aquí su implementación. Debe ser una prueba de lectura y no ejecutar operaciones deportivas o de mercado. Su resultado se registra con la [plantilla](plantilla-resultados-prueba.md).
