# Catálogo abierto de acontecimientos

Los eventos siguientes son posibilidades, no un alcance aprobado. Las cifras y mensajes son ejemplos. «Privado» y «grupo» indican el canal propuesto; podrá cambiarse con el usuario.

## Eventos deportivos contextualizados

| ID | Evento | Datos necesarios | Destino propuesto y ejemplo |
| --- | --- | --- | --- |
| E01 | Gol de jugador alineado | Gol, identidad y XI válido | Privado: «Mbappé marca en el 67. Está en tu XI»; grupo si genera interés |
| E02 | Asistencia | Asistente confirmado y XI | Privado; susceptible de revisión |
| E03 | Roja | Expulsión, jugador y XI | Privado y grupo: «Dani se queda con un expulsado» |
| E04 | Amarilla | Tarjeta y XI | Privado opcional; evitar saturación |
| E05 | Penalti fallado | Evento y lanzador | Privado/grupo; puntos exactos por confirmar |
| E06 | Penalti detenido | Evento y portero | Privado/grupo para el manager del portero |
| E07 | Sustitución | Jugadores que entran/salen y XI | Privado opcional cuando termina o comienza su participación |
| E08 | Inicio de partido | Estado y jugadores afectados | Grupo: previa breve con managers implicados |
| E09 | Descanso | Estado y puntos disponibles | Resumen opcional; marcar datos provisionales |
| E10 | Final de partido | Estado y jugadores afectados | Resumen de impacto por manager |
| E11 | Gol anulado/rectificación | Revisión de un evento anterior | Corregir mensaje y efectos narrados |
| E12 | Jugadores enfrentados | Equipos rivales y XIs | «Dani tiene al delantero; Carlos, al portero» |

La confirmación y precisión de estos eventos dependen de la fuente elegida. No deducir una asistencia o un penalti a partir de una diferencia de puntos.

## Eventos derivados del estado Fantasy

| ID | Evento | Detección propuesta | Matices |
| --- | --- | --- | --- |
| E13 | Cambio de puntos de jugador | Comparar dos lecturas válidas de misma jornada | «7 → 11» sin atribuir causa desconocida |
| E14 | Cambio de líder de jornada | Comparar ranking semanal coherente | No confundir con liderazgo general |
| E15 | Cambio de líder general | Comparar ranking acumulado coherente | Evitar doble cómputo de jornada |
| E16 | Adelantamiento entre managers | Cambio de orden | Agrupar varios movimientos cercanos |
| E17 | Empate en puntos | Igualdad antes inexistente | Puede existir desempate oficial |
| E18 | Partidazo individual | Umbral o récord de puntos | Umbral por definir; capitán puede alterar aportación al manager |
| E19 | Remontada importante | Diferencia recuperada en un periodo | Definir referencia y mínimo antes de activar |
| E20 | Jugador exclusivo que marca | Propiedad/selección y gol | Solo es distintivo si la modalidad permite compartir jugadores o se compara el uso en XI |
| E21 | Jugador fuera del XI que puntúa mucho | Plantilla de referencia, XI y puntos | Verificar banquillo automático antes de bromear con puntos perdidos |
| E22 | Corrección que cambia clasificación | Puntos revisados y ranking | Explicar rectificación, no un nuevo acontecimiento deportivo |
| E23 | Varias bajas o malas puntuaciones | Estado confirmado de jugadores alineados | Evitar afirmar «juega con diez» antes de saber sustituciones automáticas |

En una modalidad donde cada futbolista tiene un único propietario, «lo tiene solo un manager» no es excepcional por sí mismo. Tampoco procede el ejemplo «lo tienen alineado tres managers» en esa modalidad. Preguntar las reglas cuando se diseñen los eventos, después de la validación de lectura.

## Resúmenes

| ID | Resumen | Contenido candidato |
| --- | --- | --- |
| E24 | Impacto del partido | Aportación por manager de los futbolistas del encuentro, posiciones afectadas y estado provisional |
| E25 | Situación antes del último partido | Diferencias, managers que acabaron y jugadores pendientes |
| E26 | Cierre del día | Puntos del día si se pueden atribuir correctamente, movimientos y próximo partido relevante |
| E27 | Cierre de jornada | Ganador, clasificación, remontadas, mejor futbolista y premios acordados |
| E28 | Confirmación/corrección final | Diferencias entre cierre provisional y dato confirmado por la fuente |

## Ideas con histórico o interacción adicional

| ID | Idea | Dependencia adicional |
| --- | --- | --- |
| E29 | «Lo vendiste y ahora marca» | Histórico de traspasos, fechas y propietario previo |
| E30 | Mejor fichaje de la jornada | Fecha/precio de compra, criterio acordado de rendimiento |
| E31 | Récord personal o de liga | Historial suficiente y definición comparable |
| E32 | Seguir a un rival | Preferencia explícita y seguimiento de diferencia |
| E33 | Recuerdo de un duelo anterior | Historial fiable; humor con hechos reales |
| E34 | Encuesta o pronóstico | Interacción Telegram; alcance por discutir |

## Política de mensajes a diseñar

Un gol podría originar E01, E13, E14 y E16. No enviar cuatro mensajes automáticamente: decidir si se agrupan, se actualiza uno o solo se publica el más relevante. No retrasar indefinidamente el aviso deportivo esperando puntos.

Distinguir detección interna de publicación. Privados configurables y grupo con menor volumen. Deduplicar por evento y revisión, no solo por texto. Definir prioridad para rojas, goles y cambios de líder; establecer umbrales para fluctuaciones pequeñas.

El tono debe ser de pique amistoso y ajustable. La precisión de hechos tiene prioridad sobre el chiste. Una IA narrativa es opcional y no está aprobada como dependencia del MVP.
