# La versión de Node está fijada a propósito: el SQLite integrado que usa el
# proyecto está marcado como experimental, así que no conviene que la versión
# cambie sola entre despliegues.
FROM node:22.19-alpine AS web

WORKDIR /construccion
COPY web/package.json web/package-lock.json* ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && npm run build


FROM node:22.19-alpine

# Zona horaria de España, para que las horas de los registros y de los
# partidos se lean como se esperan.
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Europe/Madrid /etc/localtime && \
    echo "Europe/Madrid" > /etc/timezone
ENV TZ=Europe/Madrid
ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY --from=web /construccion/web/dist ./web/dist

# La base de datos y la sesión viven en un volumen, para que sobrevivan a
# los redespliegues.
ENV DATOS_DIR=/datos
RUN mkdir -p /datos && chown -R node:node /datos /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/salud || exit 1

# --no-warnings silencia el aviso de que el SQLite de Node es experimental.
# Ya se sabe: por eso la versión de Node está fijada arriba.
CMD ["node", "--no-warnings", "src/index.js"]
