# ai-classifier/classifier_service.py - ВСЕГДА МИНИМУМ 2 ТЕГА

import logging
import re
import time
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModel
from sklearn.metrics.pairwise import cosine_similarity
from PyPDF2 import PdfReader
import torch
import io
from collections import Counter
from typing import List, Dict, Any, Tuple
from functools import lru_cache

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class ClassifierWithMinTags:
    def __init__(self):
        logger.info("🚀 Инициализация классификатора...")
        
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Загружаем модель
        # self.load_model()
        
        # Данные из БД
        self.categories = []
        self.tags = []
        self.category_embeddings = {}
        self.tag_embeddings = {}
        
        # Кэш
        self.embedding_cache = {}
        
        # Минимальное количество тегов
        self.MIN_TAGS = 1
        self.load_model_sync()
        
        logger.info("✅ Классификатор готов")

    def load_model_sync(self):
        """Синхронная загрузка модели (быстро, т.к. модель уже в кэше)"""
        self.load_start_time = time.time()
        logger.info("🚀 Loading rubert-tiny2 model from cache...")
        
        try:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            model_name = "cointegrated/rubert-tiny2"
            
            # Загрузка из кэша - очень быстро!
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModel.from_pretrained(model_name).to(self.device)
            
            load_time = time.time() - self.load_start_time
            logger.info(f"✅ Model loaded in {load_time:.2f}s (from cache)")
            self.model_loaded = True
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise
    
    def get_embedding(self, text):
        """Быстрое получение эмбеддинга"""
        if not text or not self.model_loaded:
            return np.zeros(312)
            
        inputs = self.tokenizer(text[:512], return_tensors="pt", 
                                truncation=True, max_length=512).to(self.device)
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            embedding = outputs.last_hidden_state.mean(dim=1).cpu().numpy()[0]
        
        return embedding
    
    # def load_model(self):
    #     """Загрузка модели"""
    #     try:
    #         self.model_name = "cointegrated/rubert-tiny2"
    #         self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
    #         self.model = AutoModel.from_pretrained(self.model_name).to(self.device)
    #         logger.info(f"✅ Модель {self.model_name} загружена")
    #     except Exception as e:
    #         logger.error(f"Ошибка: {e}")
    #         raise
    
    def find_headers(self, lines: List[str]) -> List[str]:
        """Поиск заголовков на основе форматирования"""
        headers = []
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line or len(line) < 5:
                continue
            
            is_short = len(line) < 100
            uppercase_ratio = sum(1 for c in line if c.isupper()) / max(len(line), 1)
            has_many_uppercase = uppercase_ratio > 0.4
            ends_with_colon = line.endswith(':')
            has_number = bool(re.match(r'^(\d+\.?\d*|[А-Я][а-я]+ \d+)', line))
            is_at_top = i < 5
            
            if (is_short and has_many_uppercase) or ends_with_colon or has_number or is_at_top:
                headers.append(line)
        
        return headers[:10]
    
    def extract_text_from_pdf(self, pdf_bytes: bytes) -> Dict[str, Any]:
        """Извлечение текста с поиском заголовков"""
        try:
            pdf_file = io.BytesIO(pdf_bytes)
            reader = PdfReader(pdf_file)
            
            full_text = ""
            first_page_text = ""
            all_headers = []
            
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text:
                    full_text += page_text + " "
                    if i == 0:
                        first_page_text = page_text
                        lines = page_text.split('\n')
                        all_headers = self.find_headers(lines)
            
            full_text = re.sub(r'\s+', ' ', full_text).strip()
            headers_text = " ".join(all_headers) if all_headers else ""
            
            logger.info(f"📄 Найдено заголовков: {len(all_headers)}")
            
            return {
                "full_text": full_text[:4000],
                "first_page": first_page_text[:1000],
                "headers": headers_text[:500],
                "headers_list": all_headers[:5]
            }
        except Exception as e:
            logger.error(f"Ошибка: {e}")
            return {"full_text": "", "first_page": "", "headers": "", "headers_list": []}
    
    # def get_embedding(self, text: str) -> np.ndarray:
    #     """Получение эмбеддинга"""
    #     if not text:
    #         return np.zeros(312)
        
    #     cache_key = text[:200]
    #     if cache_key in self.embedding_cache:
    #         return self.embedding_cache[cache_key]
        
    #     inputs = self.tokenizer(text[:512], return_tensors="pt", truncation=True, max_length=512).to(self.device)
        
    #     with torch.no_grad():
    #         outputs = self.model(**inputs)
    #         embedding = outputs.last_hidden_state.mean(dim=1).cpu().numpy()[0]
        
    #     self.embedding_cache[cache_key] = embedding
    #     return embedding
    
    def update_knowledge_base(self, categories: List[str], tags: List[str]):
        """Обновление базы знаний"""
        self.categories = categories
        self.tags = tags
        
        self.category_embeddings = {}
        for cat in categories:
            self.category_embeddings[cat] = self.get_embedding(cat)
        
        self.tag_embeddings = {}
        for tag in tags:
            self.tag_embeddings[tag] = self.get_embedding(tag)
        
        logger.info(f"📚 База знаний: {len(categories)} категорий, {len(tags)} тегов")
    
    def classify_category(self, text_parts: Dict[str, Any]) -> Dict[str, Any]:
        """Классификация категории"""
        if not self.categories:
            return {"category": None, "confidence": 0}
        
        full_text = text_parts.get("full_text", "")
        headers = text_parts.get("headers", "")
        
        if headers:
            headers_embedding = self.get_embedding(headers)
            text_embedding = self.get_embedding(full_text)
            combined_embedding = headers_embedding * 0.6 + text_embedding * 0.4
        else:
            combined_embedding = self.get_embedding(full_text)
        
        scores = {}
        for category, cat_embedding in self.category_embeddings.items():
            similarity = cosine_similarity([combined_embedding], [cat_embedding])[0][0]
            scores[category] = float(similarity)
        
        best_category = max(scores, key=scores.get)
        confidence = scores[best_category]
        
        alternatives = sorted(
            [(cat, score) for cat, score in scores.items() if cat != best_category],
            key=lambda x: x[1],
            reverse=True
        )[:3]
        
        return {
            "category": best_category,
            "confidence": min(confidence, 0.95),
            "alternatives": alternatives
        }
    
    def extract_keywords_from_text(self, text: str, limit: int = 10) -> List[str]:
        """Извлечение ключевых слов из текста (для fallback тегов)"""
        # Очищаем текст
        if not text:
            return []
        
        text = text.lower()
        
        # Извлекаем слова длиной 4+ символов
        words = re.findall(r'\b[а-яa-z]{4,}\b', text)
        
        # Убираем стоп-слова (самые частые, бесполезные)
        stop_words = {'также', 'кроме', 'таким', 'образом', 'например', 'однако', 'является',
                      'который', 'которая', 'которые', 'которое', 'должен', 'должна',
                      'должны', 'может', 'могут', 'быть', 'этот', 'эта', 'это', 'эти',
                      'всех', 'все', 'свои', 'своей', 'свое', 'своих'}
        
        words = [w for w in words if w not in stop_words and len(w) > 3]
        
        # Частотный анализ
        word_freq = Counter(words)
        
        # Берем самые частые
        keywords = [word for word, count in word_freq.most_common(limit)]
        
        return keywords
    
    def suggest_tags(self, text_parts: Dict[str, Any], max_tags: int = 2) -> List[Dict[str, Any]]:
        """
        Предложение тегов - ВСЕГДА возвращает минимум MIN_TAGS тегов
        """
        result = []
        
        # 1. Сначала пробуем найти теги из БД
        if self.tags:
            full_text = text_parts.get("full_text", "")
            headers = text_parts.get("headers", "")
            
            combined_text = (headers + " " + full_text) if headers else full_text
            doc_embedding = self.get_embedding(combined_text[:1000])
            
            tag_scores = {}
            for tag, tag_embedding in self.tag_embeddings.items():
                similarity = cosine_similarity([doc_embedding], [tag_embedding])[0][0]
                
                # Бонус за вхождение в текст
                bonus = 0
                tag_lower = tag.lower()
                if tag_lower in full_text.lower():
                    bonus = 0.2
                if headers and tag_lower in headers.lower():
                    bonus = 0.3
                
                total = similarity * 0.7 + bonus
                if total > 0.2:  # Низкий порог, чтобы больше тегов попадало
                    tag_scores[tag] = min(total, 0.95)
            
            # Сортируем
            sorted_tags = sorted(tag_scores.items(), key=lambda x: x[1], reverse=True)
            
            for tag, score in sorted_tags[:max_tags]:
                result.append({
                    "name": tag,
                    "confidence": round(score, 2),
                    "is_new": False,
                    "source": "database"
                })
        
        # 2. Если не хватает тегов до MIN_TAGS, добавляем из текста
        if len(result) < self.MIN_TAGS:
            full_text = text_parts.get("full_text", "")
            headers = text_parts.get("headers", "")
            
            # Извлекаем ключевые слова (сначала из заголовков, потом из текста)
            header_keywords = self.extract_keywords_from_text(headers, limit=5) if headers else []
            text_keywords = self.extract_keywords_from_text(full_text, limit=10)
            
            # Комбинируем, заголовки важнее
            all_keywords = header_keywords + text_keywords
            unique_keywords = []
            seen = set()
            for kw in all_keywords:
                if kw not in seen and len(kw) > 3:
                    seen.add(kw)
                    unique_keywords.append(kw)
            
            # Добавляем недостающие теги
            for keyword in unique_keywords:
                if len(result) >= self.MIN_TAGS:
                    break
                
                # Проверяем, не дублируем ли существующий тег
                is_duplicate = False
                for existing in result:
                    if keyword in existing["name"].lower() or existing["name"].lower() in keyword:
                        is_duplicate = True
                        break
                
                if not is_duplicate:
                    result.append({
                        "name": keyword[:30],
                        "confidence": 0.5,
                        "is_new": True,
                        "source": "extracted"
                    })
        
        # 3. Если все еще нет тегов (например, нет текста), добавляем общие
        if len(result) < self.MIN_TAGS:
            fallback_tags = ["документ", "информация"]
            for tag in fallback_tags:
                if len(result) >= self.MIN_TAGS:
                    break
                result.append({
                    "name": tag,
                    "confidence": 0.3,
                    "is_new": True,
                    "source": "fallback"
                })
        
        # Обрезаем до max_tags
        result = result[:max_tags]
        
        logger.info(f"🏷️ Теги ({len(result)}): {[(t['name'], t['confidence'], t['source']) for t in result]}")
        return result
    
    def analyze_document(self, pdf_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Полный анализ документа"""
        text_parts = self.extract_text_from_pdf(pdf_bytes)
        
        if not text_parts.get("full_text") or len(text_parts["full_text"]) < 50:
            return {
                "success": False,
                "error": "Не удалось извлечь текст из PDF"
            }
        
        # Классифицируем категорию
        category_result = self.classify_category(text_parts)
        
        # Предлагаем теги (ВСЕГДА минимум 2)
        tags = self.suggest_tags(text_parts)
        
        # Убеждаемся, что есть минимум 2 тега
        while len(tags) < self.MIN_TAGS:
            tags.append({
                "name": f"тег_{len(tags) + 1}",
                "confidence": 0.3,
                "is_new": True,
                "source": "fallback"
            })
        
        return {
            "success": True,
            "analysis": {
                "category": {
                    "name": category_result["category"],
                    "confidence": category_result["confidence"],
                    "is_new": False,
                    "alternatives": category_result.get("alternatives", [])
                },
                "tags": tags[:2],  # Максимум 3 тега
                "confidence": category_result["confidence"],
                "is_high_confidence": category_result["confidence"] > 0.5,
                "headers_found": len(text_parts.get("headers_list", [])),
                "categories_available": len(self.categories),
                "tags_available": len(self.tags)
            }
        }

# Инициализация
classifier = ClassifierWithMinTags()

@app.route('/health', methods=['GET'])
def health():
    """Health check с информацией о модели"""
    return jsonify({
        "status": "ready" if classifier.model_loaded else "loading",
        "model_loaded": classifier.model_loaded,
        "categories_count": len(classifier.categories),
        "tags_count": len(classifier.tags),
        "model_name": "cointegrated/rubert-tiny2"
    })
@app.route('/update_kb', methods=['POST'])
def update_kb():
    data = request.json
    categories = data.get('categories', [])
    tags = data.get('tags', [])
    
    logger.info(f"📡 Обновление БЗ: {len(categories)} категорий, {len(tags)} тегов")
    classifier.update_knowledge_base(categories, tags)
    
    return jsonify({"success": True})

@app.route('/classify', methods=['POST'])
def classify():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file"}), 400
        
        file = request.files['file']
        result = classifier.analyze_document(file.read(), file.filename)
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Ошибка: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False,  threaded=True)