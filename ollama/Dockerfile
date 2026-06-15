FROM ollama/ollama:latest

# Устанавливаем curl для healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Проверяем, что ollama в PATH
RUN which ollama

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:11434/api/tags || exit 1

# Ollama запускается автоматически из базового образа
# Не нужно добавлять CMD, он уже есть в базовом образе