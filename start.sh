#!/bin/bash
echo "🔧 Сборка Docker образов..."
docker-compose build

echo "🚀 Запуск контейнеров..."
docker-compose up -d

echo "📊 Статус контейнеров:"
docker-compose ps

echo "✅ Готово! Сайт доступен по адресу: http://localhost"