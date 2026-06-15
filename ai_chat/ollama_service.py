# ai_chat/ollama_service.py - ОБНОВЛЁННАЯ ВЕРСИЯ

import logging
import aiohttp
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from typing import Optional, List, Tuple
import uvicorn
import os
import re
import json
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

embedding_model = None
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")

CACHE_DIR = "/cache/huggingface"
os.makedirs(CACHE_DIR, exist_ok=True)

def capitalize_first_letter(text: str) -> str:
    if not text:
        return text
    return text[0].upper() + text[1:]

class EmbedRequest(BaseModel):
    text: str

class ChatRequest(BaseModel):
    question: str
    context: str
    document_title: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    confidence: float
    has_answer: bool
    document_title: Optional[str] = None

@app.on_event("startup")
async def load_models():
    global embedding_model
    
    logger.info("🚀 Загрузка модели для эмбеддингов...")
    try:
        embedding_model = SentenceTransformer(
            'intfloat/multilingual-e5-large',  # Лучше для русского
            cache_folder=CACHE_DIR
        )
        logger.info("✅ Модель эмбеддингов загружена")
    except Exception as e:
        logger.error(f"❌ Ошибка загрузки модели эмбеддингов: {e}")
        raise
    
    # Проверяем доступность Ollama
    logger.info(f"🔍 Проверка Ollama ({OLLAMA_URL})...")
    for i in range(30):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{OLLAMA_URL}/api/tags") as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        models = [m["name"] for m in data.get("models", [])]
                        logger.info(f"✅ Ollama доступен. Модели: {models}")
                        
                        if not any(OLLAMA_MODEL in m for m in models):
                            logger.info(f"📥 Загружаем модель {OLLAMA_MODEL}...")
                            async with session.post(f"{OLLAMA_URL}/api/pull", 
                                json={"name": OLLAMA_MODEL, "stream": False}) as pull_resp:
                                if pull_resp.status == 200:
                                    logger.info(f"✅ Модель {OLLAMA_MODEL} загружена")
                        return
        except Exception as e:
            logger.warning(f"Ожидание Ollama... ({i+1}/30)")
            await asyncio.sleep(1)
    
    logger.warning("⚠️ Ollama не доступен! Чат-бот не будет работать")

@app.get("/health")
async def health_check():
    ollama_ok = False
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{OLLAMA_URL}/api/tags") as resp:
                ollama_ok = resp.status == 200
    except:
        pass
    
    return {
        "status": "healthy" if embedding_model else "degraded",
        "embedding_model_loaded": embedding_model is not None,
        "ollama_available": ollama_ok,
        "ollama_model": OLLAMA_MODEL,
        "cache_dir": CACHE_DIR
    }

@app.post("/embed")
async def create_embedding(request: EmbedRequest):
    if embedding_model is None:
        raise HTTPException(status_code=503, detail="Модель не загружена")
    
    try:
        text = f"query: {request.text}"
        embedding = embedding_model.encode(text, normalize_embeddings=True)
        return {"embedding": embedding.tolist(), "dimensions": len(embedding)}
    except Exception as e:
        logger.error(f"Ошибка создания эмбеддинга: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/embed-document")
async def embed_document(request: EmbedRequest):
    if embedding_model is None:
        raise HTTPException(status_code=503, detail="Модель не загружена")
    
    try:
        text = f"passage: {request.text[:4000]}"
        embedding = embedding_model.encode(text, normalize_embeddings=True)
        return {"embedding": embedding.tolist(), "dimensions": len(embedding)}
    except Exception as e:
        logger.error(f"Ошибка создания эмбеддинга документа: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def query_ollama(question: str, context: str, document_title: str = None) -> Tuple[str, float]:
    """Отправляет запрос в Ollama и возвращает (ответ, уверенность)"""
    
    # 🔥 НОВЫЙ УЛУЧШЕННЫЙ ПРОМПТ
    system_prompt = """Ты — эксперт по анализу документов. Твоя задача — находить точные ответы на вопросы, даже если информация представлена косвенно или в сложной форме.

КЛЮЧЕВЫЕ ПРИНЦИПЫ:
1. ВНИМАТЕЛЬНО читай весь предоставленный документ
2. ИЩИ СМЫСЛ, а не отдельные слова — вопрос может быть перефразирован
3. Если информация ЕСТЬ — ОБЯЗАТЕЛЬНО её укажи, даже если она требует логического вывода
4. Используй синонимы и связанные понятия для поиска
5. Если информация ОТСУТСТВУЕТ — скажи "В документе нет информации об этом"
6. Приводи ЦИТАТЫ из документа, чтобы подтвердить ответ
7. Если информация частичная — укажи, что именно известно, а что нет

ФОРМАТ ОТВЕТА:
- Начинай с прямого ответа на вопрос
- Затем приведи цитату из документа в кавычках
- В конце укажи источник (название документа)"""

    user_prompt = f"""📄 Документ: {document_title if document_title else 'документ'}

📝 Содержание документа:
{context}

❓ Вопрос: {question}

📌 Инструкция:
1. Проанализируй содержание документа
2. Найди информацию, которая отвечает на вопрос (даже косвенно)
3. Если информации нет — сообщи об этом
4. Ответ должен быть точным и основанным ТОЛЬКО на документе

💬 Ответ:"""

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": user_prompt,
                    "system": system_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.2,  # Низкая температура для точности
                        "top_p": 0.85,
                        "top_k": 40,
                        "num_predict": 500,
                        "repeat_penalty": 1.15,
                        "stop": ["###", "Вопрос:", "Документ:"]
                    }
                },
                timeout=aiohttp.ClientTimeout(total=45)
            ) as resp:
                if resp.status != 200:
                    logger.error(f"Ollama error: {resp.status}")
                    return "Сервис временно недоступен", 0.0
                
                data = await resp.json()
                answer = data.get("response", "").strip()
                
                # Очищаем ответ от лишних префиксов
                answer = re.sub(r'^(Ответ:|💬 Ответ:|Ответ на вопрос:|Исходя из документа:|Согласно документу:)\s*', '', answer, flags=re.IGNORECASE)
                
                # Анализируем качество ответа
                has_negative = any(phrase in answer.lower() for phrase in [
                    "нет информации", "не указано", "не упоминается", 
                    "не найдено", "отсутствует", "не содержится"
                ])
                
                # Проверяем длину и содержание ответа
                if len(answer) > 50 and not has_negative:
                    confidence = 0.85
                elif len(answer) > 100:
                    confidence = 0.75
                elif has_negative and len(answer) < 100:
                    confidence = 0.2
                else:
                    confidence = 0.5
                
                return answer, confidence
                
    except asyncio.TimeoutError:
        logger.error("Ollama timeout")
        return "Превышено время ожидания ответа. Попробуйте упростить вопрос.", 0.0
    except Exception as e:
        logger.error(f"Ollama error: {e}")
        return f"Ошибка: {str(e)}", 0.0

@app.post("/chat")
async def chat(request: ChatRequest):
    if not request.context or len(request.context.strip()) < 50:
        return ChatResponse(
            answer=capitalize_first_letter("Недостаточно информации для ответа. Пожалуйста, загрузите документ с нужной информацией."),
            confidence=0.0,
            has_answer=False,
            document_title=request.document_title
        )
    
    try:
        # Увеличиваем контекст до 5000 символов для лучшего понимания
        context = request.context[:5000]
        answer, confidence = await query_ollama(
            request.question, 
            context, 
            request.document_title
        )
        
        has_answer = confidence > 0.3 and not any(
            phrase in answer.lower() 
            for phrase in ["нет информации", "не указано", "не упоминается", "не найдено"]
        )
        
        answer = capitalize_first_letter(answer)
        
        return ChatResponse(
            answer=answer,
            confidence=confidence,
            has_answer=has_answer,
            document_title=request.document_title
        )
        
    except Exception as e:
        logger.error(f"Ошибка при ответе на вопрос: {e}")
        return ChatResponse(
            answer=capitalize_first_letter("Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже."),
            confidence=0.0,
            has_answer=False,
            document_title=request.document_title
        )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)