# ai_chat/Dockerfile
FROM python:3.10-slim

WORKDIR /app

# Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Копируем requirements
COPY requirements.txt .

# Устанавливаем зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Создаем директорию для кэша моделей
RUN mkdir -p /cache/huggingface

# Копируем код (новое имя файла)
COPY ollama_service.py .

# Устанавливаем переменные окружения для кэша
ENV TRANSFORMERS_CACHE=/cache/huggingface
ENV HF_HOME=/cache/huggingface
ENV SENTENCE_TRANSFORMERS_HOME=/cache/huggingface
ENV OLLAMA_URL=http://ollama:11434
ENV OLLAMA_MODEL=qwen2.5:1.5b 

EXPOSE 8000

CMD ["python", "-u", "ollama_service.py"]