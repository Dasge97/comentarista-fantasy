# Visión y experiencia de la liga

## Idea central

El bot convierte el grupo de Telegram en una extensión viva de la competición Fantasy. Debe detectar qué significan los acontecimientos deportivos y los puntos para esa liga: quién celebra, quién pierde posiciones, quién remonta y qué queda por jugar.

El usuario busca una experiencia entre amigos. Los comandos de consulta pueden existir, pero el valor principal está en los avisos proactivos y el comentario contextual durante la jornada.

## Papel de cada pieza

- **LaLiga Fantasy:** participantes, plantillas, XI por jornada, puntuaciones, clasificación y, si interesa, mercado y actividad.
- **Fuente deportiva:** acontecimientos de partidos, si hace falta una fuente complementaria y sus datos justifican el coste.
- **Nuestro sistema:** conserva observaciones, relaciona jugadores y managers, detecta diferencias y selecciona mensajes relevantes.
- **Telegram:** conversación pública, avisos privados e interacciones sencillas.

Estas responsabilidades son conceptuales. No implican servicios separados, tecnologías ni despliegues concretos.

## Incorporación acordada

1. La cuenta dedicada entra en la liga de Fantasy y se configura una vez.
2. El grupo de Telegram se asocia a esa liga.
3. Cada participante se identifica con su manager Fantasy.
4. El sistema sincroniza la información sin introducir manualmente jugadores cada jornada.
5. Quien quiera avisos privados inicia el chat con el bot.

| Relación | Significado |
| --- | --- |
| Grupo de Telegram → liga Fantasy | Contexto de competición compartido |
| Cuenta dedicada → acceso a liga | Una sesión de servicio proporciona la lectura |
| Usuario de Telegram → equipo/manager de esa liga | Destinatario de avisos personales |
| XI de manager + jornada → jugadores que puntúan | Contexto para interpretar acontecimientos |

El mismo identificador de futbolista puede tener representaciones diferentes en distintas fuentes. El manager a nivel de cuenta y el equipo dentro de una liga también pueden tener IDs distintos; no resolver estas relaciones por nombres visibles solamente.

Para una liga de confianza se ha propuesto que cada amigo elija su manager y el administrador confirme la asociación. No está decidido el mecanismo exacto. Debe evitarse que dos amigos reclamen accidentalmente el mismo equipo. Desvincularse y silenciar avisos deberían ser sencillos.

## Grupo, canal y privado

Se ha usado informalmente la palabra «canal», pero el caso principal es un **grupo** con conversación entre amigos y un bot. Un canal de difusión sería otra superficie, opcional y no requerida.

Entrar al grupo no habilita automáticamente los privados: Telegram requiere que el usuario inicie primero esa conversación con el bot. Se puede facilitar mediante un enlace de incorporación con contexto de liga. La cuenta Fantasy dedicada elimina la necesidad de compartir credenciales personales; todavía hace falta identificar a qué manager corresponde cada usuario para personalizar los mensajes.

El bot puede publicar avisos programáticos sin leer todo el chat. Leer conversaciones para responder con humor sería otra función, pendiente de discutir. No exigir desactivar la privacidad del bot para el MVP de notificaciones.

## Avisos privados

Ejemplos ilustrativos:

> ⚽ Mbappé acaba de marcar en el minuto 67. Está en tu XI de esta jornada.

> 📈 Mbappé: 7 → 11 puntos Fantasy. Puntuación provisional.

También podrían avisar de rojas, penaltis fallados, jugadores propios fuera del XI, sustituciones relevantes y distancias frente a un rival elegido. Estas opciones no están todas aprobadas para el MVP.

## Acontecimientos en el grupo

> 🔄 CAMBIO DE LÍDER DE LA JORNADA
> Carlos adelanta a Dani: 54–52. Puntos provisionales.

> 📊 FINAL DEL PARTIDO · Barcelona 3–1 Valencia
> Aportación provisional de los jugadores alineados en este partido:
> Carlos 18 · Dani 11 · Sergio 4 · Pepe 0.

El resumen anterior solo puede llamarse «aportación del partido» si se filtran los jugadores y puntuaciones del partido. Restar el total del manager antes y después daría datos erróneos cuando hay encuentros simultáneos o revisiones de otro partido.

## Ritmo de mensajes

Propuestas para explorar:

- Grupo: goles relevantes, expulsiones, cambios destacados, descanso/final y cierre de jornada.
- Privado: detalle personal configurable; evitar enviar todos los cambios mínimos por defecto.
- Marcador consultable: un mensaje editable con puntos, clasificación provisional y jugadores pendientes.
- Resumir en un mensaje los efectos cercanos de una misma jugada cuando las fuentes lo permitan.
- Permitir silenciar partido, jornada o categoría; ajustar el tono del grupo.
- Posible retraso configurable para evitar spoilers a quien ve una emisión con demora. El retraso del grupo tiene que ser común; el privado puede ser individual.

Detectar muchos eventos no obliga a publicar todos. El objetivo es que el bot aporte conversación y emoción sin desplazar a los amigos del chat.

## Personalidad y rivalidad

El tono deseado es de comentarista de vuestra liga, con provocación amistosa basada en hechos. Se puede empezar con plantillas de texto y reglas. No se necesita un modelo generativo para calcular puntos o identificar un gol.

Como posibilidad futura, un modelo podría variar la narración a partir de hechos ya validados. No decidiría quién ha marcado, calcularía clasificaciones ni inventaría rivalidades. El grado de humor, apodos permitidos y bromas sobre el banquillo se acordarán con el grupo.

## Posibilidades sociales futuras

- Seguir un duelo personal con el amigo al que quieres alcanzar.
- Previa del último partido: quién terminó, quién tiene jugadores pendientes y qué diferencia queda.
- Histórico de remontadas, récords y derrotas por un punto.
- Jugadores vendidos que marcan en la siguiente jornada.
- Premios semanales y resúmenes de mejores decisiones.
- Encuestas o pronósticos internos sin dinero, si el grupo los quiere.

Son ideas para discutir después de validar lectura. No son obligaciones para el primer desarrollo.
