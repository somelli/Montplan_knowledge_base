// scripts/update_embeddings.js
const { neon } = require('@neondatabase/serverless');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

async function createEmbedding(text, isDocument = false) {
    const endpoint = isDocument ? '/embed-document' : '/embed';
    const aiServiceUrl = process.env.AI_CHAT_URL || 'http://chat-assistant:8000';
    
    try {
        const response = await fetch(`${aiServiceUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.substring(0, 4000) })
        });
        
        if (!response.ok) return null;
        const data = await response.json();
        return data.embedding;
    } catch (error) {
        console.error('Ошибка создания эмбеддинга:', error.message);
        return null;
    }
}

async function extractTextFromPdf(filePath) {
    const pdfParse = require('pdf-parse');
    
    try {
        const dataBuffer = await fs.readFile(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text.substring(0, 4000);
    } catch (error) {
        console.error('Ошибка извлечения текста:', error.message);
        return '';
    }
}

async function updateAllEmbeddings() {
    console.log('🔄 Начинаем обновление эмбеддингов...');
    
    // Получаем ВСЕ документы (не только с эмбеддингами)
    const documents = await sql`
        SELECT document_id, title, file_path 
        FROM documents
        WHERE is_archived = false
    `;
    
    console.log(`📊 Найдено документов: ${documents.length}`);
    
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const doc of documents) {
        console.log(`\n📄 [${updated + failed + skipped + 1}/${documents.length}] ${doc.title}`);
        
        // Полный путь к PDF
        const pdfPath = `/app${doc.file_path}`;
        console.log(`   📁 Путь: ${pdfPath}`);
        
        // Проверяем, существует ли файл
        try {
            await fs.access(pdfPath);
        } catch (err) {
            console.log(`   ⚠️ Файл не найден, пропускаем`);
            skipped++;
            continue;
        }
        
        // Извлекаем текст
        const text = await extractTextFromPdf(pdfPath);
        
        if (!text || text.length < 100) {
            console.log(`   ⚠️ Текст слишком короткий (${text?.length || 0} символов), пропускаем`);
            skipped++;
            continue;
        }
        
        console.log(`   📝 Текст извлечён: ${text.length} символов`);
        
        // Создаём эмбеддинг
        console.log(`   🔄 Создание эмбеддинга...`);
        const embedding = await createEmbedding(text, true);
        
        if (embedding && embedding.length === 1024) {
            // Обновляем в БД
            await sql`
                UPDATE documents 
                SET embedding = ${JSON.stringify(embedding)}::vector
                WHERE document_id = ${doc.document_id}
            `;
            console.log(`   ✅ Обновлён! (размер: ${embedding.length})`);
            updated++;
        } else {
            console.log(`   ❌ Не удалось создать эмбеддинг (размер: ${embedding?.length || 'null'})`);
            failed++;
        }
        
        // Пауза между запросами
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\n📊 РЕЗУЛЬТАТ:`);
    console.log(`   ✅ Обновлено: ${updated}`);
    console.log(`   ❌ Ошибок: ${failed}`);
    console.log(`   ⏭️ Пропущено: ${skipped}`);
    console.log(`   📊 Всего: ${documents.length}`);
    
    process.exit(0);
}

updateAllEmbeddings().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});