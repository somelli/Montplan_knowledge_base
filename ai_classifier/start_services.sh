#!/bin/bash

echo "🚀 Starting services with cached model..."

# Проверяем, существует ли volume с кэшем
if docker volume inspect ai_model_cache > /dev/null 2>&1; then
    echo "✅ Found model cache volume - model will load quickly"
else
    echo "📦 Creating model cache volume (first time only)"
fi

# Запускаем через docker-compose
docker-compose up -d

echo "⏳ Waiting for services to be ready..."

# Ждем health check от AI сервиса
for i in {1..30}; do
    if curl -s http://localhost:5001/health | grep -q '"model_loaded":true'; then
        echo "✅ AI service ready (model loaded from cache)"
        break
    fi
    echo "   Waiting for AI service... ($i/30)"
    sleep 1
done

echo "🎉 All services started!"

# Показать логи
docker-compose logs --tail=20