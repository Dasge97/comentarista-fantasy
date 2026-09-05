# Resultados de la prueba de lectura

**Estado: EJECUTADA.** Las nueve comprobaciones P01–P09 se han realizado y superado. La observación durante un partido está en curso al cerrar este documento.

## Contexto

- Fecha y hora UTC: 2026-09-05, entre 19:45 y 20:20 UTC.
- Agente/persona que realiza la prueba: agente Claude, con credenciales facilitadas por el usuario.
- Entorno y sistema operativo: Windows 11, Node.js v22.19.0.
- Versión de LaLigaApp y commit: no se ejecutó la aplicación de escritorio. Se leyó el código de la rama `main` de Externoak/LaLigaApp para reproducir su autenticación y sus rutas.
- Método de acceso utilizado, sin secretos: script propio de solo lectura. Inicio de sesión con correo y contraseña contra la política `B2C_1A_ResourceOwnerv2` de `login.laliga.es`, con el client ID de correo publicado en `authService.js`. Peticiones GET a `https://fantasy-api.llt-services.com` con cabeceras `Authorization: Bearer`, `x-app: 2` y `x-lang: es`. No se realizó ninguna petición POST, PUT ni DELETE.
- Liga: «La liga Infartos», ID `017818909`, privada, 9 managers.
- Cuenta de servicio: manager `ComentaristaBot`, ID de manager `12273863`, ID de equipo `39844750`. Entró en la liga el 2026-09-05 a las 22:00 hora local, con 1 futbolista y 0 puntos.
- Competición, temporada y jornada de referencia: competición `1`, jornada 4 en curso.
- Participantes: 9 managers en total. 8 reales más la cuenta de servicio.

## Reglas de la liga leídas de la API

La consulta de ligas devuelve la configuración. Es información que faltaba y que condiciona el diseño.

| Opción | Valor |
| --- | --- |
| Cláusula de rescisión | Activada |
| Capitán | Desactivado |
| Banquillo automático | Desactivado |
| Formaciones premium | Desactivado |
| Cesiones | Desactivado |
| Once ideal | Desactivado |
| Entrenador | Desactivado |
| Liga premium | No |

Sin capitán ni banquillo automático, la puntuación de un manager en una jornada es la de sus once titulares. No hay multiplicadores ni sustituciones automáticas que compliquen el cálculo.

## Resultado por comprobación

| ID | Resultado | Evidencia y comparación oficial | Incidencias |
| --- | --- | --- | --- |
| P01 · Sesión y liga | Superada | Inicio de sesión correcto con `access_token`, `id_token` y `refresh_token`. `GET /api/v4/user/me` responde HTTP 200 con `ComentaristaBot`. `GET /api/v1/competition/1/leagues` devuelve «La liga Infartos». | Antes de la invitación la lista de ligas venía vacía. |
| P02 · Clasificación | Superada | `GET /api/v1/competition/1/leagues/017818909/standing` devuelve las 9 filas, con posición, puntos y nombre de manager. | Ninguna. |
| P03 · Plantilla rival | Superada | `GET /api/v1/competition/1/leagues/017818909/teams/37332684` devuelve los 15 futbolistas de TekilaTime, con posición, equipo real y puntos. | Ninguna. |
| P04 · Segundo rival | Superada | La misma consulta con `37335670` devuelve los 14 futbolistas de CEstJoel. Se repitió con éxito en los 8 managers reales. | Ninguna. |
| P05 · XI histórico rival | Superada | `GET /api/v1/competition/1/teams/{teamId}/lineup/week/3` devuelve el once de la jornada 3 de cualquier manager, con formación táctica. Se leyeron los 8. | La cuenta de servicio devuelve HTTP 204 porque no jugó esa jornada. |
| P06 · Puntos individuales | Superada | Cada futbolista trae `lastStats`, una lista por jornada con `weekNumber`, `totalPoints` y el desglose de estadísticas. | Un futbolista que no jugó no aparece en `lastStats` de esa jornada. Es ausencia, no cero. |
| P07 · XI jornada actual | Superada | `GET /api/v1/competition/1/teams/{teamId}/lineup/week/4` devuelve el once de la jornada en curso de cualquier manager. | La alineación editable, `GET .../lineup` sin jornada, devuelve HTTP 403 para un rival y HTTP 200 solo para el equipo propio. La distinción entre once de jornada y alineación editable es clara y la garantiza el servidor. |
| P08 · Mercado y actividad | Superada | El mercado devuelve 31 entradas con futbolista, precio, fecha de expiración, estado y número de pujas. La actividad devuelve 92 entradas con tipo, usuario, futbolista, importe y fecha. | El mercado no muestra el importe de las pujas ajenas, solo cuántas hay. |
| P09 · Semanal frente a general | Superada | Ver la sección siguiente. | Ninguna. |

## Qué significan los puntos

Es el punto que la documentación dejaba sin resolver. Queda aclarado.

- La clasificación general, `/standing`, trae `points` y `livePoints`. `points` ya incluye `livePoints`. Se comprobó en los 6 managers que tenían ambos campos: `team.teamPoints + livePoints = points`, sin excepción. **No hay que sumar la jornada en curso otra vez.**
- `livePoints` desaparece del objeto cuando vale cero. No llega como `0`, llega ausente.
- La clasificación de una jornada, `/standing/{week}`, trae solo `points`, y es la puntuación de esa jornada aislada.
- La alineación de una jornada trae también `points`, y coincide con el valor de la clasificación de esa jornada.

## Caso encontrado: alineación incompleta

El manager papiricolindo declaró formación 5-3-2 en la jornada 3, pero su once solo tenía 9 futbolistas: 1 portero, 4 defensas, 2 centrocampistas y 2 delanteros. Sus futbolistas sumaban 49 puntos entre todos. Fantasy le adjudica **0 puntos** en esa jornada, tanto en la alineación como en la clasificación semanal. Las dos fuentes coinciden.

Consecuencia para el diseño: **nunca sumar las puntuaciones de los futbolistas para obtener el total de un manager.** Hay que leer el campo `points`. Sumar habría dado 49 en vez de 0 y habría producido una clasificación falsa.

## Estadísticas disponibles por futbolista y jornada

Cada entrada de `lastStats` trae `weekNumber`, `totalPoints`, `isInIdealFormation` y un objeto `stats`. Cada estadística es una pareja de dos números: la cantidad y los puntos que aporta.

Campos observados: `mins_played`, `goals`, `goal_assist`, `offtarget_att_assist`, `pen_area_entries`, `penalty_won`, `penalty_save`, `saves`, `effective_clearance`, `penalty_failed`, `own_goals`, `goals_conceded`, `yellow_card`, `second_yellow_card`, `red_card`, `total_scoring_att`, `won_contest`, `ball_recovery`, `poss_lost_all`, `penalty_conceded`, `marca_points`.

Esto cambia una decisión pendiente. La documentación planteaba contratar una API deportiva externa para goles, tarjetas y asistencias. **La propia API de Fantasy ya trae esos acontecimientos**, y además con los puntos que cada uno aporta.

Lo que no trae es el minuto del acontecimiento. Se sabe que un futbolista ha marcado, no en qué minuto. Para detectar un gol recién ocurrido hay que comparar dos lecturas seguidas.

Ejemplo real leído durante el partido en juego, a las 20:10 UTC: el futbolista Ayoze, alineado por Knassim, tenía `goal_assist=1` aportando 3 puntos, y `totalPoints=4`. La asistencia estaba en la API mientras el partido seguía disputándose.

## Calendario y estado de partidos

`GET /api/v1/competition/1/calendar?weekNumber=4` devuelve los 10 partidos con `id`, `matchDate`, `localId`, `visitorId`, `matchState`, `localScore` y `visitorScore`.

Valores de `matchState` observados: `1` antes de empezar, `3` y `4` con el partido en curso, `7` finalizado. El marcador llega como `null` antes del comienzo.

Cruzando el calendario con los onces de la jornada, cada partido de la jornada 4 tiene entre 4 y 12 futbolistas alineados por managers de la liga. Ningún partido queda sin interés para el grupo.

## Ensayo técnico

| Capacidad | Resultado | Observación |
| --- | --- | --- |
| Campos/IDs y semántica identificados | Superada | Identificados los campos de usuario, liga, clasificación general y semanal, plantilla, alineación por jornada, estadísticas, mercado, actividad y calendario. |
| Lectura de todos los equipos esperados | Superada | Los 8 managers reales se leen desde la sesión de la cuenta de servicio. Ninguna consulta falló. |
| Puntos modificados durante partido | En curso | Sondeo de 13 lecturas separadas un minuto, iniciado a las 20:05 UTC. |
| Frecuencia efectiva de cambios | Pendiente | Depende del sondeo. |
| Diferencia entre hora del evento y hora observada | Pendiente | La API no da el minuto del acontecimiento, así que no se puede calcular sin una referencia externa. |
| Renovación de sesión | Superada | Probada el 5 de septiembre de 2026. El refresh token renueva sin usar la contraseña, con la política `B2C_1A_ResourceOwnerv2`, la misma que lo emitió. La caducidad declarada es de 86.400 segundos. |
| Tratamiento de ausencia frente a cero | Superada | Distinguido en dos sitios: `livePoints` ausente en vez de cero, y futbolista sin entrada en `lastStats` cuando no jugó. |
| Clasificación sin doble suma de jornada | Superada | `points` ya incluye `livePoints`. Verificado en 6 managers. |
| Correcciones o puntuación negativa | Pendiente | No se ha observado ninguna corrección. |
| Límites HTTP y recuperación | Pendiente | No se alcanzó ningún límite. Se hicieron unas 120 peticiones sin ningún rechazo. |

## Registro de la observación en directo

Pendiente de completar con el resultado del sondeo iniciado a las 20:05 UTC.

## Evidencia técnica sanitizada

Autenticación: `POST https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token?p=B2C_1A_ResourceOwnerv2`, cuerpo `application/x-www-form-urlencoded` con `grant_type=password`. Respuesta HTTP 200 con las claves `access_token`, `token_type`, `expires_in`, `refresh_token` e `id_token`. El `id_token` no contiene los campos `email` ni `name`; el campo `sub` devuelve el texto «Not supported currently. Use oid claim.».

Tanto `access_token` como `id_token` sirven como Bearer: ambos devuelven HTTP 200 en `/api/v4/user/me`.

Rutas antiguas descartadas: `GET /api/v3/leagues` responde HTTP 500 y `GET /api/v1/competition/1/teams` responde HTTP 404. La competición `2` existe y devuelve lista vacía para esta cuenta; la `3` y superiores responden HTTP 404.

No se han guardado tokens ni credenciales en este repositorio. El script de prueba y el fichero de credenciales están en el directorio temporal de la sesión, fuera de Git.

## Conclusión para comentar con el usuario

- Qué está comprobado: desde una sola sesión de la cuenta de servicio se leen los 8 managers, sus plantillas, sus onces de cualquier jornada, sus puntos totales y el desglose de estadísticas de cada futbolista, más el mercado, la actividad y el calendario. La lectura transversal de la liga queda demostrada.
- Qué permanece como inferencia: la frecuencia real de actualización durante un partido y el comportamiento de la sesión a lo largo de los días.
- Qué falta para el MVP candidato: vincular usuarios de Telegram con managers, y decidir qué acontecimientos se publican.
- Qué pieza de LaLigaApp se puede adaptar: la autenticación de `authService.js` y las rutas de `api.js` están reproducidas y validadas. No hace falta adaptar su interfaz.
- Próximo paso propuesto: decidir con el usuario el alcance del primer bot, ahora que se conocen las reglas de la liga y los datos disponibles.

## Cambios de decisiones

Se ha cambiado el método de la prueba, no su objetivo. La documentación proponía usar la aplicación de escritorio LaLigaApp de forma manual. En su lugar se usó un script propio de solo lectura que reproduce su autenticación y sus rutas, porque el agente no puede manejar una ventana gráfica. El resultado es más directo: se observan las respuestas de la API en vez de una pantalla.

Queda pendiente de decidir con el usuario si se sigue necesitando una API deportiva externa. Las estadísticas de Fantasy cubren goles, asistencias, tarjetas y penaltis, que era el motivo principal para contratarla. Lo que Fantasy no da es el minuto del acontecimiento.
