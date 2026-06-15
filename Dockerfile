# Dockerfile.backend
FROM node:20-slim

# Установка системных зависимостей для canvas
RUN apt-get update && \
    apt-get install -y \
        nginx \
        curl \
        build-essential \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
        gettext \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PORT=80

# Копируем package.json и устанавливаем зависимости
COPY backend/package*.json ./
RUN npm install
RUN npm install node-fetch@latest
RUN npm install resend
RUN npm install bcrypt

# Проверка, что нужные модули установлены
RUN node -e "require('pdfjs-dist')" && echo "✅ pdfjs-dist installed"
RUN node -e "require('canvas')" && echo "✅ canvas installed"

# Копируем бэкенд
COPY backend/ .

# Копируем фронтенд
COPY frontend/ /usr/share/nginx/html/

# Копируем документы
COPY documents/ /app/documents/
COPY previews/ /app/previews/

# Создаём директории и настраиваем права
RUN mkdir -p /var/log/nginx /run/nginx /app/documents /var/cache/nginx /var/cache/nginx/temp && \
    touch /var/log/nginx/access.log /var/log/nginx/error.log && \
    chown -R www-data:www-data /var/log/nginx /run/nginx /usr/share/nginx/html /app/documents /var/cache/nginx && \
    chmod -R 755 /var/log/nginx /run/nginx /usr/share/nginx/html /app/documents /var/cache/nginx

# Копируем шаблон конфига
COPY nginx/nginx.conf.template /etc/nginx/nginx.conf.template

EXPOSE 80 3000

RUN chown -R node:node /app/documents /app/previews

CMD sh -c "\
    envsubst '\$PORT' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && \
    node server.js & \
    while ! curl -s http://localhost:3000/api/health; do \
      echo '⏳ Waiting for Node.js...'; \
      sleep 1; \
    done; \
    echo '✅ Node.js ready, starting Nginx...'; \
    nginx -g 'daemon off;' \
"