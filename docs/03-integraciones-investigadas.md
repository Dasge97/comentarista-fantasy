# Integraciones investigadas y reutilización

Fecha de investigación: 5 de septiembre de 2026. La evidencia procede de lectura de código y documentación pública; no de consultas autenticadas ejecutadas por nosotros.

## Conclusión de trabajo

Priorizar la integración de **Externoak/LaLigaApp** para la primera prueba. Tiene lectura de equipos de la liga, alineaciones por jornada, clasificación y autenticación. Su interfaz ya usa la misma sesión para consultar rivales.

No se ha encontrado documentación de una API pública oficial de Fantasy para terceros. Las implementaciones usan servicios internos. Su existencia no garantiza soporte del proveedor ni estabilidad. El permiso de reutilizar código y las condiciones de acceso a los datos son cuestiones distintas.

## Comparación

| Proyecto | Tecnología observada | Aportación | Licencia observada | Decisión provisional |
| --- | --- | --- | --- | --- |
| [Externoak/LaLigaApp](https://github.com/Externoak/LaLigaApp) | JavaScript, React/Electron, proxy Node | Ligas, rivales, XI por jornada, puntos, mercado, actividad, OAuth | GPLv3; README indica GPL-3.0-or-later; términos adicionales de atribución | Candidato principal para adaptar la lectura |
| [jonortega20/fantasybot](https://github.com/jonortega20/fantasybot) | Python, biblioteca estándar | Cliente pequeño, OAuth/renovación, equipos, mercado y alineación actual | No se encontró declaración de licencia | Referencia técnica; no incorporar código sin aclarar permiso |
| [alxgarci/marca-fantasy-api-scraper-updated](https://github.com/alxgarci/marca-fantasy-api-scraper-updated) | Python | Exportación de equipos y mercado con una sesión | GPLv3 | Referencia secundaria; rutas antiguas y token manual |
| [carlosgeos/laligafantasy](https://github.com/carlosgeos/laligafantasy) | Clojure | Propietarios, históricos, mercado y autenticación por correo | MIT | Referencia permisiva, pero integración antigua |

## Versiones revisadas

| Proyecto | Commit de la rama revisada | Último push informado por GitHub |
| --- | --- | --- |
| LaLigaApp | `408837525262ae7caf5a029cf41f51a9d8e9ae9c` | 2026-07-21 |
| fantasybot | `31de2bc57a529cfe9e8ea7d2c195b41d8a0f99ec` | 2026-09-02 |
| scraper actualizado | `4d516e72849d40d2183e0de58553e7f624372f53` | 2024-09-04 |
| laligafantasy | `55a81af5fc7eb1c103db6793c7c6dde3b533ec5d` | 2024-09-07 |

La fecha de actualización de un repositorio no demuestra funcionamiento. Revalidar los archivos concretos si se usa otra revisión.

## LaLigaApp: mapa útil de código

| Archivo | Qué aporta |
| --- | --- |
| `src/services/api.js` | Métodos y rutas de lectura y escritura; seleccionar la parte de lectura |
| `src/services/authService.js` | Inicio OAuth, intercambio de código y renovación de tokens |
| `src/services/responseAdapters.js` | Adaptación de respuestas; notas sobre cambios para 2026/27 |
| `src/utils/fetchAllTeamsData.js` | Recorrido de los equipos de la clasificación; concurrencia limitada y caché |
| `src/services/playerOwnershipService.js` | Relación entre futbolista y manager/equipo propietario |
| `src/components/Teams/Lineup.js` | Selección de equipo y jornada; interpretación del XI y puntos |
| `src/components/Matches/MatchDetails.js` | Consulta y presentación de estadísticas de partido |
| `server/config.js` y `server/index.js` | Destino y comportamiento del proxy |
| `LICENSE`, `NOTICE` y `README.md` | Condiciones de reutilización e instrucciones de ejecución |

La integración tiene dependencias de interfaz, almacenamiento de navegador, notificaciones visuales y caché de React Query. Para convertirla en lector de backend habría que desacoplar esas partes. No es una librería de servidor lista para importar sin revisión.

### Consultas encontradas

En `api.js`, `CMP` se construye como `/v1/competition/{competitionId}`. La configuración del proxy apunta a `https://fantasy-api.llt-services.com`. Las siguientes son rutas de código, no una API pública garantizada ni URLs certificadas mediante una prueba nuestra. Revisar cómo añade o conserva prefijos el proxy antes de usarlas directamente.

| Método | Ruta relativa observada |
| --- | --- |
| `getLeagues()` | `{CMP}/leagues` |
| `getLeagueRanking(leagueId)` | `{CMP}/leagues/{leagueId}/standing` |
| `getLeagueRankingByWeek(leagueId, week)` | `{CMP}/leagues/{leagueId}/standing/{week}` |
| `getTeamData(leagueId, teamId)` | `{CMP}/leagues/{leagueId}/teams/{teamId}` |
| `getTeamLineup(teamId, week)` | `{CMP}/teams/{teamId}/lineup/week/{week}` |
| `getCurrentLineup(teamId)` | `{CMP}/teams/{teamId}/lineup` |
| `getMarket(leagueId)` | `{CMP}/league/{leagueId}/market` |
| `getLeagueActivity(leagueId, index)` | `{CMP}/leagues/{leagueId}/activity/{index}` |
| `getCurrentWeek()` | `{CMP}/week/current` |
| `getMatchday(weekNumber)` | `{CMP}/calendar?weekNumber={weekNumber}` |

Se omiten parámetros de idioma para legibilidad. La consulta de estadísticas utiliza una entrada de proxy `/stats/v1/competition/{competitionId}/stats/week/{weekNumber}`; revisar su encaminamiento si se prueba fuera de la aplicación.

### Evidencias específicas

- La pantalla `Lineup.js` obtiene los equipos de la clasificación y consulta el equipo y jornada seleccionados con la sesión activa.
- Para puntos, busca la jornada en `player.playerMaster.lastStats` y lee `totalPoints`. Falta comprobar cuándo se actualiza y qué disponibilidad histórica tiene.
- El código de clasificación semanal incluye una nota pendiente de verificar si `points` representa esa jornada o un acumulado. No borrar esa incertidumbre en nuestro diseño.
- `responseAdapters.js` documenta cambios de rutas y formas de datos para 2026/27. Los proyectos antiguos siguen utilizando varias rutas previas.
- `fetchAllTeamsData.js` puede omitir equipos cuya consulta falla. Para nuestro bot esa omisión debe convertirse en estado de lectura incompleta; no en una clasificación válida con menos managers.
- La presentación de puntos puede convertir ausencias en cero. El lector del bot debe conservar la diferencia entre «sin dato» y «cero confirmado».

### Autenticación

Hay implementación de OAuth con PKCE, intercambio del código y renovación con refresh token. El flujo de escritorio con Google usa el retorno de la aplicación de LaLiga. Es reutilización de un flujo interno, no un registro oficial de nuestra aplicación como tercero.

Los documentos mencionan duraciones de sesión; se deben observar expiración y renovación reales. No prometer 90 días sin intervención basándose únicamente en comentarios del código.

## Los otros proyectos

`fantasybot/api.py` contiene `FantasyClient`, renovación antes de caducidad y un reintento tras 401. Incluye `team(league_id, team_id)`, `lineup(team_id)`, `league_teams`, mercado y actividad. Su cliente también contiene escrituras y el resto del proyecto puede operar autónomamente: no ejecutar esas funciones para probar lectura. En la revisión no se encontró LICENSE ni licencia en `pyproject.toml`.

`personal_lineup.py` del scraper obtiene los equipos desde el ranking y recorre cada uno usando el mismo Bearer. Eso respalda la lectura de la liga desde una cuenta; sus rutas y manejo manual del token lo hacen menos atractivo para el servicio actual.

`owned_players.clj` de carlosgeos recorre managers y normaliza propietarios y cláusulas. `auth.clj` usa endpoints antiguos de autenticación por correo y memoiza el token para procesos cortos. Necesitaría adaptación para un proceso permanente.

## Reutilización y licencias

LaLigaApp permite reutilización bajo sus condiciones GPL y añade atribución visible. Revisar la licencia completa al decidir cómo copiar, modificar o distribuir. La MIT del proyecto Clojure permite reutilización con conservación de sus avisos. La ausencia de licencia en fantasybot no debe interpretarse como permiso general por ser público ([explicación de GitHub](https://docs.github.com/articles/licensing-a-repository)).

El uso personal actual evita diseñar un producto comercial prematuramente, pero no sustituye las condiciones de los componentes. Este paquete no incorpora código de terceros ni asigna una licencia al proyecto futuro.

## Datos deportivos externos

Son una opción abierta para goles, asistencias, tarjetas, cambios e inicio/final de partido. Fantasy puede aportar los puntos aunque el proveedor deportivo desconozca cómo se calcularon.

| Proveedor | Oferta observada durante la investigación | Pendiente |
| --- | --- | --- |
| [API-Football](https://www.api-football.com/) | Actualización anunciada cada 15 s; gratuito 100 consultas/día con temporadas limitadas; Pro 19 USD/mes y 7.500 consultas/día | Cobertura de temporada/LaLiga, calidad, campos, licencia de uso y retraso efectivo |
| [Sportmonks](https://www.sportmonks.com/football-api/solutions/livescore-api/) | Starter desde 29 EUR/mes, cinco ligas y 2.000 consultas/hora, eventos y alineaciones | Cobertura elegida, condiciones y calidad frente a API-Football |

Estos precios son una referencia fechada, no un presupuesto cerrado. No se ha contratado ni elegido proveedor. Consultar cada 30 segundos durante dos horas supone 240 consultas por endpoint; añadir las demás consultas y partidos. Una actualización anunciada cada 15 segundos no garantiza 15 segundos de latencia desde la jugada.

Antes de contratar, comprobar si las estadísticas disponibles en Fantasy ya cubren algún evento necesario y con qué retraso. No asumir que existe un feed completo de goles con minuto solo por haber encontrado estadísticas de partido.
