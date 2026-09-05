# Comentarista Fantasy

Documentación de exploración y traspaso a un agente. Versión 0.1 · 5 de septiembre de 2026.

**Estado: planificación e investigación. No se ha implementado el bot ni probado una sesión autenticada de Fantasy.** Repositorio: [Dasge97/comentarista-fantasy](https://github.com/Dasge97/comentarista-fantasy). El nombre visible del bot de Telegram todavía no está elegido.

## Empieza aquí

Lee [AGENTS.md](AGENTS.md) y [la primera prueba](docs/01-primera-prueba.md). Tu primera conversación con el usuario debe tratar sobre preparar una cuenta dedicada en su liga y validar la lectura mediante LaLigaApp. Todavía no corresponde elegir framework, desarrollar el bot ni decidir todas sus funcionalidades.

El objetivo es convertir el grupo de Telegram de una liga entre amigos en una extensión viva de su competición: acontecimientos deportivos, puntos Fantasy, cambios de clasificación y comentarios que tienen sentido específicamente para sus managers.

## Decisiones ya acordadas

- Uso inicial personal, para la liga del usuario. No se está preparando una comercialización.
- Una cuenta dedicada de Fantasy dentro de esa liga proporciona el acceso. Los amigos no tienen que compartir sus credenciales.
- El usuario acepta dejar a esa cuenta con 11 suplentes de poco interés, vender los demás y mantenerla sin operar después. Es una solución práctica aceptada; no investigar un modo espectador como requisito previo.
- Se prioriza validar y aprovechar integraciones existentes. LaLigaApp es el principal candidato identificado.
- Telegram será la interfaz social: grupo para lo común y privado para avisos personales.
- No hay framework, lenguaje, infraestructura ni arquitectura definitiva elegidos.
- La primera prueba debe comentarse con el usuario antes de empezar a implementar el proyecto.

## Mapa de documentación

| Documento | Contenido |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Instrucciones de trabajo y de primera conversación |
| [01 · Primera prueba](docs/01-primera-prueba.md) | Preparación, comprobación manual y siguiente validación técnica |
| [02 · Visión y experiencia](docs/02-vision-y-experiencia.md) | Concepto, incorporación, grupo, privados y tono |
| [03 · Integraciones investigadas](docs/03-integraciones-investigadas.md) | Reutilización, código, licencias, endpoints y evidencias |
| [04 · Datos y comportamiento](docs/04-datos-y-comportamiento.md) | Responsabilidades y requisitos conceptuales, sin cerrar arquitectura |
| [05 · Catálogo de eventos](docs/05-catalogo-de-eventos.md) | Avisos deportivos, derivados, resúmenes y posibilidades sociales |
| [06 · Fases y decisiones](docs/06-fases-y-decisiones.md) | Alcance candidato, prioridades y registro de acuerdos |
| [07 · Fuentes](docs/07-fuentes.md) | Enlaces de investigación y límites de la evidencia |
| [Plantilla de resultados](docs/plantilla-resultados-prueba.md) | Registro pendiente de cumplimentar con una prueba real |

## Cómo interpretar este paquete

Los acuerdos del usuario son el punto de partida. Las propuestas son opciones que siguen abiertas. «Encontrado en código» significa que se ha leído una implementación; no certifica que funcione actualmente con una cuenta real.

Los ejemplos con Mbappé, Carlos, Dani, Sergio o Pepe son ilustrativos. Las cifras no proceden de una liga real. No se conocen aún el número de participantes ni las reglas concretas de vuestra liga.

## Resultado que buscamos primero

Una evidencia concreta: desde la sesión de la cuenta dedicada se pueden leer participantes, plantillas de rivales, alineaciones por jornada y puntos. Después se verificará su actualización durante un partido. Con esos resultados se decidirá junto al usuario cómo continuar.

Este paquete contiene documentación original, sin código copiado de los proyectos investigados, sin credenciales y sin resultados de pruebas inventados. No se ha elegido una licencia para el futuro proyecto.
