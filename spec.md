# Comentarista Fantasy

Bot de Telegram y web para una liga privada de LaLiga Fantasy entre amigos.

Un solo proceso de Node hace todo: sondea la API de Fantasy, guarda el histórico
en SQLite, avisa por privado a cada manager de lo que hacen sus futbolistas,
comenta en el grupo cuando alguien cambia de puesto, y sirve la web.

## Qué hace

- Lee la liga con una cuenta de servicio de Fantasy. Solo peticiones GET.
- Guarda todo lo leído: puntos, plantillas, propiedad de cada futbolista,
  movimientos de la liga, mercado y valor de mercado diario.
- Avisa por privado de goles, asistencias y penaltis de los futbolistas de cada
  manager, y le manda un resumen cuando acaba cada partido.
- Publica en el grupo un comentario cuando alguien adelanta a otro. El texto lo
  redacta un modelo de lenguaje a partir de hechos ya calculados.
- Web con clasificación, plantillas, dinero, mercado, movimientos y evolución de
  precios, más la administración.

## Tecnología

| Pieza | Elección |
| --- | --- |
| Lenguaje | Node.js 22 |
| Base de datos | SQLite, el que trae Node, sin dependencia nativa |
| Servidor web | Express |
| Web | React con Vite, compilada a ficheros estáticos |
| Modelo de lenguaje | `claude-opus-5` a través de `@anthropic-ai/sdk` |

## Deployment

```
mode: compose
public_service: app
internal_port: 3000
healthcheck_path: /api/salud
host_port: 4139
domain: fantasybot.code-hive.space
compose_project: deployment_comentarista-fantasy
```

Un único servicio publicado. La base de datos vive en el volumen `datos`, montado
en `/datos`.

## Variables de entorno

Solo siembran la configuración la primera vez. Después mandan los valores que se
guarden desde el panel de administración, que están cifrados en la base de datos.

| Variable | Para qué | Obligatoria |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Contraseña inicial del administrador | Sí, la primera vez |
| `CLAVE_CIFRADO` | Clave con la que se cifran los secretos guardados | Recomendada |
| `FANTASY_EMAIL` | Correo de la cuenta de servicio | No, se puede poner en el panel |
| `FANTASY_PASSWORD` | Contraseña de la cuenta de servicio | No |
| `FANTASY_LIGA_ID` | Identificador de la liga | No |
| `FANTASY_MANAGER_SERVICIO` | Manager de la cuenta de servicio, para excluirla | No |
| `TELEGRAM_TOKEN` | Token del bot | No |
| `TELEGRAM_GRUPO` | Identificador del grupo | No |
| `ANTHROPIC_API_KEY` | Clave para el redactor | No |
| `URL_PUBLICA` | Dirección de la web, para los enlaces del bot | No |

Si falta `CLAVE_CIFRADO`, el proceso genera una y la guarda en el volumen. Perder
ese fichero significa tener que volver a escribir los secretos en el panel.

## Qué queda por configurar tras el despliegue

1. Token del bot de Telegram e identificador del grupo.
2. Clave de la API de Anthropic.
3. Presupuesto inicial de la liga, con la calibración de la página Dinero.
4. Dar de alta a cada amigo que vaya a entrar en la web.
