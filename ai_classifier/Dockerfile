# ai_classifier/Dockerfile
FROM python:3.9-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ПРЕДЗАГРУЗКА МОДЕЛИ - исправленный синтаксис
RUN python -c "from transformers import AutoTokenizer, AutoModel; import time; start = time.time(); print('📥 Pre-loading rubert-tiny2 model...'); tokenizer = AutoTokenizer.from_pretrained('cointegrated/rubert-tiny2'); model = AutoModel.from_pretrained('cointegrated/rubert-tiny2'); print(f'✅ Model pre-loaded in {time.time() - start:.2f}s')"

COPY classifier_service.py .

ENV PYTHONUNBUFFERED=1
ENV TRANSFORMERS_CACHE=/cache/huggingface
ENV HF_HOME=/cache/huggingface

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5001/health || exit 1

EXPOSE 5001

CMD ["python", "-u", "classifier_service.py"]