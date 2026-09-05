# Fases, prioridades y decisiones

## Orden acordado de trabajo

La prioridad cambió explícitamente durante la conversación: primero comprobar cuánto han resuelto las integraciones existentes y si podemos reutilizarlas. El siguiente agente debe conservar esa prioridad, aunque el catálogo de producto sea amplio.

| Fase | Trabajo | Resultado esperado | Estado |
| --- | --- | --- | --- |
| 0 · Traspaso | Documentar concepto, investigación y primera prueba | Este paquete en comentarista-fantasy | Documentado |
| 1 · Primera conversación | Revisar cuenta dedicada y entorno con el usuario | Prueba de lectura preparada | Pendiente |
| 2 · Lectura con LaLigaApp | Validar rivales, XI por jornada y puntos | Evidencia real de qué funciona | Pendiente |
| 3 · Ensayo técnico | Si se acuerda, lector pequeño y observación durante partido | Respuestas, actualización, renovación y límites comprobados | Propuesto |
| 4 · Plan del MVP | Elegir eventos, reglas y tecnología con el usuario | Alcance pequeño y criterios de aceptación | Abierto |
| 5 · Implementación | Construir el alcance acordado | Bot utilizable en su liga | No iniciada |
| 6 · Una jornada real | Observar utilidad, ruido y exactitud | Ajustes de avisos y experiencia | Futuro |

Si no hay partidos en la fase 2, se puede completar la lectura histórica y preparar la observación en directo. No declarar validada la actualización hasta observarla.

## MVP candidato, sin aprobar

- Vincular grupo con liga y usuarios con managers.
- Leer automáticamente el XI de la jornada.
- Detectar algunos acontecimientos relevantes y cruzarlos con el XI.
- Enviar privados y mensajes selectivos al grupo.
- Detectar cambios de puntos Fantasy.
- Excluir la cuenta de servicio de la narración de la competición.

Un primer alcance podría contener goles, rojas, diferencias de puntos, cambio de líder y resumen de partido. Es una posibilidad a decidir tras la prueba; no una orden de implementarlo todo.

## Criterios candidatos de éxito del producto

1. Un amigo no necesita introducir jugadores cada jornada ni conectar sus credenciales Fantasy.
2. Los avisos identifican correctamente quién tiene al jugador en el XI que puntúa.
3. Se distingue un evento deportivo de una actualización de puntos.
4. No hay goles, cambios de líder o avisos duplicados tras consultar o reiniciar.
5. Las correcciones y los datos incompletos se manejan sin inventar resultados.
6. El grupo percibe utilidad y pique sin saturación de mensajes.
7. El mantenimiento de la cuenta de servicio es asumible para uso personal.

No hay promesas de latencia, disponibilidad, presupuesto ni cobertura de todos los eventos antes de medirlos.

## Registro de decisiones del usuario

| ID | Decisión | Consecuencia |
| --- | --- | --- |
| D01 | Explorar y documentar antes de programar | No crear aplicación, stack o arquitectura definitiva todavía |
| D02 | Crear una experiencia social viva en Telegram | Los eventos contextuales son el centro del producto |
| D03 | Investigar seriamente endpoints privados existentes | Priorizar lectura de código y prueba sobre conjeturas |
| D04 | Una cuenta dedicada por liga es aceptable | No requerir autorización Fantasy individual de los amigos |
| D05 | Uso actual en su liga, sin comercialización | No anteponer multitenencia, facturación o escalado comercial |
| D06 | Dejar 11 suplentes y vender el resto | Compromiso práctico aceptado para la cuenta de servicio |
| D07 | Documentar para otro agente | El traspaso debe ser autónomo y explicar la evidencia pendiente |
| D08 | La primera prueba es lo primero que el agente debe comentar | Instrucción explícita en AGENTS.md y documento 01 |
| D09 | Publicar documentación en comentarista-fantasy | Repositorio facilitado por el usuario: Dasge97/comentarista-fantasy |

## Orientaciones propuestas, no decisiones cerradas

LaLigaApp como base preferente de lectura; adaptación detrás de una capa conceptual FantasyProvider; clasificación editable en Telegram; agrupación de eventos; preferencias privadas; retraso contra spoilers; confirmación de vinculación por administrador; exclusión de la cuenta de servicio de la clasificación narrada.

La exclusión del servicio es especialmente recomendable: al excluirlo, las posiciones mostradas por el bot podrían diferir del ranking que incluye esa cuenta en Fantasy. Explicar el alcance en la interfaz futura.

## Preguntas abiertas por momento

### Ahora, para la primera prueba

- ¿Existe ya la cuenta dedicada y pertenece a la liga?
- ¿Qué ordenador/entorno se usará?
- ¿Qué versión de LaLigaApp se ejecutará?

### Después de la lectura

- ¿Cuáles de los datos funcionan y con qué formato/alcance?
- ¿El XI en curso y el histórico están accesibles para todos los rivales?
- ¿Qué representan los puntos semanales y generales?
- ¿Las estadísticas de Fantasy bastan para algunos eventos o hace falta proveedor externo?
- ¿Cómo se comporta la sesión a lo largo del tiempo?

### Al elegir el MVP

- Número real de managers, exclusividad de jugadores y reglas premium.
- Qué avisos privados y públicos quiere el grupo, tono y volumen.
- Necesidad de retraso para emisiones con demora.
- Presupuesto si se necesita una API deportiva de pago.
- Lenguaje, framework, almacenamiento y despliegue.
- Cómo realizar y corregir las asociaciones de Telegram.

Estas preguntas no son un formulario a presentar de golpe. Resolver cada una cuando afecte al paso siguiente.

## Riesgos concretos y respuesta prevista

| Riesgo | Respuesta proporcional |
| --- | --- |
| Cambio de endpoints privados | Aislar integración, fijar versión usada y validar respuesta |
| Código encontrado pero no operativo | Primera prueba real antes de planificar implementación |
| Fallo parcial que parece puntuación cero | Registrar dato desconocido y suspender comparaciones afectadas |
| Login o renovación manual frecuente | Medirlo con la cuenta de servicio y ajustar operación |
| Datos deportivos costosos o lentos | Medir cuota y latencia; empezar con eventos que puedan sostenerse |
| Exceso de mensajes | Elegir prioridades y agrupar acontecimientos |
| Licencia incompatible con la forma de reutilizar | Revisar licencia del componente concreto antes de incorporarlo |
| Ampliación prematura del alcance | Mantener una liga y un conjunto pequeño acordado |

## Fuera del encargo actual

Automatizar fichajes, ventas o cambios del XI; comercializar; desarrollar una plataforma SaaS; elegir infraestructura definitiva; crear bots/cuentas por el usuario; contratar APIs; desplegar una aplicación; enviar mensajes a terceros. La subida de esta documentación al repositorio sí está autorizada.
