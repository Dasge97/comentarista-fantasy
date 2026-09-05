# Fuentes y trazabilidad

Investigación realizada en esta conversación, con referencia de fecha 2026-09-05. Los enlaces a ramas pueden cambiar: para reproducir la revisión usar los commits recogidos en el documento 03. Se leyeron código, documentación y metadatos; no se realizaron pruebas autenticadas de Fantasy.

## Integraciones

### Externoak/LaLigaApp

- [Repositorio y README](https://github.com/Externoak/LaLigaApp): instalación, plataformas, autenticación y licencia declarada.
- [Cliente de API](https://github.com/Externoak/LaLigaApp/blob/main/src/services/api.js): endpoints, lectura semanal y nota de verificación de los puntos.
- [Autenticación](https://github.com/Externoak/LaLigaApp/blob/main/src/services/authService.js): OAuth, PKCE y renovación.
- [Adaptadores](https://github.com/Externoak/LaLigaApp/blob/main/src/services/responseAdapters.js): cambios de respuestas y notas de 2026/27.
- [Recorrido de equipos](https://github.com/Externoak/LaLigaApp/blob/main/src/utils/fetchAllTeamsData.js): lectura de varios equipos desde una sesión.
- [Propietarios](https://github.com/Externoak/LaLigaApp/blob/main/src/services/playerOwnershipService.js): cruce jugador/manager.
- [Alineaciones](https://github.com/Externoak/LaLigaApp/blob/main/src/components/Teams/Lineup.js): selección de equipo/jornada, normalización y puntos.
- [Detalle de partidos](https://github.com/Externoak/LaLigaApp/blob/main/src/components/Matches/MatchDetails.js): uso de estadísticas.
- [Configuración del proxy](https://github.com/Externoak/LaLigaApp/blob/main/server/config.js): host de destino.
- [Servidor/proxy](https://github.com/Externoak/LaLigaApp/blob/main/server/index.js): encaminamiento de llamadas.
- [LICENSE](https://github.com/Externoak/LaLigaApp/blob/main/LICENSE) y [NOTICE](https://github.com/Externoak/LaLigaApp/blob/main/NOTICE): GPL y atribución.
- [Release observada](https://github.com/Externoak/LaLigaApp/releases/tag/v3.5.3-20): ejecutable Windows y commit de construcción.

### Otros proyectos

- [fantasybot](https://github.com/jonortega20/fantasybot), [api.py](https://github.com/jonortega20/fantasybot/blob/main/fantasybot/api.py), [auth.py](https://github.com/jonortega20/fantasybot/blob/main/fantasybot/auth.py) y [pyproject.toml](https://github.com/jonortega20/fantasybot/blob/main/pyproject.toml): cliente, autenticación y metadatos sin licencia encontrada.
- [Scraper: personal_lineup.py](https://github.com/alxgarci/marca-fantasy-api-scraper-updated/blob/master/personal_lineup.py): ranking y recorrido de equipos con el mismo token.
- [Scraper: fantasy_scraper.py](https://github.com/alxgarci/marca-fantasy-api-scraper-updated/blob/master/fantasy_scraper.py): datos históricos de jugadores.
- [Scraper: licencia](https://github.com/alxgarci/marca-fantasy-api-scraper-updated/blob/master/LICENSE.md).
- [Clojure: propietarios](https://github.com/carlosgeos/laligafantasy/blob/master/src/laliga_fantasy/owned_players.clj), [autenticación](https://github.com/carlosgeos/laligafantasy/blob/master/src/laliga_fantasy/auth.clj) y [licencia MIT](https://github.com/carlosgeos/laligafantasy/blob/master/LICENSE).
- [GitHub: licencias de repositorios](https://docs.github.com/articles/licensing-a-repository): un repositorio público sin licencia no autoriza de forma general copiar y crear derivados.

## Fantasy oficial

- [Puntuación en tiempo real](https://laligafantasy.zendesk.com/hc/es/articles/115002390633--Puedo-consultar-los-puntos-de-mi-equipo-en-tiempo-real): describe actualizaciones a los pocos minutos; no garantiza una latencia concreta de API.
- [Preguntas frecuentes](https://laligafantasy.zendesk.com/hc/es/sections/360001615573-Modo-de-juego-y-preguntas-frecuentes): referencia para reglas, puntos y cierre de alineaciones.
- [Aplicación oficial en Google Play](https://play.google.com/store/apps/details?hl=es&id=com.lfp.laligafantasy): descripción de funciones como capitán y banquillo. No se ha confirmado que estén activadas en la liga del usuario.
- [Información legal de Fantasy](https://www.laliga.com/informacion-legal/laliga-fantasy): referencia general; la conversación no realizó una evaluación legal exhaustiva de automatización o redistribución.

## Telegram

- [Introducción a bots](https://core.telegram.org/bots): interacción con grupos y necesidad de que el usuario inicie conversación para privados.
- [Funciones y deep linking](https://core.telegram.org/bots/features#deep-linking): incorporación con contexto mediante enlaces.
- [Bot API](https://core.telegram.org/bots/api): envío, edición de mensajes y botones.
- [FAQ](https://core.telegram.org/bots/faq): límites publicados de envío; comprobar versión actual al implementar y tratar respuestas 429.

## Proveedores deportivos

- [API-Football](https://www.api-football.com/): cuotas, precios y frecuencia de actualización anunciada.
- [Documentación API-Football](https://www.api-football.com/documentation-v3): endpoints y cobertura a revisar antes de elegir.
- [Sportmonks: livescore](https://www.sportmonks.com/football-api/solutions/livescore-api/): capacidades y plan Starter observado.
- [Sportmonks: planes](https://www.sportmonks.com/football-api/plans-pricing/): contraste de condiciones comerciales.

## Límites de las conclusiones

Encontrar una ruta no demuestra que funcione con la cuenta dedicada. Ver puntos en una pantalla no demuestra que estén actualizados en directo. Un comentario del repositorio sobre renovación no acredita que la sesión dure indefinidamente. Un precio publicado no demuestra la cobertura exacta de una temporada. Todas esas validaciones se han dejado expresamente pendientes.
