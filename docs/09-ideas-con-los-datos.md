# Qué tenemos guardado y no usamos

Revisión del 6 de septiembre de 2026, a petición del usuario. El bot guarda bastante más de lo que aprovecha. Este documento lista lo que hay, qué se podría hacer con ello y cuánto cuesta.

Nada de aquí está aprobado. Es material para decidir.

## El inventario

De las 21 estadísticas que Fantasy da por futbolista y jornada, el bot solo usa 5 para avisar: gol, asistencia y los tres tipos de penalti. Las otras 16 se guardan enteras en la base de datos y no producen nada.

| Dato que ya se guarda | Se usa para |
| --- | --- |
| `yellow_card`, `red_card`, `second_yellow_card` | Nada |
| `own_goals` | Nada |
| `goals_conceded` | Nada, salvo aparecer en el resumen de partido |
| `mins_played` | Solo para decir «no jugó» en el resumen |
| `saves`, `effective_clearance`, `ball_recovery`, `won_contest` | Nada |
| `total_scoring_att`, `pen_area_entries`, `offtarget_att_assist` | Nada |
| `penalty_conceded` | Nada |
| `marca_points` | Nada |
| `isInIdealFormation` | Nada |
| Estado del futbolista: lesionado, dudoso, sancionado | Nada |
| `historial_propiedad`: quién tenía a cada futbolista y cuándo | Nada |
| `valor_futbolista`: una cifra diaria por futbolista | Solo el gráfico de precios |
| Cláusula de rescisión de cada futbolista en venta | Solo se muestra en la tabla |
| `actividad`: fichajes y ventas con importe | Solo la tabla de Movimientos |
| `previousPosition` de la clasificación | Nada |

Además hay una consulta de Fantasy que no se llama nunca: las estadísticas por partido, en `/stats/v1/competition/1/stats/week/{jornada}`. Devuelve los dos equipos de cada partido con su nombre real y la lista de quién jugó.

## Ideas, ordenadas por lo que aportan frente a lo que cuestan

### 1. Avisar de lesionados y sancionados antes de que cierre la alineación

Ahora mismo hay 44 futbolistas lesionados, 10 dudosos y 5 sancionados en la competición. El bot lo sabe y se lo calla.

El aviso sería: «Ojo, tienes a Bartra lesionado en tu once y la jornada cierra en dos horas». Es lo más útil que puede hacer el bot por cada uno, porque evita perder puntos de verdad.

Hace falta saber cuándo cierra la alineación. La consulta de jornada actual ya devuelve la fecha de cierre.

**Coste: pequeño.** El dato ya está guardado.

### 2. Nombres de los equipos reales

Los partidos se guardan como «20 contra 26» porque solo tenemos identificadores. La consulta de estadísticas por partido devuelve el nombre y el escudo de cada equipo.

Sin nombres, el resumen de final de partido no puede decir contra quién se jugaba, y la web muestra números.

**Coste: pequeño.** Una consulta al día y una tabla nueva.

### 3. Más hechos que avisar

Con los contadores que ya se guardan salen gratis:

- Roja: `red_card` o `second_yellow_card` suben.
- Autogol: `own_goals` sube.
- Penalti cometido: `penalty_conceded` sube.
- Portero que para mucho: `saves` pasa de un umbral.

La roja y el autogol son los dos que el grupo comentaría solo.

**Coste: pequeño.** Es añadir entradas a la lista de hechos.

### 4. «Lo vendiste y ahora marca»

La tabla de propiedad guarda quién tenía a cada futbolista y en qué fechas. Cruzándola con un gol se puede decir: «Aubameyang marca. Barriga lo vendió hace once días por 32 millones».

Es el mensaje de grupo con más gracia de todos los posibles, y los datos están completos desde el arranque de la liga.

**Coste: mediano.** Hay que decidir cuánto tiempo atrás cuenta como reciente.

### 5. Aviso de precios

Se guarda una cifra diaria por futbolista. Con dos días ya se puede decir quién sube y quién baja.

Dos usos distintos:

- Privado: «tus futbolistas han perdido 4 millones hoy».
- Grupo: «el que más ha subido hoy es X, y lo tiene Y».

**Coste: pequeño.** La serie ya existe.

### 6. Cláusulas al alcance

El mercado trae la cláusula de rescisión de cada futbolista que un manager pone a la venta. Cruzándola con el dinero calculado de cada uno se puede avisar: «puedes pagar la cláusula de X, te sobran 12 millones».

**Coste: mediano.** Depende de que el dinero calculado sea fiable, y ahora es una estimación hasta calibrarlo.

### 7. Avisar de los fichajes en el grupo

Cada 10 minutos se lee la actividad de la liga y se guardan los movimientos nuevos. No se anuncia ninguno.

«Knassim ficha a Kounde por 41 millones» es un mensaje que el grupo comentaría.

**Coste: pequeño.** Los movimientos nuevos ya se detectan; solo falta publicarlos.

### 8. Once ideal de la jornada

Cada futbolista trae si entró en el once ideal de la jornada. Sirve para un premio semanal: «tres de los tuyos están en el once ideal».

**Coste: pequeño.**

### 9. Ficha de futbolista en la web

Ahora la web tiene una página de precios que solo muestra el valor. Con lo guardado se puede hacer una ficha completa: puntos por jornada, estadísticas acumuladas, quién lo ha tenido y cuánto costó cada vez.

**Coste: mediano.** Es trabajo de interfaz, no de datos.

### 10. Comparar dos managers

Con el histórico por jornada se puede enfrentar a dos: quién ha ganado más jornadas, en qué jornada se cruzaron, cuántos puntos de diferencia máxima ha habido.

**Coste: mediano.**

## Hallazgo del 6 de septiembre de 2026: el histórico de precios sí existe

Hasta ahora se daba por hecho que la serie de precios empezaba el día que arrancó el bot. Es falso.

La consulta `/api/v1/competition/1/player/{id}/market-value` devuelve el valor de mercado **de todos los días de la temporada**, con la fecha y el número de pujas de cada día.

Comprobado con el futbolista 121, Bartra: 70 entradas diarias desde el 29 de junio de 2026 hasta hoy. Empezó valiendo 20.000.000 y hoy vale 33.852.904.

Esto cambia lo que se puede hacer:

- Gráficos de precio de la temporada entera, no de dos días.
- Tendencia real: cuánto ha subido en el último día, la última semana, el último mes.
- Quién más ha subido y quién más ha bajado de toda la competición.
- El campo `bids` da además cuántas pujas tuvo cada día.

Coste de traérselo: una consulta por futbolista, 836 en total. Se hace una vez en segundo plano y después basta con actualizar el día nuevo.

La tabla `valor_futbolista` que ya existe sirve tal cual: solo hay que rellenarla hacia atrás.

## Página de futbolistas con filtros

El usuario pidió tener al menos los mismos filtros que la aplicación de Fantasy. Los campos necesarios ya se guardan todos:

| Filtro | Campo que lo permite |
| --- | --- |
| Posición | `posicion_id` |
| Equipo real | `equipo_real_id`, con el nombre pendiente de traer |
| Estado | `estado`: ok, lesionado, dudoso, sancionado, fuera de la liga |
| Valor de mercado | `valor` |
| Puntos de la temporada | `puntos` |
| Media por jornada | `media` |
| Propietario | `historial_propiedad`, incluido «sin dueño» |
| Subida o bajada de precio | La serie de `valor_futbolista` |

Con eso se puede hacer una tabla ordenable y filtrable de los 836 futbolistas, con su gráfico de precio al abrir cada uno.

## Lo que no se puede hacer con lo que hay

- **El minuto de un gol.** Fantasy no lo da. Solo se sabe que ha marcado, comparando dos lecturas.
- **El dinero exacto de un rival.** La API responde que no. Se calcula, y hasta calibrar el presupuesto inicial es una estimación con un desfase igual para todos.
- **El importe de las pujas ajenas.** El mercado dice cuántas hay, no de cuánto. El histórico de precios también da el número, no el importe.

## Cuáles propongo primero

Por orden de lo que aporta frente a lo que cuesta:

1. **Histórico de precios completo y página de futbolistas con filtros.** Es lo que ha pedido el usuario y ahora se sabe que los datos existen enteros.
2. **Lesionados y sancionados en tu once**, con aviso antes de que cierre la alineación. Es lo único que evita perder puntos de verdad.
3. **Nombres de los equipos reales.** Sin ellos los partidos salen como números.
4. **Rojas y autogoles** como hechos nuevos que avisar.
5. **Fichajes anunciados en el grupo.**
6. **«Lo vendiste y ahora marca».**

Las seis usan datos que ya están en la base de datos o a una consulta de distancia.
