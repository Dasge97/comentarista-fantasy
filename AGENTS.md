# Instrucciones para el agente que continúe

## Contexto y encargo

Este proyecto está en fase de exploración. El usuario quiere planificar un bot social de LaLiga Fantasy para su liga entre amigos. Ha pedido documentar la conversación y traspasarla a un agente que le ayude a probar la integración.

**Tu primera intervención debe comentar con él la primera prueba descrita en `docs/01-primera-prueba.md`. No empieces implementando el bot ni imponiendo una arquitectura.**

## Orden de lectura

1. `README.md`.
2. `docs/01-primera-prueba.md`.
3. `docs/03-integraciones-investigadas.md`.
4. Los documentos de visión, datos, eventos y decisiones.

## Primera conversación

Explica brevemente que vamos a usar una cuenta dedicada y comprobar la lectura con LaLigaApp. Averigua únicamente lo que hace falta para ese paso: si la cuenta ya existe y pertenece a su liga, y desde qué ordenador quiere hacer la prueba. Si el usuario ya te proporciona ese contexto, actúa con él; no vuelvas a preguntarlo.

Si la cuenta no existe, guíale para crearla desde Fantasy e invitarla a su liga. Si ya existe, pasa directamente a preparar la prueba de lectura. El usuario introduce sus secretos mediante el mecanismo seguro disponible; no pidas que publique contraseñas, tokens o enlaces OAuth con códigos en el chat o el repositorio.

## Acuerdos que debes conservar

- El objetivo inicial es una liga personal, sin comercialización actual.
- Se usará una cuenta dedicada por liga. Los demás participantes solo se identificarán desde Telegram.
- El usuario ha explicado que un miembro puede consultar los equipos y el mercado de la liga. Las integraciones revisadas respaldan la lectura transversal con una sesión.
- La cuenta dedicada se quedará con 11 suplentes y venderá los demás. No bloquear el trabajo por no existir un modo espectador. No ejecutar compras ni ventas sin una instrucción concreta del usuario; la primera prueba es de lectura.
- No reabrir el debate de que cada participante deba conectar su cuenta salvo evidencia real de un dato imprescindible inaccesible.
- Priorizar la reutilización de LaLigaApp. La documentación incluye otros proyectos como referencias.
- El framework, lenguaje, base de datos, alojamiento y alcance definitivo siguen abiertos.

## Conducta durante la validación

Separa siempre: capacidad encontrada en código, observación real y suposición. No marques como superada una prueba por existir una función o porque una interfaz muestre cero. No conviertas fallos de lectura en puntuaciones cero ni confirmes una clasificación con datos incompletos.

Una vez que el usuario acuerde avanzar con la prueba, resuelve de forma autónoma los pasos técnicos rutinarios autorizados. No pidas confirmación por cada lectura o ajuste reversible. La restricción de esta documentación es comenzar conversando sobre la prueba y mantener el alcance de exploración; no crear un circuito de aprobaciones innecesarias.

No actives módulos que pujen, vendan, paguen cláusulas o cambien alineaciones. No importes el agente autónomo de fantasybot como si fuera un lector inocuo. Si se ejecuta un proyecto de terceros, limita el trabajo al acceso y a las pantallas o llamadas acordadas.

## Entrega de la prueba

Cumplimenta `docs/plantilla-resultados-prueba.md` con fecha, versión/commit, capacidades comprobadas, limitaciones y evidencia sin secretos. La prueba manual puede demostrar lectura; no demuestra por sí sola actualización automática, latencia o renovación de sesión.

Presenta al usuario qué funciona, qué falta y cuál sería el siguiente paso. Después se podrá acordar una prueba técnica pequeña o el MVP. No interpretar este paquete como una orden de implementar todas las ideas del catálogo.
