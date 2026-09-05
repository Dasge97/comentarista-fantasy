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
| Forma de la web | API en JSON más aplicación de React con Vite | El usuario amplió el alcance a una web visual con gráficos. Con HTML generado en el servidor y recargas de página resulta incómodo. La misma API servirá mañana a una aplicación móvil. |

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
| API HTTP | Expone los datos de la base de datos en JSON, con autenticación y permisos. |
| Web | Aplicación visual que consume la API. Contiene la administración y las páginas de la liga. |

## La web

El 5 de septiembre de 2026 el usuario amplió el alcance. Ya no es un panel de administración con formularios, sino una web visual, y hay que prepararlo desde el principio aunque las páginas se añadan poco a poco.

Al principio solo entra el usuario. Los amigos entrarán cuando la web esté terminada.

### Cómo se construye

El proceso de Node deja de generar páginas HTML. Pasa a exponer una API en JSON. La web es una aplicación de React construida con Vite, que se compila a ficheros estáticos y los sirve el mismo proceso de Node.

Es un cambio respecto a la decisión anterior, que era HTML generado en el servidor sin compilación. El motivo es que una web visual con gráficos de evolución de precios y tablas que se actualizan solas no se hace cómodamente con formularios y recargas de página.

La separación entre API y web tiene una ventaja añadida: la misma API puede servir mañana a una aplicación móvil sin tocar nada.

### Quién entra y con qué permisos

Nadie se registra por su cuenta. El usuario da de alta a cada persona desde la administración. Decidido el 5 de septiembre de 2026.

| Papel | Quién | Qué puede hacer |
| --- | --- | --- |
| Administrador | El usuario | Todo: configuración, claves, base de datos, alta y baja de usuarios, envío de notificaciones |
| Participante | Cada amigo dado de alta | Ver las páginas de la liga y sus propios datos |

Un participante entra desde el bot de Telegram. El bot le da un enlace con un código de un solo uso, y al abrirlo queda identificado como su manager. No hay registro, ni contraseñas que recordar, ni recuperación de contraseña que construir.

El administrador entra con contraseña, porque no depende de Telegram y debe poder entrar aunque el bot esté caído.

La elección de manager en el chat privado sigue siendo del propio amigo, como se acordó. El alta en la web es cosa aparte: el usuario decide a quién le da acceso. Un amigo puede recibir mensajes del bot sin tener acceso a la web.

### Qué contiene, para el administrador

| Sección | Contenido |
| --- | --- |
| Claves | Clave de la API de Anthropic, token del bot de Telegram, correo y contraseña de la cuenta de servicio de Fantasy. Se escriben aquí, no en ficheros a mano. |
| Configuración | Segundos entre lecturas, minutos de estabilización tras el final del partido, número de lecturas para confirmar un cambio de puesto, identificador del grupo de Telegram, tono del humor. |
| Estado | Si la sesión de Fantasy está viva y cuándo caduca, hora de la última lectura, si el sondeo está corriendo, próximo partido. |
| Usuarios | Alta y baja de participantes, y qué manager tiene asignado cada uno. |
| Base de datos | Consulta de todas las tablas, incluidas las de histórico. |
| Registro | Últimos mensajes enviados y últimos errores. |
| Acciones | Forzar una lectura, silenciar el bot, soltar la vinculación de un amigo. |
| Notificaciones | Escribir un mensaje y enviarlo al grupo o a un participante concreto. |

### Qué contiene, para todos

Estas páginas son las primeras candidatas. No están cerradas y se irán decidiendo.

| Página | Contenido |
| --- | --- |
| Clasificación | General y por jornada, con la evolución de puestos |
| Manager | Plantilla, once de cada jornada, puntos y estadísticas |
| Dinero | Presupuesto calculado de cada participante y su evolución |
| Mercado | Qué está a la venta, a qué precio y con cuántas pujas |
| Precios | Evolución del valor de mercado de un futbolista a lo largo de la temporada |
| Movimientos | Fichajes y ventas de la liga, quién compró qué y por cuánto |

### El dinero de cada participante hay que calcularlo

Comprobado el 5 de septiembre de 2026: la API devuelve el dinero de la cuenta propia, pero responde HTTP 403 al pedir el de un rival. En la plantilla de un rival el campo de dinero llega vacío. El valor de su plantilla sí es visible.

Así que el dinero de los demás no se lee, se calcula: presupuesto inicial, menos las compras, más las ventas.

El registro de actividad de la liga lo hace posible. Contiene 444 movimientos y llega hasta el 30 de julio de 2026, repartidos en tres páginas. Es el histórico completo desde el arranque de la liga.

Quedan dos cosas por resolver antes de dar una cifra:

- Averiguar cuál es el presupuesto inicial con el que empieza cada manager.
- Descifrar qué significa cada tipo de movimiento. Se observaron los tipos 1, 4, 5, 6, 7, 9, 31 y 33. Los tipos 31 y 33 son la mayoría, con 180 y 176 apariciones, y probablemente son compra y venta.

La cifra será una estimación mientras no se validen las dos cosas. Hay una forma de comprobarla: calcular el dinero de la cuenta de servicio con el mismo método y compararlo con el que devuelve la API, que sí se puede leer.

### Seguridad

La web guarda las claves de la API de Anthropic, el token de Telegram y la contraseña de la cuenta de Fantasy. Es el punto más delicado de todo el sistema.

- La administración entra con contraseña. Nunca abierta a quien conozca la dirección.
- Las claves guardadas se muestran ocultas. La web deja cambiarlas, no leerlas.
- Los códigos de acceso que reparte el bot son de un solo uso y caducan.
- Un participante nunca ve las secciones de administración, y la API lo comprueba en el servidor. No basta con esconder el botón.
- La conexión cifrada por HTTPS la resuelve Traefik en el servidor codehive con certificado de Let's Encrypt, así que no hay que montar nada.

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

El usuario pidió el 5 de septiembre de 2026 que se guarde todo lo que se lea, no solo lo que el bot necesita para el mensaje siguiente. El motivo son funciones futuras de mercado y saber cuándo alguien hace movimientos.

Por eso la base de datos tiene dos partes. Una guarda el estado actual, que es lo que el bot consulta para trabajar. Otra guarda el histórico, que solo crece y nunca se pisa.

### Estado actual

| Tabla | Contenido |
| --- | --- |
| `managers` | ID de manager, ID de equipo y nombre. Se refresca desde la liga. La cuenta de servicio se marca para excluirla. |
| `vinculaciones` | ID de usuario de Telegram, ID de manager y fecha. Un manager solo puede estar vinculado a una persona. |
| `usuarios` | Quién tiene acceso a la web, con qué papel y a qué manager corresponde. Solo el administrador da altas. |
| `codigos_acceso` | Código de un solo uso que reparte el bot para entrar en la web, con su caducidad y si ya se ha usado. |
| `configuracion` | Ajustes editables desde la web y claves guardadas. Las claves se guardan cifradas. |
| `estado_jugador` | Jornada, futbolista, manager, puntos y estadísticas de la última lectura válida, con la hora. Es lo que el detector compara. |
| `estado_manager` | Jornada, manager, puntos y posición de la última lectura válida, con la hora. |
| `candidatos_posicion` | Cambio de puesto detectado y cuántas lecturas seguidas lleva manteniéndose. |
| `mensajes_enviados` | Clave del hecho ya publicado y hora. Evita repetir tras un reinicio. |

La clave de un hecho debe identificar el acontecimiento, no el texto. Por ejemplo, «gol del futbolista 1234 en la jornada 4, ocurrencia número 2». Así un reinicio no vuelve a anunciar lo mismo.

### Histórico

Estas tablas solo reciben filas nuevas. Nunca se actualiza ni se borra una fila existente.

| Tabla | Contenido | Cuándo se escribe |
| --- | --- | --- |
| `historial_jugador` | Jornada, futbolista, manager, puntos y estadísticas completas, con la hora de observación | Cada vez que cambia algo de ese futbolista |
| `historial_manager` | Jornada, manager, puntos y posición, con la hora | Cada vez que cambia el total o la posición de ese manager |
| `historial_propiedad` | Futbolista, manager propietario, fecha en que se detectó y fecha en que dejó de tenerlo | Cuando una plantilla cambia de composición |
| `actividad` | Copia directa del registro de actividad de la liga: tipo de movimiento, manager, futbolista, importe y fecha | Cada vez que aparecen entradas nuevas |
| `historial_mercado` | Entrada del mercado, futbolista, precio, fecha de expiración, estado y número de pujas | Cuando cambia alguno de esos valores |
| `valor_futbolista` | Futbolista, fecha, valor de mercado, puntos de la temporada y media | Una fila al día por futbolista |

Solo se escribe cuando algo cambia. Guardar 120 filas idénticas cada minuto no aporta nada y hace la base de datos inmanejable.

La tabla `valor_futbolista` es la excepción: escribe una fila diaria por futbolista aunque no cambie, porque una serie de precios con huecos es más difícil de usar que una completa.

### Por qué estas tablas sirven para el mercado

- `valor_futbolista` da la evolución del precio de cada futbolista a lo largo de la temporada. Es la base de cualquier función de mercado: quién sube, quién baja, cuándo conviene vender.
- `actividad` es el registro oficial de fichajes y ventas de la liga, con el importe. Dice quién compró qué y por cuánto.
- `historial_propiedad` dice quién tenía a cada futbolista en cada momento. Sin esa tabla no se puede decir «lo vendiste y ahora marca».
- `historial_mercado` dice qué salió a la venta, a qué precio y con cuántas pujas.

### Cuánto ocupa

Con 836 futbolistas y una temporada de 38 jornadas, la estimación es esta:

| Tabla | Filas por temporada | Tamaño aproximado |
| --- | --- | --- |
| `valor_futbolista` | Unas 250.000 | 12 MB |
| `historial_jugador` | Unas 80.000 | 40 MB |
| `historial_manager` | Unas 15.000 | 2 MB |
| El resto | Unos miles | Menos de 1 MB |

El total queda por debajo de 100 MB. SQLite trabaja cómodo con ese tamaño.

## Lecturas que no dependen de los partidos

Además del sondeo durante los partidos, hay lecturas periódicas cuyo único fin es alimentar el histórico.

| Qué se lee | Cada cuánto | Para qué |
| --- | --- | --- |
| Actividad de la liga | Cada 10 minutos | Enterarse de fichajes y ventas casi al momento |
| Mercado de la liga | Cada 30 minutos | Seguir precios, pujas y qué sale a la venta |
| Plantilla de cada manager | Una vez al día, y además justo después de detectar actividad | Saber quién tiene a cada futbolista |
| Valor de mercado de todos los futbolistas | Una vez al día | Serie de precios de la temporada |

Son pocas peticiones. La actividad y el mercado son una petición cada una. Las plantillas son ocho al día. El listado completo de futbolistas es una petición que devuelve los 836 de golpe.

Leer la plantilla justo después de ver actividad nueva sirve para que el cambio de propiedad quede registrado con una hora cercana a la real, en vez de esperar al día siguiente.

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
| 2 | Almacén en SQLite, histórico y ciclo de sondeo según el calendario | El proceso se reinicia y no pierde el estado. El histórico registra un cambio de puntos, un fichaje y una variación de precio. |
| 3 | Bot de Telegram con vinculación y rectificación | Los 8 amigos pueden elegir su manager y cambiarlo |
| 4 | Detección de hechos y envío por privado | Un gol llega al manager correcto, una sola vez |
| 5 | Resumen de final de partido por privado | Cada manager con futbolistas en el partido recibe su resumen |
| 6 | Comentario de grupo con el modelo de lenguaje | Un adelantamiento confirmado produce un comentario con el motivo correcto |
| 7 | API HTTP y web con entrada del administrador | El usuario entra con contraseña y ve el estado y las tablas |
| 8 | Web: configuración, claves y usuarios | Las claves se guardan desde la web y se pueden dar altas |
| 9 | Web: páginas de la liga, dinero, precios y movimientos | Se ve la clasificación, la evolución de precios y el dinero de cada uno |
| 10 | Acceso de los participantes desde el bot y notificaciones desde la web | Un amigo entra con el enlace del bot y solo ve lo suyo |
| 11 | Prueba en una jornada real | El grupo lo usa y se ajusta el volumen de mensajes |

Las fases 1 y 2 son la base. La fase 3 se puede hacer en paralelo porque no depende de las anteriores. Las fases 4, 5 y 6 son las que producen mensajes.

El orden refleja lo que pidió el usuario: al principio entra solo él, y los participantes acceden cuando la web esté terminada. Por eso el acceso de los amigos está en la fase 10 y no antes.

La fase 7 se puede adelantar si quieres ver algo funcionando pronto. El coste de adelantarla es tener que ampliarla cada vez que aparezca una tabla nueva.

Hasta la fase 8, las claves viven en el fichero de secretos generado en el servidor.

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

El bot, la API y la web son el mismo proceso de Node. Escucha en el puerto 3000 del contenedor: sirve la API bajo una ruta y los ficheros de la web bajo la raíz. El sondeo de Fantasy corre en ese mismo proceso, en segundo plano. No hacen falta contenedores separados.

La web se compila durante la construcción de la imagen de Docker. Vite genera ficheros estáticos que quedan dentro de la imagen. En el contenedor final no hace falta Node para la web, solo para el servidor.

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
