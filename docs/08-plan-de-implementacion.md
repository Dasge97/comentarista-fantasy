# Plan de implementación

Escrito el 5 de septiembre de 2026, después de validar la lectura de la liga «La liga Infartos» con la cuenta de servicio `ComentaristaBot`.

Este plan supone el alcance acordado en [06 · Fases y decisiones](06-fases-y-decisiones.md): hechos por privado a cada manager, resumen de partido por privado, y en el grupo solo el comentario cuando alguien cambia de puesto en la clasificación.

## Decisiones técnicas tomadas con el usuario

| Decisión | Elección | Motivo |
| --- | --- | --- |
| Lenguaje | Node.js | El lector que ya lee la liga está escrito en Node y funciona. LaLigaApp también es JavaScript, así que su código sirve de referencia directa. |
| Alojamiento | El servidor codehive del usuario | El bot debe estar encendido durante los partidos. El servidor ya existe, ya tiene Docker y Traefik, y el HTTPS con certificado está resuelto. Coste añadido cero. |
| Redacción del humor | Un modelo de lenguaje | Con 8 amigos y muchas jornadas, las frases escritas a mano se repiten. El modelo redacta; no decide hechos. |
| Almacenamiento | SQLite | Una liga, 9 managers y unas pocas miles de filas por temporada. Un fichero, sin servidor de base de datos que mantener. |
| Modelo concreto | `claude-opus-5` | Los mensajes son cortos y hay pocos por jornada. El coste estimado es de unos céntimos por jornada. |

El coste del modelo sale de unos 20 comentarios por jornada, con unas 500 palabras de contexto y 150 de respuesta cada uno. A 5 dólares por millón de palabras de entrada y 25 por millón de salida, la jornada cuesta alrededor de 0,15 dólares. La temporada entera queda por debajo de 6 dólares.

## Piezas del sistema

Es un único proceso de Node. No hacen falta servicios separados para una liga de 9 managers.

| Pieza | Responsabilidad |
| --- | --- |
| Lector de Fantasy | Inicia sesión, renueva el token y hace las peticiones GET. Es la única pieza que conoce las rutas de la API. |
| Almacén | Guarda en SQLite la última lectura válida, las vinculaciones de Telegram y los mensajes ya enviados. |
| Planificador | Decide cuándo hay que leer, a partir del calendario de partidos. |
| Detector | Compara la lectura nueva con la anterior y produce hechos. |
| Publicador | Decide qué se envía, a quién y cuándo. Aplica la regla de confirmación y evita repeticiones. |
| Bot de Telegram | Atiende la vinculación de cada amigo y envía los mensajes. |
| Redactor | Llama al modelo de lenguaje para escribir el comentario del grupo. |
| Panel de administración | Página web para configurar el bot, guardar las claves y consultar la base de datos. |

## Panel de administración

Es una página web servida por el mismo proceso de Node. Solo la usa el usuario, no los amigos.

### Qué contiene

| Sección | Contenido |
| --- | --- |
| Claves | Clave de la API de Anthropic, token del bot de Telegram, correo y contraseña de la cuenta de servicio de Fantasy. Se escriben aquí, no en ficheros a mano. |
| Configuración | Segundos entre lecturas, minutos de estabilización tras el final del partido, número de lecturas para confirmar un cambio de puesto, identificador del grupo de Telegram, tono del humor. |
| Estado | Si la sesión de Fantasy está viva y cuándo caduca, hora de la última lectura, si el sondeo está corriendo, próximo partido. |
| Base de datos | Consulta de las tablas: managers, vinculaciones, últimas lecturas y mensajes enviados. |
| Registro | Últimos mensajes enviados y últimos errores. |
| Acciones | Forzar una lectura, silenciar el bot, soltar la vinculación de un amigo. |

### Cómo se construye

Express sirviendo páginas HTML generadas en el servidor, sin compilación ni framework de interfaz. Para un panel que consulta tablas y guarda un formulario, una aplicación de una sola página añade trabajo sin aportar nada.

### Seguridad

El panel guarda las claves de la API de Anthropic, el token de Telegram y la contraseña de la cuenta de Fantasy. Es el punto más delicado de todo el sistema.

Las medidas son estas:

- Entrada con contraseña. Nunca abierto a quien conozca la dirección.
- Conexión cifrada por HTTPS. Lo resuelve Traefik en el servidor codehive con certificado de Let's Encrypt, así que no hay que montar nada.
- Las claves guardadas se muestran ocultas. El panel deja cambiarlas, no leerlas.

El subdominio es `fantasybot.code-hive.space`. Comprobado el 5 de septiembre de 2026: resuelve a 87.106.222.241, que es el servidor codehive.

## Qué se lee y cada cuánto

Cada ciclo de lectura hace 9 peticiones:

- Una por cada uno de los 8 managers reales, a la alineación de la jornada en curso. Esa respuesta trae el total del manager y, dentro de cada futbolista, sus estadísticas de la jornada. Con una sola petición por manager se obtiene todo lo que hace falta.
- Una a la clasificación general de la liga, para las posiciones.

El calendario se lee aparte, una vez cada cinco minutos, para saber qué partidos están en juego.

| Situación | Frecuencia |
| --- | --- |
| Ningún partido de la jornada empezado | Una lectura cada hora |
| Desde 5 minutos antes del primer partido del día | Una lectura por minuto |
| Mientras haya algún partido en juego | Una lectura por minuto |
| Después de terminar el último partido del día | Una lectura por minuto durante 15 minutos más |

Los 15 minutos los aporta el usuario por experiencia propia: pasado ese rato desde el final del partido, la puntuación ya está bien ajustada. El valor debe ser configurable, no estar escrito en el código.

Una ventana de dos horas de partidos son unas 1.080 peticiones. En las pruebas se hicieron unas 120 peticiones seguidas sin ningún rechazo del servidor.

## Datos que se guardan

| Tabla | Contenido |
| --- | --- |
| `managers` | ID de manager, ID de equipo y nombre. Se refresca desde la liga. La cuenta de servicio se marca para excluirla. |
| `vinculaciones` | ID de usuario de Telegram, ID de manager y fecha. Un manager solo puede estar vinculado a una persona. |
| `lecturas_jugador` | Jornada, futbolista, manager, puntos y estadísticas de la última lectura válida, con la hora. |
| `lecturas_manager` | Jornada, manager, puntos y posición de la última lectura válida, con la hora. |
| `candidatos_posicion` | Cambio de puesto detectado y cuántas lecturas seguidas lleva manteniéndose. |
| `mensajes_enviados` | Clave del hecho ya publicado y hora. Evita repetir tras un reinicio. |

La clave de un hecho debe identificar el acontecimiento, no el texto. Por ejemplo, «gol del futbolista 1234 en la jornada 4, ocurrencia número 2». Así un reinicio no vuelve a anunciar lo mismo.

## Cómo se detecta cada hecho

El detector compara la lectura nueva con la anterior, futbolista por futbolista.

| Hecho | Cómo se detecta |
| --- | --- |
| Gol | El contador `goals` sube |
| Asistencia | El contador `goal_assist` sube |
| Penalti parado | El contador `penalty_save` sube |
| Penalti provocado | El contador `penalty_won` sube |
| Penalti fallado | El contador `penalty_failed` sube |

Si uno de esos cinco contadores baja, es una corrección de Fantasy, no un hecho nuevo. No se anuncia como acontecimiento. Si el hecho ya se había publicado, conviene enviar una rectificación al manager afectado.

### Bajar de puntos no siempre es una corrección

Es un matiz que hay que respetar, observado el 5 de septiembre de 2026 durante un partido.

A las 20:36 UTC el marcador pasó de 1-1 a 2-1. En la lectura del minuto siguiente, tres managers perdieron puntos de golpe: el portero de uno cayó de 2 a 0, un defensa de otro cayó de 1 a -1, y otro defensa cayó de 1 a 0. Todos tenían futbolistas del equipo que acababa de encajar.

Es decir, la bajada era real y tenía una causa deportiva: el gol encajado. No era una corrección de Fantasy.

Consecuencias:

- Un futbolista puede tener puntos negativos. El sistema debe aceptar números por debajo de cero sin tratarlos como error.
- Una bajada del total de un manager es información válida para el grupo. Si alguien pierde un puesto porque su portero ha encajado, merece comentario igual que un adelantamiento por gol.
- Para saber la causa de una bajada hay que mirar el desglose de estadísticas, no solo el total. El campo que cambia es `goals_conceded`.

Un futbolista sin entrada de esa jornada no ha jugado. Es ausencia de dato, no cero.

## Reglas de publicación

### Privado

El hecho se envía al manager que tiene a ese futbolista en su once de la jornada. Se envía en cuanto se detecta, sin esperar confirmación. Un gol es un gol.

El resumen de final de partido se envía cuando el partido pasa a estado finalizado **y** ha pasado el tiempo de estabilización. Se envía solo a los managers que tenían futbolistas alineados en ese partido, con lo que hizo cada uno.

### Grupo

El grupo solo recibe el comentario de cambio de puesto.

Cuando la clasificación general cambia el orden de dos managers, no se publica de inmediato. El cambio pasa a `candidatos_posicion` y hay que verlo repetido en tres lecturas seguidas antes de comentarlo. El motivo es que la puntuación sube y baja durante el partido: en la prueba se vio a un manager pasar de 21 a 20 puntos y volver a subir. Sin la regla de confirmación, el grupo recibiría adelantamientos que se deshacen solos.

El número tres es una propuesta. Se ajustará con lo que diga el sondeo largo.

Cuando el cambio se confirma, el sistema reúne los hechos: qué managers han cambiado de puesto, con qué puntos, y qué futbolistas han sumado desde la última posición estable. Esos hechos se pasan al modelo, que redacta el comentario.

El modelo recibe los datos ya calculados y solo escribe. No decide quién ha marcado ni calcula puntos ni inventa el orden de la clasificación. Si el modelo falla o tarda, se publica una frase sencilla con los mismos datos.

`ComentaristaBot` no aparece en ninguna clasificación que narre el bot. Como la clasificación oficial de Fantasy sí lo incluye, las posiciones del bot pueden no coincidir con las de la aplicación oficial. Hay que decirlo en el mensaje de bienvenida.

## Vinculación de cada amigo

1. El grupo contiene un enlace que abre la conversación privada con el bot.
2. El bot muestra la lista de los 8 managers reales de la liga. La lista se lee de la API, no se escribe a mano.
3. El usuario elige el suyo.
4. Un comando permite cambiar la elección o soltarla.

Un manager ya elegido no aparece disponible para otro. Quien se equivocó lo suelta desde su propio chat.

## Fases de trabajo

| Fase | Trabajo | Cómo se sabe que está hecha |
| --- | --- | --- |
| 1 | Lector de Fantasy como módulo, con renovación de sesión | Lee los 8 managers y sobrevive a la caducidad del token |
| 2 | Almacén en SQLite y ciclo de sondeo según el calendario | El proceso se reinicia y no pierde el estado |
| 3 | Bot de Telegram con vinculación y rectificación | Los 8 amigos pueden elegir su manager y cambiarlo |
| 4 | Detección de hechos y envío por privado | Un gol llega al manager correcto, una sola vez |
| 5 | Resumen de final de partido por privado | Cada manager con futbolistas en el partido recibe su resumen |
| 6 | Comentario de grupo con el modelo de lenguaje | Un adelantamiento confirmado produce un comentario con el motivo correcto |
| 7 | Panel de administración | Las claves se guardan desde la web y se consultan las tablas |
| 8 | Prueba en una jornada real | El grupo lo usa y se ajusta el volumen de mensajes |

Las fases 1 y 2 son la base. La fase 3 se puede hacer en paralelo porque no depende de las anteriores. Las fases 4, 5 y 6 son las que producen mensajes.

El panel de administración va en la fase 7 porque necesita que existan las tablas y la configuración. Mientras tanto, las claves viven en el fichero de secretos generado en el servidor. Si prefieres tener el panel antes, se puede adelantar a la fase 3, pero entonces hay que rehacerlo cuando aparezcan tablas nuevas.

## Despliegue en el servidor codehive

El servidor tiene un flujo propio, descrito en `/home/codehive/WORKING_RULES.md`. Lo leí el 5 de septiembre de 2026. El resumen que nos afecta es este.

### Cómo funciona el servidor

Cada proyecto vive en dos sitios. El código se edita en el workspace fuente. El despliegue se levanta desde una copia distinta. Nunca se arranca Docker desde la carpeta fuente.

Traefik es quien publica hacia fuera. Cada proyecto tiene un fichero propio en la carpeta de rutas dinámicas de Traefik, que asocia un dominio con un puerto local. El certificado HTTPS lo pide Traefik solo, con Let's Encrypt. Por eso el HTTPS del panel de administración no requiere trabajo por nuestra parte.

Los contenedores solo publican en `127.0.0.1`, nunca en la dirección pública. Los secretos van en un fichero de Docker Compose generado en el servidor, que no se sube al repositorio.

### Rutas y valores para este proyecto

| Concepto | Valor |
| --- | --- |
| Nombre del workspace | `comentarista-fantasy` |
| Código fuente | `/home/codehive/codehive-data/workspaces/projects/comentarista-fantasy/repo` |
| Despliegue | `/home/codehive/codehive-app-state/deployments/comentarista-fantasy/workspace` |
| Fichero de Traefik | `/home/codehive/infrastructure/traefik/dynamic/deployment-comentarista-fantasy.yml` |
| Nombre del proyecto de Compose | `deployment_comentarista-fantasy` |
| Servicio público | `app` |
| Puerto dentro del contenedor | 3000 |
| Puerto en el servidor | 4139 |
| Dominio | `fantasybot.code-hive.space` |

El puerto 4139 está libre. En el servidor están ocupados del 4100 al 4138, más el 4180 y el 4181. Hay que confirmarlo justo antes de desplegar, por si alguien ha ocupado el 4139 mientras tanto.

### Un solo contenedor

El bot y el panel de administración son el mismo proceso de Node. El panel escucha en el puerto 3000 del contenedor. El sondeo de Fantasy corre en ese mismo proceso, en segundo plano. No hacen falta contenedores separados.

La base de datos SQLite es un fichero. Va en un volumen de Docker para que sobreviva a los redespliegues. No hace falta un contenedor de base de datos.

### Lo que hay que crear antes de desplegar

El servidor exige dos ficheros para un proyecto nuevo:

- `spec.md` con un bloque de despliegue que indique el modo, el servicio público, el puerto interno y la ruta de comprobación de salud.
- `README_DEPLOY.md` en la raíz del repositorio, con las rutas, los puertos y el comando de despliegue.

El `README_DEPLOY.md` contiene rutas internas del servidor y puertos locales, así que se queda fuera del repositorio público.

### Publicación en GitHub

El servidor trabaja con la rama `master` y con la cuenta de GitHub `dasge97`. Antes de cualquier envío hay que comprobar que el fichero `.gitignore` protege los secretos. No se sube nunca un fichero de entorno real, ni credenciales, ni tokens.

Este repositorio de documentación está en `Dasge97/comentarista-fantasy`. Falta decidir si el código va al mismo repositorio o a otro.

### Una diferencia con las reglas del servidor

Las reglas del servidor describen una arquitectura preferida para backends de Symfony, que es PHP. Nuestro bot va en Node.js. El usuario lo confirmó el 5 de septiembre de 2026 después de plantearle la alternativa. En el servidor ya hay proyectos de Node desplegados, así que no hay impedimento.

## Riesgos y respuesta

| Riesgo | Respuesta |
| --- | --- |
| La sesión caduca | Renovar con el refresh token. Si falla, volver a iniciar sesión con las credenciales guardadas. Avisar al administrador si tampoco funciona. |
| La API cambia de rutas | El lector es la única pieza que conoce las rutas. Se toca en un sitio. |
| Una lectura falla para un manager | Marcar la lectura como incompleta y no comparar posiciones en ese ciclo. No convertirlo en cero. |
| El proceso se reinicia a media jornada | El estado está en SQLite. No se reenvía nada que ya figure en `mensajes_enviados`. |
| Demasiados mensajes en el grupo | Solo se publica el cambio de puesto confirmado. Si aun así molesta, subir el número de lecturas de confirmación. |
| El modelo de lenguaje falla | Publicar una frase sencilla con los mismos datos. El mensaje no se pierde por un fallo del modelo. |
| Las credenciales de la cuenta de servicio | Fuera de Git, en el fichero de secretos generado en el servidor codehive. El token de la cuenta también es un secreto. |

## Lo que falta medir antes de fijar tiempos

- Con qué frecuencia real cambian los puntos durante un partido. Determina si un minuto entre lecturas es adecuado.
- Cuánto dura la sesión y si el refresh token funciona sin intervención.

El tiempo de estabilización tras el final del partido ya está fijado en 15 minutos por experiencia del usuario. El sondeo largo del 5 de septiembre de 2026 sirve para contrastarlo.

## Lo que no entra en este plan

No se automatiza ninguna operación de mercado. El bot no puja, no vende, no paga cláusulas y no cambia alineaciones. El lector solo hace peticiones GET.
