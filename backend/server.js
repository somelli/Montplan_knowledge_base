// server.js
require('dotenv').config();
const express = require('express');
const app = express();
const pdfjsLib = require('pdfjs-dist');
const { promises: fsPromises } = require('fs');
const path = require('path');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const bcrypt = require('bcrypt');
const pdfParse = require('pdf-parse');

// ========== ФУНКЦИИ ДЛЯ ЧАТА ==========
async function extractTextFromPdf(filePath, maxLength = 5000) {
    try {
        const dataBuffer = await fsPromises.readFile(filePath);
        const data = await pdfParse(dataBuffer, {
            // Сохраняем структуру абзацев
            pagerender: function(pageData) {
                return pageData.getTextContent()
                    .then(function(textContent) {
                        let lastY, text = '';
                        for (let item of textContent.items) {
                            if (lastY !== item.transform[5] && text) {
                                text += '\n';
                            }
                            text += item.str;
                            lastY = item.transform[5];
                        }
                        return text;
                    });
            }
        });
        
        let fullText = data.text;
        
        // Очищаем от лишних пробелов
        fullText = fullText.replace(/\s+/g, ' ').trim();
        
        // Разбиваем на смысловые блоки (абзацы)
        const paragraphs = fullText.split(/\n\s*\n/);
        
        if (fullText.length <= maxLength) {
            return fullText;
        }
        
        // Умный отбор: берём абзацы, которые наиболее релевантны вопросу
        // (это будет использоваться при поиске)
        return fullText.slice(0, maxLength);
        
    } catch (error) {
        console.error('Ошибка извлечения текста:', error);
        return '';
    }
}

function extractRelevantContext(fullText, question, maxLength = 5000) {
    if (!fullText || fullText.length <= maxLength) {
        return fullText;
    }
    
    // Разбиваем на предложения
    const sentences = fullText.split(/[.!?]+/);
    
    // Извлекаем ключевые слова из вопроса (включая синонимы)
    const questionLower = question.toLowerCase();
    const keywords = questionLower.split(/\s+/).filter(w => w.length > 3);
    
    // Оцениваем каждое предложение
    const scoredSentences = sentences.map(sentence => {
        const sentenceLower = sentence.toLowerCase();
        let score = 0;
        
        for (const keyword of keywords) {
            if (sentenceLower.includes(keyword)) {
                score += 2; // Прямое совпадение
            }
            // Проверяем схожие слова (можно улучшить с помощью word2vec)
            if (sentenceLower.includes(keyword.slice(0, -2))) {
                score += 1; // Частичное совпадение
            }
        }
        
        // Бонус за длину предложения (вероятность, что оно содержит информацию)
        score += Math.min(sentence.length / 200, 1);
        
        return { sentence, score };
    });
    
    // Сортируем по релевантности
    scoredSentences.sort((a, b) => b.score - a.score);
    
    // Берём топ предложения, пока не наберём maxLength
    let context = '';
    for (const { sentence } of scoredSentences) {
        if (context.length + sentence.length + 2 > maxLength) break;
        if (sentence.trim().length > 20) { // Игнорируем очень короткие предложения
            context += sentence.trim() + '. ';
        }
    }
    
    return context || fullText.slice(0, maxLength);
}


async function createEmbedding(text, isDocument = false) {
    const endpoint = isDocument ? '/embed-document' : '/embed';
    const aiServiceUrl = process.env.AI_CHAT_URL || 'http://chat-assistant:8000';
    
    try {
        const response = await fetch(`${aiServiceUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });
        
        if (!response.ok) return null;
        const data = await response.json();
        return data.embedding;
    } catch (error) {
        console.error('Ошибка создания эмбеддинга:', error);
        return null;
    }
}


// --- СНАЧАЛА создаём сервер и io ---
const server = app.listen(3000, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:3000`);
});

app.use((req, res, next) => {
    console.log('🌐 Incoming request:', req.method, req.path);
    next();
});

// 🔥 АВТООПРЕДЕЛЕНИЕ: Render или локально?
const IS_RENDER = process.env.RENDER === 'true' || 
                  process.env.NODE_ENV === 'production' ||
                  process.env.RENDER_SERVICE_ID !== undefined;

const PORT = process.env.PORT || 3000;

// 🔧 Принудительно используем /app как корень на Render
const PROJECT_ROOT = '/app';

console.log('🔧 PROJECT_ROOT:', PROJECT_ROOT);

// Пути к папкам
const DOCUMENTS_PATH = path.join(PROJECT_ROOT, 'documents');
const PREVIEWS_PATH = path.join(PROJECT_ROOT, 'previews');

console.log('📁 DOCUMENTS_PATH:', DOCUMENTS_PATH);
console.log('📁 PREVIEWS_PATH:', PREVIEWS_PATH);

// ✅ Создаём папки при старте сервера
const fs = require('fs');
[DOCUMENTS_PATH, PREVIEWS_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) {
        console.log(`📁 Создаём папку: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
    } else {
        console.log(`📁 Папка уже существует: ${dir}`);
    }
});

const session = require('express-session');
const { neon } = require('@neondatabase/serverless');
const nodemailer = require('nodemailer');

// Инициализация Neon
const sql = neon(process.env.DATABASE_URL);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/documents', express.static(DOCUMENTS_PATH));
app.use('/previews', express.static(PREVIEWS_PATH));


// --- Middleware для загрузки файлов ---
const multer = require('multer');

// В роуте загрузки файлов:
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, DOCUMENTS_PATH);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.pdf';
        cb(null, uniqueName);
    }
});

// Настройка сессий для работы через прокси
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // true для HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
  }
}));

// Добавь в начало файла, после других импортов
try {
    const { createCanvas } = require('canvas');
    console.log('✅ Canvas успешно загружен');
} catch (err) {
    console.error('❌ Ошибка загрузки canvas:', err.message);
}

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
      res.status(401).json({ error: 'Требуется авторизация' });
  }
}

// Middleware для проверки администратора
function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.isAdmin) {
        next();
    } else {
        res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора' });
    }
}

// // Настройка хранилища
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//         cb(null, 'documents/'); // папка uploads должна существовать
//     },
//     filename: (req, file, cb) => {
//         const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
//         cb(null, uniqueName);
//     }
// });

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // макс. 10 МБ
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf/;
        const ext = path.extname(file.originalname).toLowerCase();
        const mime = allowedTypes.test(ext);
        if (mime) {
            cb(null, true);
        } else {
            cb(new Error('Недопустимый тип файла'));
        }
    }
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', backend: 'running' });
});

app.get('/test-preview', async (req, res) => {
    try {
        const files = await fsPromises.readdir(PREVIEWS_PATH);
        res.json({
            message: 'Папка previews доступна',
            files: files
        });
    } catch (err) {
        res.status(500).json({
            error: 'Не удалось прочитать папку previews',
            path: PREVIEWS_PATH,
            exists: require('fs').existsSync(PREVIEWS_PATH)
        });
    }
});

async function generatePdfPreview(pdfPath, outputPath) {
    try {
        const data = new Uint8Array(await fsPromises.readFile(pdfPath));

        const pdf = await pdfjsLib.getDocument({ data }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 4 }); // Увеличим масштаб

        const { createCanvas } = require('canvas');
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        const buffer = canvas.toBuffer('image/png');
        await fsPromises.writeFile(outputPath, buffer);

        console.log(`✅ Превью создано: ${outputPath}`);
        return true;
    } catch (error) {
        console.error('❌ Ошибка генерации превью:', error.message);
        console.error('Stack:', error.stack);
        return false;
    }
}

// ========== ОБНОВЛЁННЫЙ ЭНДПОИНТ ЗАГРУЗКИ ==========
app.post('/api/upload', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Файл не загружен' });
        }

        const { title, category_id, tag_ids } = req.body;
        const filePath = `/documents/${req.file.filename}`;

        let tagIds = [];
        try {
            tagIds = JSON.parse(tag_ids);
        } catch (e) {
            tagIds = [];
        }

        // ИЗВЛЕКАЕМ ТЕКСТ ИЗ PDF
        const pdfText = await extractTextFromPdf(req.file.path);
        console.log(`📄 Извлечено текста: ${pdfText.length} символов`);
        
        let embedding = null;
        
        if (pdfText && pdfText.length > 100) {
            embedding = await createEmbedding(pdfText, true);
            if (embedding) {
                console.log(`✅ Эмбеддинг создан, размер: ${embedding.length}`);
            } else {
                console.warn('⚠️ Не удалось создать эмбеддинг');
            }
        } else {
            console.warn('⚠️ Текст слишком короткий для эмбеддинга');
        }

        // Генерация превью
        let previewImagePath = null;
        const filenameWithoutExt = path.basename(req.file.filename, path.extname(req.file.filename));
        const previewFileName = `preview-${filenameWithoutExt}.png`;
        const previewFullPath = path.join(PREVIEWS_PATH, previewFileName);

        try {
            const success = await generatePdfPreview(req.file.path, previewFullPath);
            if (success) {
                previewImagePath = `/previews/${previewFileName}`;
            }
        } catch (err) {
            console.error('Ошибка генерации превью:', err.message);
        }

        // Сохраняем в БД
        let docResult;
        if (embedding) {
            // Сохраняем с эмбеддингом
            docResult = await sql`
                INSERT INTO documents (title, file_path, upload_date, category_id, is_archived, preview_image, embedding)
                VALUES (${title}, ${filePath}, NOW(), ${category_id}, false, ${previewImagePath}, ${JSON.stringify(embedding)}::vector)
                RETURNING document_id
            `;
            console.log(`✅ Документ сохранён с эмбеддингом, ID: ${docResult[0].document_id}`);
        } else {
            // Сохраняем без эмбеддинга
            docResult = await sql`
                INSERT INTO documents (title, file_path, upload_date, category_id, is_archived, preview_image)
                VALUES (${title}, ${filePath}, NOW(), ${category_id}, false, ${previewImagePath})
                RETURNING document_id
            `;
            console.log(`⚠️ Документ сохранён БЕЗ эмбеддинга, ID: ${docResult[0].document_id}`);
        }

        const docId = docResult[0].document_id;

        // Привязываем теги
        if (tagIds.length > 0) {
            const tagInserts = tagIds.map(tagId => sql`
                INSERT INTO document_tags (document_id, tag_id)
                VALUES (${docId}, ${parseInt(tagId)})
                ON CONFLICT DO NOTHING
            `);
            await Promise.all(tagInserts);
        }

        const [docData] = await sql`
            SELECT 
                d.document_id AS id,
                d.title,
                d.file_path AS "filePath",
                d.upload_date AS "uploadDate",
                d.preview_image AS "previewImage",
                c.name AS category,
                COALESCE(ARRAY_AGG(t.name) FILTER (WHERE t.name IS NOT NULL), ARRAY[]::TEXT[]) AS tags
            FROM documents d
            LEFT JOIN categories c ON d.category_id = c.category_id
            LEFT JOIN document_tags dt ON d.document_id = dt.document_id
            LEFT JOIN tags t ON dt.tag_id = t.tag_id
            WHERE d.document_id = ${docId}
            GROUP BY d.document_id, c.name
        `;

        res.json({ success: true, message: 'Документ загружен', document: docData });

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Получение или создание роли по имени
async function getOrCreateRole(roleName, sql) {
    // Проверяем, существует ли роль
    const existing = await sql`
        SELECT role_id FROM roles 
        WHERE LOWER(role_name) = ${roleName.trim().toLowerCase()}
    `;
    if (existing.length > 0) {
        return existing[0];
    }

    // Создаём новую роль
    const newRole = await sql`
        INSERT INTO roles (role_name)
        VALUES (${roleName.trim()})
        RETURNING role_id
    `;
    return newRole[0];
}

// ========== РОУТЫ ==========

// API для получения пользователя
app.get('/api/user', (req, res) => {
  if (req.session.user) {
    res.json({ 
      user: req.session.user,
      isAdmin: req.session.user.isAdmin || false
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// API для получения навигации
app.get('/api/navigation', requireAuth, (req, res) => {
  const isAdmin = req.session.user.isAdmin || false;
  
  const navItems = [
    {
      id: 'documentation',
      title: 'Документация',
      icon: './src/image/documentation.png',
      href: './template.html',
      active: true
    },
    {
      id: 'account',
      title: 'Аккаунт',
      icon: './src/image/account.png',
      href: './account.html'
    },
    {
      id: 'favourites',
      title: 'Избранное',
      icon: './src/image/favourites.png',
      href: './favourites.html'
    },
    {
      id: 'settings',
      title: 'Настройки',
      icon: './src/image/settings.png',
      href: './settings.html'
    }
  ];
  
  // Добавляем управление для администратора
  if (isAdmin) {
    const adminItems = [
      {
        id: 'download',
        title: 'Загрузить',
        icon: './src/image/download.png',
        href: './uploading_documents.html',
        adminOnly: true
      },
      {
        id: 'management',
        title: 'Управление',
        icon: './src/image/management.png',
        href: './management.html',
        adminOnly: true
      },
      {
        id: 'archive',
        title: 'Архив',
        icon: './src/image/archive.png',
        href: './archive.html',
        adminOnly: true
      }
    ];
    
    navItems.splice(2, 0, ...adminItems);
  }
  
  res.json({ 
    navigation: navItems,
    isAdmin: isAdmin
  });
});

// Получение списка ролей из БД
app.get('/api/admin/roles', requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log('🔹 Запрос на получение ролей');

        const roles = await sql`
            SELECT *
            FROM roles 
            ORDER BY role_name
        `;
        console.log('🔹 Роли из БД:', roles); // ← смотрим, что вернулось

        if (!roles || roles.length === 0) {
            console.log('🔸 Таблица roles пустая');
            return res.json([]); // явно возвращаем пустой массив
        }

        res.json(roles);
        
    } catch (error) {
        console.error('❌ Ошибка при получении ролей:', error.message);
        console.error('Stack:', error.stack);
        
        res.status(500).json({ 
            error: 'Не удалось загрузить роли',
            details: error.message
        });
    }
});

// Создание пользователя
// Создание пользователя
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { full_name, email, password, role } = req.body;

        // Валидация обязательных полей
        if (!full_name || !email || !password || !role) {
            return res.status(400).json({
                errors: {
                    full_name: !full_name ? ['Имя обязательно'] : [],
                    email: !email ? ['Email обязателен'] : [],
                    password: !password ? ['Пароль обязателен'] : [],
                    role: !role ? ['Роль обязательна'] : []
                }
            });
        }

        const userEmail = email.trim().toLowerCase();

        // Проверка на существование пользователя
        const existingUser = await sql`
            SELECT * FROM users 
            WHERE email = ${userEmail}
        `;
        if (existingUser.length > 0) {
            return res.status(400).json({
                errors: {
                    email: ['Пользователь с таким email уже существует']
                }
            });
        }

        // Получаем или создаём роль по имени
        let roleId;
        try {
            const roleRecord = await getOrCreateRole(role, sql);
            roleId = roleRecord.role_id;
        } catch (err) {
            console.error('Ошибка при создании роли:', err);
            return res.status(500).json({
                errors: {
                    role: ['Не удалось создать роль']
                }
            });
        }

        // Хеширование пароля (временно без bcrypt)
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        console.log('🔐 Пароль захеширован');

        // Создаём пользователя
        const newUser = await sql`
            INSERT INTO users (full_name, email, password_hash)
            VALUES (${full_name}, ${userEmail}, ${passwordHash})
            RETURNING user_id, full_name, email
        `;

        const userId = newUser[0].user_id;

        console.log('✅ Пользователь создан:', { userId, full_name, email });

        // Назначаем роль
        await sql`
            INSERT INTO user_roles (user_id, role_id)
            VALUES (${userId}, ${roleId})
        `;

        res.json({
            success: true,
            message: 'Пользователь успешно добавлен',
            user_id: userId
        });

    } catch (error) {
        console.error('❌ Ошибка при создании пользователя:', error.message);
        console.error('Stack:', error.stack);

        res.status(500).json({
            errors: {
                server: ['Внутренняя ошибка сервера']
            }
        });
    }
});

// Создание новой категории
app.post('/api/admin/categories', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name } = req.body;

        // Валидация
        if (!name || typeof name !== 'string') {
            return res.status(400).json({
                message: 'Название категории обязательно'
            });
        }

        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            return res.status(400).json({
                message: 'Название категории не может быть пустым'
            });
        }

        // Проверка на дубликат (регистронезависимо)
        const existing = await sql`
            SELECT * FROM categories 
            WHERE LOWER(name) = ${trimmedName.toLowerCase()}
        `;

        if (existing.length > 0) {
            return res.status(400).json({
                message: 'Категория с таким названием уже существует'
            });
        }

        // Вставка в базу
        const result = await sql`
            INSERT INTO categories (name)
            VALUES (${trimmedName})
            RETURNING category_id, name
        `;

        console.log('✅ Категория добавлена:', result[0]);

        await syncAIServiceKnowledgeBase();

        // Успешный ответ
        res.status(201).json({
            success: true,
            message: 'Категория успешно добавлена',
            category: result[0]
        });

    } catch (error) {
        console.error('Ошибка при добавлении категории:', error);
        res.status(500).json({
            message: 'Ошибка сервера при добавлении категории'
        });
    }
});

// Создание нового тега
app.post('/api/admin/tags', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name } = req.body;

        // Валидация
        if (!name || typeof name !== 'string') {
            return res.status(400).json({
                message: 'Название категории обязательно'
            });
        }

        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            return res.status(400).json({
                message: 'Название тега не может быть пустым'
            });
        }

        // Проверка на дубликат (регистронезависимо)
        const existing = await sql`
            SELECT * FROM tags 
            WHERE LOWER(name) = ${trimmedName.toLowerCase()}
        `;

        if (existing.length > 0) {
            return res.status(400).json({
                message: 'Тег с таким названием уже существует'
            });
        }

        // Вставка в базу
        const result = await sql`
            INSERT INTO tags (name)
            VALUES (${trimmedName})
            RETURNING tag_id, name
        `;

        console.log('✅ Тег добавлен:', result[0]);

        await syncAIServiceKnowledgeBase();

        // Успешный ответ
        res.status(201).json({
            success: true,
            message: 'Тег успешно добавлен',
            category: result[0]
        });

    } catch (error) {
        console.error('Ошибка при добавлении тега:', error);
        res.status(500).json({
            message: 'Ошибка сервера при добавлении тега'
        });
    }
});

// Создание новой роли
app.post('/api/admin/roles', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name } = req.body;

        // Валидация
        if (!name || typeof name !== 'string') {
            return res.status(400).json({
                message: 'Название роли обязательно'
            });
        }

        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            return res.status(400).json({
                message: 'Название роли не может быть пустым'
            });
        }

        // Проверка на дубликат (регистронезависимо)
        const existing = await sql`
            SELECT * FROM roles 
            WHERE LOWER(role_name) = ${trimmedName.toLowerCase()}
        `;

        if (existing.length > 0) {
            return res.status(400).json({
                message: 'Роль с таким названием уже существует'
            });
        }

        // Вставка в базу
        const result = await sql`
            INSERT INTO roles (role_name)
            VALUES (${trimmedName})
            RETURNING role_id, role_name
        `;

        console.log('✅ Роль добавлена:', result[0]);

        // Успешный ответ
        res.status(201).json({
            success: true,
            message: 'Роль успешно добавлена',
            category: result[0]
        });

    } catch (error) {
        console.error('Ошибка при добавлении роли:', error);
        res.status(500).json({
            message: 'Ошибка сервера при добавлении роли'
        });
    }
});

// Получение одного пользователя по ID (для редактирования)
app.get('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Получаем пользователя с его ролью
        const result = await sql`
            SELECT 
                u.user_id,
                u.full_name,
                u.email,
                ARRAY_AGG(r.role_name) as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.user_id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.role_id
            WHERE u.user_id = ${id}
            GROUP BY u.user_id
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = result[0];
        
        res.json({
            user_id: user.user_id,
            full_name: user.full_name,
            email: user.email,
            roles: user.roles.filter(role => role !== null),
            role_name: user.roles.filter(role => role !== null)[0] || ''
        });

    } catch (error) {
        console.error('Ошибка при получении пользователя:', error);
        res.status(500).json({ error: 'Не удалось загрузить данные пользователя' });
    }
});

// Редактирование пользователя
app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, role } = req.body;

        // Валидация
        if (!full_name) {
            return res.status(400).json({
                error: 'Имя обязательно'
            });
        }

        // Проверка существования пользователя
        const userCheck = await sql`
            SELECT * FROM users WHERE user_id = ${id}
        `;
        if (userCheck.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Обновляем пользователя
        await sql`
            UPDATE users
            SET full_name = ${full_name}
            WHERE user_id = ${id}
        `;

        // Обновляем роль
        if (role) {
            const roleId = parseInt(role, 10);
            if (isNaN(roleId)) {
                return res.status(400).json({ error: 'Неверный ID роли' });
            }

            await sql`
                DELETE FROM user_roles WHERE user_id = ${id}
            `;
            await sql`
                INSERT INTO user_roles (user_id, role_id)
                VALUES (${id}, ${roleId})
            `;
        }

        res.json({
            success: true,
            message: 'Пользователь успешно обновлён'
        });

    } catch (error) {
        console.error('Ошибка при редактировании пользователя:', error);
        res.status(500).json({
            error: 'Не удалось обновить пользователя'
        });
    }
});

// Удаление пользователя
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Проверяем, существует ли пользователь
        const existing = await sql`
            SELECT * FROM users WHERE user_id = ${id}
        `;
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Удаляем связи с ролями
        await sql`
            DELETE FROM user_roles WHERE user_id = ${id}
        `;

        // Удаляем пользователя
        await sql`
            DELETE FROM users WHERE user_id = ${id}
        `;

        console.log(`✅ Пользователь с ID ${id} удалён`);

        res.json({ success: true, message: 'Пользователь успешно удалён' });
    } catch (error) {
        console.error('Ошибка при удалении пользователя:', error);
        res.status(500).json({ message: 'Ошибка сервера при удалении пользователя' });
    }
});

// Получение одной категории по ID (для редактирования)
app.get('/api/admin/categories/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Получаем категорию
        const result = await sql`
            SELECT 
                c.category_id,
                c.name
            FROM categories c
            WHERE c.category_id = ${id}
            GROUP BY c.category_id
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: 'Категория не найдена' });
        }

        const category = result[0];
        
        res.json({
            category_id: category.category_id,
            name: category.name
        });

    } catch (error) {
        console.error('Ошибка при получении пользователя:', error);
        res.status(500).json({ error: 'Не удалось загрузить данные пользователя' });
    }
});

// Редактирование категории
app.put('/api/admin/categories/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        // Валидация
        if (!name) {
            return res.status(400).json({
                error: 'Имя обязательно'
            });
        }

        // Проверка существования категории
        const categoryCheck = await sql`
            SELECT * FROM categories WHERE category_id = ${id}
        `;
        if (categoryCheck.length === 0) {
            return res.status(404).json({ error: 'Категория не найдена' });
        }

        // Обновляем категорию
        await sql`
            UPDATE categories
            SET name = ${name}
            WHERE category_id = ${id}
        `;

        await syncAIServiceKnowledgeBase();

        res.json({
            success: true,
            message: 'Категория успешно обновлёна'
        });

    } catch (error) {
        console.error('Ошибка при редактировании категории:', error);
        res.status(500).json({
            error: 'Не удалось обновить категорию'
        });
    }
});

// Удаление категории
app.delete('/api/admin/categories/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Проверяем, существует ли категория
        const existing = await sql`
            SELECT * FROM categories WHERE category_id = ${id}
        `;
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Категория не найдена' });
        }

        // Удаляем категорию
        await sql`
            DELETE FROM categories WHERE category_id = ${id}
        `;

        await syncAIServiceKnowledgeBase();

        console.log(`✅ Категория с ID ${id} удалёна`);

        res.json({ success: true, message: 'Категория успешно удалёна' });
    } catch (error) {
        console.error('Ошибка при удалении категории:', error);
        res.status(500).json({ message: 'Ошибка сервера при удалении категории' });
    }
});

// Получение одного тега по ID (для редактирования)
app.get('/api/admin/tags/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Получаем категорию
        const result = await sql`
            SELECT 
                t.tag_id,
                t.name
            FROM tags t
            WHERE t.tag_id = ${id}
            GROUP BY t.tag_id
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: 'Тег не найден' });
        }

        const tag = result[0];
        
        res.json({
            tag_id: tag.tag_id,
            name: tag.name
        });

    } catch (error) {
        console.error('Ошибка при получении тега:', error);
        res.status(500).json({ error: 'Не удалось загрузить данные тега' });
    }
});

// Редактирование тега
app.put('/api/admin/tags/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        // Валидация
        if (!name) {
            return res.status(400).json({
                error: 'Имя обязательно'
            });
        }

        // Проверка существования тега
        const tagCheck = await sql`
            SELECT * FROM tags WHERE tag_id = ${id}
        `;
        if (tagCheck.length === 0) {
            return res.status(404).json({ error: 'Тег не найден' });
        }

        // Обновляем тег
        await sql`
            UPDATE tags
            SET name = ${name}
            WHERE tag_id = ${id}
        `;

        await syncAIServiceKnowledgeBase();

        res.json({
            success: true,
            message: 'Тег успешно обновлён'
        });

    } catch (error) {
        console.error('Ошибка при редактировании тега:', error);
        res.status(500).json({
            error: 'Не удалось обновить тег'
        });
    }
});

// Удаление тега
app.delete('/api/admin/tags/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Проверяем, существует ли тег
        const existing = await sql`
            SELECT * FROM tags WHERE tag_id = ${id}
        `;
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Тег не найден' });
        }

        // Удаляем тег
        await sql`
            DELETE FROM tags WHERE tag_id = ${id}
        `;

        console.log(`✅ Тег с ID ${id} удалёна`);

        await syncAIServiceKnowledgeBase();

        res.json({ success: true, message: 'Тег успешно удалён' });
    } catch (error) {
        console.error('Ошибка при удалении тега:', error);
        res.status(500).json({ message: 'Ошибка сервера при удалении тега' });
    }
});

// Получение одной роли по ID (для редактирования)
app.get('/api/admin/roles/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Получаем роль
        const result = await sql`
            SELECT 
                r.role_id,
                r.role_name
            FROM roles r
            WHERE r.role_id = ${id}
            GROUP BY r.role_id
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: 'Роль не найдена' });
        }

        const role = result[0];
        
        res.json({
            role_id: role.role_id,
            name: role.role_name
        });

    } catch (error) {
        console.error('Ошибка при получении роли:', error);
        res.status(500).json({ error: 'Не удалось загрузить данные роли' });
    }
});

// Редактирование роли
app.put('/api/admin/roles/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        // Валидация
        if (!name) {
            return res.status(400).json({
                error: 'Имя обязательно'
            });
        }

        // Проверка существования роли
        const roleCheck = await sql`
            SELECT * FROM roles WHERE role_id = ${id}
        `;
        if (roleCheck.length === 0) {
            return res.status(404).json({ error: 'Роль не найдена' });
        }

        // Обновляем роль
        await sql`
            UPDATE roles
            SET role_name = ${name}
            WHERE role_id = ${id}
        `;

        res.json({
            success: true,
            message: 'Роль успешно обновлена'
        });

    } catch (error) {
        console.error('Ошибка при редактировании роли:', error);
        res.status(500).json({
            error: 'Не удалось обновить роль'
        });
    }
});

// Удаление роли
app.delete('/api/admin/roles/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Проверяем, существует ли роль
        const existing = await sql`
            SELECT * FROM roles WHERE role_id = ${id}
        `;
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Роль не найдена' });
        }

        // Удаляем роль
        await sql`
            DELETE FROM roles WHERE role_id = ${id}
        `;

        console.log(`✅ Роль с ID ${id} удалёна`);

        res.json({ success: true, message: 'Роль успешно удалена' });
    } catch (error) {
        console.error('Ошибка при удалении роли:', error);
        res.status(500).json({ message: 'Ошибка сервера при удалении роли' });
    }
});

// API для авторизации с реальной проверкой из БД
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt for email:', email);
    
    // Ищем пользователя в базе данных
    const usersResult = await sql`
      SELECT * FROM users 
      WHERE email = ${email}
    `;
    
    if (usersResult.length === 0) {
      console.log('User not found:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }
    
    const user = usersResult[0];
    console.log('User found:', user.email);
    
    // Проверяем пароль
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
        console.log('Wrong password for:', email);
        return res.status(401).json({ 
            success: false, 
            message: 'Неверный пароль' 
        });
    }
    
    console.log('Password correct for:', email);
    
    // Получаем роли пользователя из БД
    const rolesResult = await sql`
      SELECT r.role_name 
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = ${user.user_id}
    `;
    
    console.log('Roles from DB:', rolesResult);
    
    const userRoles = rolesResult.map(r => r.role_name);
    console.log('Role names:', userRoles);
    
    // Проверяем, является ли пользователь администратором
    const isAdmin = userRoles.some(role => 
      role.trim().toLowerCase() === 'администратор'
    );
    
    console.log('Is admin?', isAdmin);
    
    // Сохраняем в сессию
    req.session.user = {
      id: user.user_id,
      email: user.email,
      name: user.full_name,
      roles: userRoles,
      isAdmin: isAdmin
    };
    
    console.log('Session user saved:', {
      email: user.email,
      roles: userRoles,
      isAdmin: isAdmin
    });
    
    res.json({ 
      success: true, 
      user: req.session.user 
    });
    
  } catch (error) {
    console.error('Login error details:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

// API для смены пароля
app.post('/api/change-password', requireAuth, async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        const userId = req.session.user.id;
        
        // Валидация
        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Все поля обязательны для заполнения' 
            });
        }
        
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Новый пароль и подтверждение не совпадают' 
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Пароль должен содержать минимум 6 символов' 
            });
        }
        
        // Получаем текущий пароль пользователя
        const userResult = await sql`
            SELECT password_hash FROM users WHERE user_id = ${userId}
        `;
        
        if (userResult.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Пользователь не найден' 
            });
        }
        
        // Проверяем старый пароль
       // Проверяем старый пароль (сравниваем с хешем)
        const isMatch = await bcrypt.compare(oldPassword, userResult[0].password_hash);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Неверный старый пароль' 
            });
        }

        // Проверяем, что новый пароль отличается от старого (по содержанию, но безопасно)
        // Сравниваем открытые значения, но можно дополнительно проверить хеш нового пароля, если нужно
        if (oldPassword === newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Новый пароль должен отличаться от старого' 
            });
        }
        
        // Обновляем пароль
        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        await sql`
            UPDATE users 
            SET password_hash = ${newPasswordHash}
            WHERE user_id = ${userId}
        `;
        
        res.json({ 
            success: true, 
            message: 'Пароль успешно изменен' 
        });
        
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка при смене пароля' 
        });
    }
});

// Получение всех пользователей (только для админа)
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        console.log('Fetching users for admin:', req.session.user.email);
        
        // Получаем всех пользователей с их ролями
        const users = await sql`
            SELECT 
                u.user_id,
                u.email,
                u.full_name,
                ARRAY_AGG(r.role_name) as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.user_id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.role_id
            GROUP BY u.user_id
            ORDER BY u.full_name
        `;
        
        console.log(`Found ${users.length} users`);
        
        // Форматируем ответ
        const formattedUsers = users.map(user => ({
            id: user.user_id,
            user_id: user.user_id,
            email: user.email,
            full_name: user.full_name,
            roles: user.roles.filter(role => role !== null)
        }));
        
        res.json(formattedUsers);
        
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Ошибка при получении пользователей' });
    }
});



// Получение всех категорий
app.get('/api/admin/categories', requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log('=== CATEGORIES API CALL ===');
        console.log('User:', req.session.user.email);
        console.log('Is admin:', req.session.user.isAdmin);

        const categories = await sql`
            SELECT 
                c.category_id,
                c.name
            FROM categories c
            GROUP BY c.category_id
            ORDER BY c.name
        `;

        console.log(`Found ${categories.length} categories`);
        console.log('Categories:', categories);
        
        res.json(categories);
        
    } catch (error) {
      console.error('=== CATEGORIES ERROR ===');
        console.error('Error details:', error);
        console.error('Error stack:', error.stack);

        res.status(500).json({ 
            error: 'Ошибка при получении категорий',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Получение всех тегов
app.get('/api/admin/tags', requireAuth, requireAdmin, async (req, res) => {
    try {
        const tags = await sql`
            SELECT 
                t.tag_id,
                t.name
            FROM tags t
            GROUP BY t.tag_id
            ORDER BY t.name
        `;
        
        res.json(tags);
        
    } catch (error) {
        console.error('Error fetching tags:', error);
        res.status(500).json({ error: 'Ошибка при получении тегов' });
    }
});

// Получение всех категорий и тегов для фильтров
app.get('/api/filters', requireAuth, async (req, res) => {
    try {
        const categories = await sql`
            SELECT name FROM categories
            ORDER BY name
        `;

        const tags = await sql`
            SELECT name FROM tags
            ORDER BY name
        `;

        res.json({
            categories: categories.map(c => c.name),
            tags: tags.map(t => t.name)
        });
    } catch (error) {
        console.error('Error fetching filters:', error);
        res.status(500).json({ error: 'Ошибка при загрузке фильтров' });
    }
});

// API для получения документов
app.get('/api/documents', requireAuth, async (req, res) => {
    try {
        console.log('Fetching documents for user:', req.session.user.email);
        
        // Получаем документы с категориями и тегами
        const documents = await sql`
            SELECT 
                d.document_id,
                d.title,
                d.file_path,
                d.upload_date,
                d.is_archived,
                d.preview_image AS "previewImage",  
                c.name as category_name,
                COALESCE(
                    ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL),
                    ARRAY[]::varchar[]
                ) as tags
            FROM documents d
            LEFT JOIN categories c ON d.category_id = c.category_id
            LEFT JOIN document_tags dt ON d.document_id = dt.document_id
            LEFT JOIN tags t ON dt.tag_id = t.tag_id
            WHERE d.is_archived = false
            GROUP BY d.document_id, c.name
            ORDER BY d.upload_date DESC
        `;
        
        console.log(`Found ${documents.length} documents`);
        
        // Форматируем данные для клиента
        const formattedDocuments = documents.map(doc => ({
            id: doc.document_id,
            title: doc.title,
            filePath: doc.file_path,
            fileSize: formatFileSize(doc.file_size),
            uploadDate: doc.upload_date,
            category: doc.category_name || 'Без категории',
            tags: doc.tags,
            previewImage: doc.previewImage || null,
        }));
        
        res.json({
            success: true,
            documents: formattedDocuments,
            total: formattedDocuments.length
        });
        
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка при получении документов' 
        });
    }
});

// API для получения документов
app.get('/api/admin/documents', requireAuth, requireAdmin, async (req, res) => {
    try {
        console.log('Fetching archived documents for user:', req.session.user.email);
        
        // Получаем документы с категориями и тегами 
        const documents = await sql`
            SELECT 
                d.document_id,
                d.title,
                d.file_path,
                d.upload_date,
                d.is_archived,
                d.preview_image AS "previewImage",  
                c.name as category_name,
                COALESCE(
                    ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL),
                    ARRAY[]::varchar[]
                ) as tags
            FROM documents d
            LEFT JOIN categories c ON d.category_id = c.category_id
            LEFT JOIN document_tags dt ON d.document_id = dt.document_id
            LEFT JOIN tags t ON dt.tag_id = t.tag_id
            WHERE d.is_archived = true
            GROUP BY d.document_id, c.name
            ORDER BY d.upload_date DESC
        `;
        
        console.log(`Found ${documents.length} archived documents`);
        
        // Форматируем данные для клиента 
        const formattedDocuments = documents.map(doc => ({
            id: doc.document_id,
            title: doc.title,
            filePath: doc.file_path,
            fileSize: formatFileSize(doc.file_size),
            uploadDate: doc.upload_date,
            category: doc.category_name || 'Без категории',
            tags: doc.tags,
            previewImage: doc.previewImage || null,
        }));
        
        res.json({
            success: true,
            documents: formattedDocuments,
            total: formattedDocuments.length
        });
        
    } catch (error) {
        console.error('Error fetching archived documents:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка при получении документов' 
        });
    }
});


// === API: Архивировать документ ===
app.patch('/api/admin/documents/:id/archive', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Проверяем, существует ли документ
        const existing = await sql`
            SELECT document_id, is_archived FROM documents WHERE document_id = ${id}
        `;
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Документ не найден' });
        }

        if (existing[0].is_archived) {
            return res.status(400).json({ success: false, message: 'Документ уже в архиве' });
        }

        // Обновляем статус
        await sql`
            UPDATE documents
            SET is_archived = true
            WHERE document_id = ${id}
        `;

        console.log(`✅ Документ с ID ${id} отправлен в архив`);

        res.json({ success: true, message: 'Документ успешно архивирован' });
    } catch (error) {
        console.error('Ошибка при архивации документа:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// ... остальной код (запуск сервера и т.д.) ...

// === API: Восстановить документ из архива ===
app.post('/api/admin/documents/restore/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Проверяем, существует ли документ
        const existing = await sql`
            SELECT document_id, is_archived FROM documents WHERE document_id = ${id}
        `;
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Документ не найден' });
        }

        if (!existing[0].is_archived) {
            return res.status(400).json({ success: false, message: 'Документ уже не в архиве' });
        }

        // Обновляем статус
        await sql`
            UPDATE documents
            SET is_archived = false
            WHERE document_id = ${id}
        `;

        console.log(`✅ Документ с ID ${id} восстановлен из архива`);

        res.json({ success: true, message: 'Документ успешно восстановлен' });
    } catch (error) {
        console.error('Ошибка при восстановлении документа:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// === API: Удалить документ навсегда ===
app.delete('/api/admin/documents/delete/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Проверяем, существует ли документ
        const existing = await sql`
            SELECT document_id, file_path, preview_image FROM documents WHERE document_id = ${id}
        `;
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Документ не найден' });
        }

        const doc = existing[0];

        // Удаляем связи
        await sql`DELETE FROM document_tags WHERE document_id = ${id}`;
        await sql`DELETE FROM annotations WHERE document_id = ${id}`;
        await sql`DELETE FROM bookmarks WHERE document_id = ${id}`;
        await sql`DELETE FROM favourites WHERE document_id = ${id}`;

        // Удаляем сам документ
        await sql`DELETE FROM documents WHERE document_id = ${id}`;

        // Удаляем файл PDF
        const fs = require('fs').promises;
        const path = require('path');
        const PROJECT_ROOT = '.'; // ← или используйте переменную из конфига

        const filePath = path.join(PROJECT_ROOT, doc.file_path); // /documents/filename.pdf
        const previewPath = doc.preview_image ? path.join(PROJECT_ROOT, doc.preview_image) : null;

        try {
            await fs.unlink(filePath);
            console.log(`🗑️ Файл удалён: ${filePath}`);
        } catch (err) {
            console.warn(`⚠️ Не удалось удалить файл: ${filePath}`, err.message);
        }

        if (previewPath) {
            try {
                await fs.unlink(previewPath);
                console.log(`🗑️ Превью удалено: ${previewPath}`);
            } catch (err) {
                console.warn(`⚠️ Не удалось удалить превью: ${previewPath}`, err.message);
            }
        }

        console.log(`✅ Документ с ID ${id} удалён навсегда`);

        res.json({ success: true, message: 'Документ успешно удалён' });
    } catch (error) {
        console.error('Ошибка при удалении документа:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Получение одного документа по ID
app.get('/api/documents/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await sql`
            SELECT 
                d.document_id,
                d.title,
                d.file_path,
                d.upload_date,
                c.name as category_name,
                COALESCE(
                    ARRAY_AGG(t.name) FILTER (WHERE t.name IS NOT NULL),
                    ARRAY[]::varchar[]
                ) as tags
            FROM documents d
            LEFT JOIN categories c ON d.category_id = c.category_id
            LEFT JOIN document_tags dt ON d.document_id = dt.document_id
            LEFT JOIN tags t ON dt.tag_id = t.tag_id
            WHERE d.document_id = ${id} AND d.is_archived = false
            GROUP BY d.document_id, c.name
        `;

        if (result.length === 0) {
            return res.status(404).json({ message: 'Документ не найден' });
        }

        const doc = result[0];

        res.json({
            id: doc.document_id,
            title: doc.title,
            filePath: doc.file_path,
            fileSize: formatFileSize(doc.file_size),
            uploadDate: doc.upload_date,
            category: doc.category_name,
            tags: doc.tags
        });
    } catch (error) {
        console.error('Error fetching document:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// === API: Получить документ для редактирования (только для админа) ===
app.get('/api/admin/documents/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await sql`
            SELECT 
                d.document_id,
                d.title,
                d.file_path,
                d.upload_date,
                d.category_id,
                d.is_archived,
                c.name as category_name,
                ARRAY_AGG(t.name) as tags
            FROM documents d
            LEFT JOIN categories c ON d.category_id = c.category_id
            LEFT JOIN document_tags dt ON d.document_id = dt.document_id
            LEFT JOIN tags t ON dt.tag_id = t.tag_id
            WHERE d.document_id = ${id}
            GROUP BY d.document_id, c.name
        `;

        if (result.length === 0) {
            return res.status(404).json({ message: 'Документ не найден' });
        }

        res.json(result[0]);
    } catch (error) {
        console.error('Ошибка при получении документа для редактирования:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// === API: Обновление документа (для админа) ===
app.put('/api/admin/documents/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, category_id, tag_ids } = req.body;

        // Проверка обязательных полей
        if (!title || !category_id) {
            return res.status(400).json({
                success: false,
                message: 'Название и категория обязательны'
            });
        }

        // Проверка существования документа
        const docCheck = await sql`
            SELECT document_id FROM documents WHERE document_id = ${id}
        `;
        if (docCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Документ не найден'
            });
        }

        // Обновляем основные данные документа
        await sql`
            UPDATE documents
            SET title = ${title}, category_id = ${category_id}
            WHERE document_id = ${id}
        `;

        // Обновляем теги
        if (Array.isArray(tag_ids)) {
            // Удаляем старые связи
            await sql`
                DELETE FROM document_tags WHERE document_id = ${id}
            `;

            // Добавляем новые
            const tagInserts = tag_ids.map(tagId =>
                sql`
                    INSERT INTO document_tags (document_id, tag_id)
                    VALUES (${id}, ${parseInt(tagId)})
                    ON CONFLICT DO NOTHING
                `
            );
            await Promise.all(tagInserts);
        }

        console.log(`✅ Документ с ID ${id} успешно обновлён`);

        // Возвращаем обновлённые данные
        const [updatedDoc] = await sql`
            SELECT 
                d.document_id AS id,
                d.title,
                d.file_path AS "filePath",
                d.upload_date AS "uploadDate",
                d.preview_image AS "previewImage",
                c.name AS category,
                COALESCE(
                    ARRAY_AGG(t.name) FILTER (WHERE t.name IS NOT NULL),
                    ARRAY[]::TEXT[]
                ) AS tags
            FROM documents d
            LEFT JOIN categories c ON d.category_id = c.category_id
            LEFT JOIN document_tags dt ON d.document_id = dt.document_id
            LEFT JOIN tags t ON dt.tag_id = t.tag_id
            WHERE d.document_id = ${id}
            GROUP BY d.document_id, c.name
        `;

        res.json({
            success: true,
            message: 'Документ успешно обновлён',
            document: updatedDoc
        });

    } catch (error) {
        console.error('Ошибка при обновлении документа:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при обновлении документа'
        });
    }
});

// Сохранение поискового запроса
app.post('/api/search/save', requireAuth, async (req, res) => {
    try {
        console.log('🔹 /api/search/save вызван');
        console.log('Тело запроса:', req.body);
        console.log('Пользователь в сессии:', req.session.user);

        const { query } = req.body;
        const userId = req.session.user.id;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Некорректный запрос' });
        }

        const trimmedQuery = query.trim();
        if (trimmedQuery.length === 0) {
            return res.json({ success: true }); // ← важно: вернуть ответ
        }

        const result = await sql`
            INSERT INTO search_history (user_id, query, searched_at)
            VALUES (${userId}, ${trimmedQuery}, NOW())
            ON CONFLICT (user_id, query)
            DO UPDATE SET searched_at = EXCLUDED.searched_at
        `;

        console.log('✅ Запрос сохранён:', trimmedQuery);

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Ошибка при сохранении поиска:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ error: 'Не удалось сохранить запрос' });
    }
});

// Получение истории поиска (по последнему времени использования)
app.get('/api/search/history', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const history = await sql`
            SELECT query
            FROM search_history
            WHERE user_id = ${userId}
            ORDER BY searched_at DESC  -- ← ключевое изменение!
            LIMIT 5
        `;

        res.json({
            success: true,
            queries: history.map(h => h.query)
        });
    } catch (error) {
        console.error('Ошибка при получении истории поиска:', error);
        res.status(500).json({ error: 'Не удалось загрузить историю' });
    }
});

// Функция форматирования размера файла
function formatFileSize(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// === API: Добавить заметку ===
app.post('/api/notes', requireAuth, async (req, res) => {
    try {
        const { documentId, page, content } = req.body;
        const userId = req.session.user.id;

        if (!documentId || !page || !content) {
            return res.status(400).json({ error: 'Необходимы documentId, page и content' });
        }

        const result = await sql`
            INSERT INTO annotations 
                (user_id, document_id, page_number, content, created_at)
            VALUES 
                (${userId}, ${documentId}, ${page}, ${content.trim()}, NOW())
            RETURNING annotation_id, created_at
        `;

        res.json({
            success: true,
            note: {
                id: result[0].annotation_id,
                page: page,
                text: content.trim(),
                timestamp: new Date(result[0].created_at).toLocaleString('ru-RU')
            }
        });
    } catch (error) {
        console.error('Ошибка при добавлении заметки:', error);
        res.status(500).json({ error: 'Не удалось сохранить заметку' });
    }
});

// === API: Удалить заметку ===
app.delete('/api/notes/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user.id;

        // Проверяем, существует ли заметка и принадлежит ли пользователю
        const noteCheck = await sql`
            SELECT annotation_id FROM annotations
            WHERE annotation_id = ${id} AND user_id = ${userId}
        `;

        if (noteCheck.length === 0) {
            return res.status(404).json({ error: 'Заметка не найдена или доступ запрещён' });
        }

        // Удаляем заметку
        await sql`
            DELETE FROM annotations
            WHERE annotation_id = ${id}
        `;

        res.json({ success: true, message: 'Заметка удалена' });
    } catch (error) {
        console.error('Ошибка при удалении заметки:', error);
        res.status(500).json({ error: 'Не удалось удалить заметку' });
    }
});

// === API: Получить заметки для документа ===
app.get('/api/notes/:documentId', requireAuth, async (req, res) => {
    try {
        const { documentId } = req.params;
        const userId = req.session.user.id;

        const notes = await sql`
            SELECT 
                annotation_id AS id,
                page_number AS page,
                content AS text,
                created_at AS timestamp
            FROM annotations
            WHERE user_id = ${userId} AND document_id = ${documentId}
            ORDER BY created_at DESC
        `;

        // Форматируем дату
        const formattedNotes = notes.map(note => ({
            ...note,
            timestamp: new Date(note.timestamp).toLocaleString('ru-RU')
        }));

        res.json({ notes: formattedNotes });
    } catch (error) {
        console.error('Ошибка при загрузке заметок:', error);
        res.status(500).json({ error: 'Не удалось загрузить заметки' });
    }
});


// === API: Добавить закладку ===
app.post('/api/bookmarks', requireAuth, async (req, res) => {
    try {
        const { documentId, page, note } = req.body;
        const userId = req.session.user.id;

        if (!documentId || !page) {
            return res.status(400).json({ error: 'Необходимы documentId и page' });
        }

        // Проверим, нет ли уже такой закладки
        const existing = await sql`
            SELECT bookmark_id FROM bookmarks
            WHERE user_id = ${userId} AND document_id = ${documentId} AND page_number = ${page}
        `;

        if (existing.length > 0) {
            return res.status(409).json({ message: 'Закладка на этой странице уже существует' });
        }

        const result = await sql`
            INSERT INTO bookmarks 
                (user_id, document_id, page_number, note, created_at)
            VALUES 
                (${userId}, ${documentId}, ${page}, ${note || null}, NOW())
            RETURNING bookmark_id, page_number AS page, note, created_at AS timestamp
        `;

        const newBookmark = result[0];

        res.json({
            success: true,
            message: 'Закладка добавлена',
            bookmark: {
                id: newBookmark.bookmark_id,
                page: newBookmark.page,
                note: newBookmark.note || 'Без комментария',
                timestamp: new Date(newBookmark.timestamp).toLocaleString('ru-RU')
            }
        });
    } catch (error) {
        console.error('Ошибка при добавлении закладки:', error);
        res.status(500).json({ error: 'Не удалось добавить закладку' });
    }
});

// === API: Получить закладки для документа ===
app.get('/api/bookmarks/:documentId', requireAuth, async (req, res) => {
    try {
        const { documentId } = req.params;
        const userId = req.session.user.id;

        const bookmarks = await sql`
            SELECT 
                bookmark_id AS id,
                page_number AS page,
                note,
                created_at AS timestamp
            FROM bookmarks
            WHERE user_id = ${userId} AND document_id = ${documentId}
            ORDER BY page_number
        `;

        // Форматируем дату вручную, если нужно отправлять уже готовую строку
        const formattedBookmarks = bookmarks.map(bookmark => ({
            ...bookmark,
            timestamp: new Date(bookmark.timestamp).toLocaleString('ru-RU')
        }));

        res.json({ bookmarks: formattedBookmarks });
    } catch (error) {
        console.error('Ошибка при загрузке закладок:', error);
        res.status(500).json({ error: 'Не удалось загрузить закладки' });
    }
});

// === API: Удалить закладку ===
app.delete('/api/bookmarks/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user.id;

        // Проверяем, существует ли закладка и принадлежит ли пользователю
        const bookmarkCheck = await sql`
            SELECT bookmark_id FROM bookmarks
            WHERE bookmark_id = ${id} AND user_id = ${userId}
        `;

        if (bookmarkCheck.length === 0) {
            return res.status(404).json({ error: 'Закладка не найдена или доступ запрещён' });
        }

        // Удаляем закладку
        await sql`
            DELETE FROM bookmarks
            WHERE bookmark_id = ${id}
        `;

        res.json({ success: true, message: 'Закладка удалена' });
    } catch (error) {
        console.error('Ошибка при удалении закладки:', error);
        res.status(500).json({ error: 'Не удалось удалить закладку' });
    }
});

// ========== API для избранного ==========

// === API: Проверить, в избранном ли документ ===
app.get('/api/favourites/check', requireAuth, async (req, res) => {
    try {
        const { documentId } = req.query;
        const userId = req.session.user.id;

        if (!documentId) {
            return res.status(400).json({ error: 'documentId обязателен' });
        }

        const docId = parseInt(documentId, 10);
        if (isNaN(docId) || docId <= 0) {
            return res.status(400).json({ error: 'Некорректный documentId' });
        }

        const result = await sql`
            SELECT favourite_id FROM favourites
            WHERE user_id = ${userId} AND document_id = ${docId}
            LIMIT 1
        `;

        res.json({ isFavourite: result.length > 0 });
    } catch (error) {
        console.error('Ошибка при проверке избранного:', error);
        res.status(500).json({ error: 'Не удалось проверить избранное' });
    }
});

// === API: Получить количество избранных документов ===
app.get('/api/favourites/count', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const result = await sql`
            SELECT COUNT(*) AS count
            FROM favourites f
            JOIN documents d ON f.document_id = d.document_id
            WHERE f.user_id = ${userId}
              AND d.is_archived = false
        `;

        const count = result.length > 0 ? parseInt(result[0].count) : 0;
        res.json({ count });
    } catch (error) {
        console.error('Ошибка получения количества избранного:', error);
        res.status(500).json({ error: 'Не удалось загрузить статистику' });
    }
});

// === API: Получить все избранные документы ===
app.get('/api/favourites', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { folderId } = req.query;

        let query = sql`
            SELECT 
                f.favourite_id,
                f.document_id,
                f.folder_id,
                d.title,
                d.file_path,
                d.upload_date,
                d.preview_image AS "previewImage",
                c.name AS category
            FROM favourites f
            JOIN documents d ON f.document_id = d.document_id
            LEFT JOIN categories c ON d.category_id = c.category_id
            WHERE f.user_id = ${userId}
              AND d.is_archived = false 
        `;

        if (folderId) {
            query = sql`${query} AND f.folder_id = ${folderId}`;
        }

        query = sql`${query} ORDER BY f.favourite_id DESC`;

        const documents = await query;
        console.log(`✅ Найдено ${documents.length} документов в избранном`);

        const formattedDocuments = documents.map(doc => ({
            favourite_id: doc.favourite_id,
            document_id: doc.document_id,
            folder_id: doc.folder_id,
            title: doc.title || 'Без названия',
            file_path: doc.file_path,
            upload_date: doc.upload_date,
            previewImage: doc.previewImage,    
            category: doc.category || 'Без категории', 
        }));

        res.json(formattedDocuments);
    } catch (error) {
        console.error('Ошибка получения избранного:', error);
        res.status(500).json({ error: 'Не удалось загрузить избранное' });
    }
});

// === API: Получить избранный документ по favourite_id ===
app.get('/api/favourites/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user.id;

        const favouriteId = parseInt(id, 10);
        
        if (isNaN(favouriteId)) {
            return res.status(400).json({ error: 'Некорректный ID избранного документа' });
        }

        const result = await sql`
            SELECT 
                f.favourite_id,
                f.document_id,
                f.folder_id,
                d.title,
                COALESCE(d.preview_image, '') AS "previewImage",
                COALESCE(c.name, 'Без категории') AS category,
                COALESCE(fld.name, '') AS "folder_name"
            FROM favourites f
            JOIN documents d ON f.document_id = d.document_id
            LEFT JOIN categories c ON d.category_id = c.category_id
            LEFT JOIN folders fld ON f.folder_id = fld.folder_id
            WHERE f.favourite_id = ${favouriteId} AND f.user_id = ${userId}
            LIMIT 1
        `;

        if (result.length === 0) {
            return res.status(404).json({ message: 'Избранный документ не найден' });
        }

        res.json(result[0]);
    } catch (error) {
        console.error('Ошибка при получении избранного документа:', error);
        res.status(500).json({ error: 'Не удалось загрузить данные избранного' });
    }
});

// === API: Добавить документ в избранное ===
app.post('/api/favourites', requireAuth, async (req, res) => {
    try {
        const { documentId, folderId } = req.body;
        const userId = req.session.user.id;

        if (!documentId) {
            return res.status(400).json({ error: 'ID документа обязателен' });
        }

        const existing = await sql`
            SELECT favourite_id FROM favourites
            WHERE user_id = ${userId} AND document_id = ${documentId}
        `;

        if (existing.length > 0) {
            return res.status(409).json({ error: 'Документ уже в избранном' });
        }

        const result = await sql`
            INSERT INTO favourites (user_id, document_id, folder_id)
            VALUES (${userId}, ${documentId}, ${folderId || null})
            RETURNING favourite_id
        `;

        res.status(201).json({ 
            success: true, 
            message: 'Документ добавлен в избранное',
            favourite_id: result[0].favourite_id
        });
    } catch (error) {
        console.error('Ошибка добавления в избранное:', error);
        res.status(500).json({ error: 'Не удалось добавить в избранное' });
    }
});

// === API: Удалить документ из избранного ===
app.delete('/api/favourites/:id', requireAuth, async (req, res) => {
    const { id } = req.params; 
    const userId = req.session.user.id;

    const docId = parseInt(id, 10);
    if (isNaN(docId)) {
        return res.status(400).json({ error: 'Некорректный ID документа' });
    }

    const result = await sql`
        DELETE FROM favourites
        WHERE user_id = ${userId} AND favourite_id = ${docId}
        RETURNING favourite_id
    `;

    if (result.length === 0) {
        return res.status(404).json({ error: 'Документ не найден в избранном' });
    }

    res.json({ success: true, message: 'Документ удалён из избранного' });
});

// === API: Переместить документ в другую папку ===
app.put('/api/favourites/:favouriteId/move', requireAuth, async (req, res) => {
    try {
        const { favouriteId } = req.params;
        const { folderId } = req.body;
        const userId = req.session.user.id;

        const favId = parseInt(favouriteId, 10);
        
        if (isNaN(favId)) {
            return res.status(400).json({ error: 'Некорректный ID избранного документа' });
        }

        if (folderId) {
            const folderIdNum = parseInt(folderId, 10);
            if (isNaN(folderIdNum)) {
                return res.status(400).json({ error: 'Некорректный ID папки' });
            }
            
            const folderCheck = await sql`
                SELECT folder_id FROM folders
                WHERE folder_id = ${folderIdNum} AND user_id = ${userId}
            `;
            
            if (folderCheck.length === 0) {
                return res.status(404).json({ error: 'Папка не найдена или доступ запрещён' });
            }
            
            const result = await sql`
                UPDATE favourites
                SET folder_id = ${folderIdNum}
                WHERE favourite_id = ${favId} AND user_id = ${userId}
                RETURNING favourite_id
            `;
            
            if (result.length === 0) {
                return res.status(404).json({ error: 'Документ не найден в избранном' });
            }
        } else {
            const result = await sql`
                UPDATE favourites
                SET folder_id = NULL
                WHERE favourite_id = ${favId} AND user_id = ${userId}
                RETURNING favourite_id
            `;
            
            if (result.length === 0) {
                return res.status(404).json({ error: 'Документ не найден в избранном' });
            }
        }

        res.json({ success: true, message: 'Документ перемещён' });
    } catch (error) {
        console.error('Ошибка перемещения документа:', error);
        res.status(500).json({ error: 'Не удалось переместить документ' });
    }
});

// === API: Открепить документы от папки ===
app.post('/api/favourites/bulk-unassign-folder', requireAuth, async (req, res) => {
    try {
        const { favourite_ids } = req.body;
        const userId = req.session.user.id;

        if (!Array.isArray(favourite_ids) || favourite_ids.length === 0) {
            return res.status(400).json({ message: 'Необходим массив favourite_ids' });
        }

        // Проверяем, что все записи существуют и принадлежат пользователю
        const favouritesResult = await sql`
            SELECT favourite_id FROM favourites
            WHERE favourite_id = ANY(${favourite_ids})
              AND user_id = ${userId}
        `;

        const validIds = favouritesResult.map(r => r.favourite_id);
        const invalidCount = favourite_ids.length - validIds.length;

        if (validIds.length === 0) {
            return res.status(400).json({ message: 'Нет доступных документов для открепления' });
        }

        // Вместо удаления — просто убираем привязку к папке
        await sql`
            UPDATE favourites
            SET folder_id = NULL
            WHERE favourite_id = ANY(${validIds})
        `;

        res.json({
            success: true,
            unassigned: validIds.length,
            invalid: invalidCount,
            message: `Успешно откреплено ${validIds.length} документов от папки`
        });
    } catch (error) {
        console.error('Ошибка при откреплении от папки:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// ========== API для папок ==========

// Получение всех папок пользователя
app.get('/api/folders', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const folders = await sql`
            SELECT 
                f.folder_id,
                f.name,
                f.color,
                COUNT(fav.document_id) FILTER (WHERE d.is_archived = false) AS "documentsCount"
            FROM folders f
            LEFT JOIN favourites fav ON f.folder_id = fav.folder_id AND fav.user_id = ${userId}
            LEFT JOIN documents d ON fav.document_id = d.document_id
            WHERE f.user_id = ${userId}
            GROUP BY f.folder_id
            ORDER BY f.name
        `;

        res.json(folders);
    } catch (error) {
        console.error('Ошибка получения папок:', error);
        res.status(500).json({ error: 'Не удалось загрузить папки' });
    }
});

// Создание новой папки
app.post('/api/folders', requireAuth, async (req, res) => {
    try {
        const { name, color } = req.body;
        const userId = req.session.user.id; // ← получаем ID пользователя

        if (!name) {
            return res.status(400).json({ error: 'Название папки обязательно' });
        }

        const result = await sql`
            INSERT INTO folders (name, color, user_id)
            VALUES (${name.trim()}, ${color || '#1C4DFE'}, ${userId})
            RETURNING folder_id, name, color
        `;

        res.status(201).json(result[0]);
    } catch (error) {
        console.error('Ошибка создания папки:', error);
        res.status(500).json({ error: 'Не удалось создить папку' });
    }
});

// Получение папки по ID
app.get('/api/folders/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await sql`
            SELECT 
                folder_id,
                name,
                color
            FROM folders
            WHERE folder_id = ${id}
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: 'Папка не найдена' });
        }

        res.json(result[0]);
    } catch (error) {
        console.error('Ошибка получения папки:', error);
        res.status(500).json({ error: 'Не удалось загрузить папку' });
    }
});

// Обновление папки
app.put('/api/folders/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, color } = req.body;
        const userId = req.session.user.id;

        if (!name) {
            return res.status(400).json({ error: 'Название папки обязательно' });
        }

        const result = await sql`
            UPDATE folders
            SET name = ${name.trim()}, color = ${color}
            WHERE folder_id = ${id} AND user_id = ${userId}
            RETURNING folder_id
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: 'Папка не найдена или доступ запрещён' });
        }

        res.json({ success: true, message: 'Папка обновлена' });
    } catch (error) {
        console.error('Ошибка обновления папки:', error);
        res.status(500).json({ error: 'Не удалось обновить папку' });
    }
});

// === API: Удаление папки ===
app.delete('/api/folders/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    try {
        // Начинаем транзакцию (опционально, но безопаснее)
        await sql`BEGIN`;

        // Проверяем, существует ли папка и принадлежит пользователю
        const folderCheck = await sql`
            SELECT folder_id FROM folders 
            WHERE folder_id = ${id} AND user_id = ${userId}
        `;

        if (folderCheck.length === 0) {
            await sql`ROLLBACK`;
            return res.status(404).json({ error: 'Папка не найдена или доступ запрещён' });
        }

        // 🛠 Снимаем привязку к папке у всех документов в избранном
        await sql`
            UPDATE favourites
            SET folder_id = NULL
            WHERE folder_id = ${id} AND user_id = ${userId}
        `;

        // 🗑 Удаляем саму папку
        await sql`
            DELETE FROM folders
            WHERE folder_id = ${id} AND user_id = ${userId}
        `;

        await sql`COMMIT`;

        console.log(`✅ Папка с ID ${id} удалена, документы откреплены`);

        res.json({ success: true, message: 'Папка удалена, документы сохранены в избранном' });

    } catch (error) {
        await sql`ROLLBACK`;
        console.error('Ошибка при удалении папки:', error);
        res.status(500).json({ error: 'Не удалось удалить папку' });
    }
});

// === API: Запись просмотра документа ===
app.post('/api/view-history', requireAuth, async (req, res) => {
    try {
        const { documentId, page } = req.body;
        const userId = req.session.user.id;

        if (!documentId) {
            return res.status(400).json({ error: 'documentId обязателен' });
        }

        const docId = parseInt(documentId, 10);
        if (isNaN(docId) || docId <= 0) {
            return res.status(400).json({ error: 'Некорректный documentId' });
        }

        const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;

        // Получаем сам документ, чтобы убедиться, что он существует и не архивирован
        const docResult = await sql`
            SELECT document_id FROM documents 
            WHERE document_id = ${docId} AND is_archived = false
        `;

        if (docResult.length === 0) {
            return res.status(404).json({ error: 'Документ не найден или удалён' });
        }

        // Вставляем/обновляем запись
        await sql`
            INSERT INTO view_history (user_id, document_id, viewed_at, page_number)
            VALUES (${userId}, ${docId}, NOW(), ${pageNum})
            ON CONFLICT (user_id, document_id)
            DO UPDATE SET viewed_at = NOW(), page_number = EXCLUDED.page_number
        `;

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при записи просмотра:', error);
        res.status(500).json({ error: 'Не удалось сохранить историю просмотра' });
    }
});

// === API: Получение последних 5 просмотренных документов ===
app.get('/api/view-history', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const history = await sql`
            SELECT 
                vh.viewed_at,
                vh.page_number,
                d.document_id,
                d.title,
                d.file_path,
                d.upload_date,
                COALESCE(c.name, 'Без категории') AS category,
                COALESCE(d.preview_image, '') AS "previewImage"
            FROM view_history vh
            JOIN documents d ON vh.document_id = d.document_id
            LEFT JOIN categories c ON d.category_id = c.category_id
            WHERE vh.user_id = ${userId}
              AND d.is_archived = false
            ORDER BY vh.viewed_at DESC
            LIMIT 5
        `;

        res.json({
            success: true,
            history: history.map(item => ({
                document_id: item.document_id,
                title: item.title,
                file_path: item.file_path,
                upload_date: new Date(item.upload_date).toLocaleDateString('ru-RU'),
                viewed_at: new Date(item.viewed_at).toLocaleDateString('ru-RU'),
                category: item.category,
                previewImage: item.previewImage,
                page_number: item.page_number, // ← остаётся для фронтенда, если нужно
                page: item.page_number          // ← ДОБАВЛЕН: совместимость с viewer
            }))
        });
    } catch (error) {
        console.error('Ошибка при загрузке истории просмотров:', error);
        res.status(500).json({ error: 'Не удалось загрузить историю' });
    }
});

// === API: Получение ВСЕЙ истории просмотров (без лимита) ===
app.get('/api/view-history/all', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const history = await sql`
            SELECT 
                vh.viewed_at,
                vh.page_number,
                d.document_id,
                d.title,
                d.file_path,
                d.upload_date,
                COALESCE(c.name, 'Без категории') AS category,
                COALESCE(d.preview_image, '') AS "previewImage"
            FROM view_history vh
            JOIN documents d ON vh.document_id = d.document_id
            LEFT JOIN categories c ON d.category_id = c.category_id
            WHERE vh.user_id = ${userId}
              AND d.is_archived = false
            GROUP BY 
                vh.viewed_at,
                vh.page_number,
                d.document_id,
                c.name
            ORDER BY vh.viewed_at DESC
        `;

        res.json({
            success: true,
            history: history.map(item => ({
                document_id: item.document_id,
                title: item.title,
                file_path: item.file_path,
                upload_date: new Date(item.upload_date).toLocaleDateString('ru-RU'),
                viewed_at: new Date(item.viewed_at).toLocaleDateString('ru-RU'),
                category: item.category,
                previewImage: item.previewImage,
                page_number: item.page_number,
                page: item.page_number
            }))
        });
    } catch (error) {
        console.error('Ошибка при загрузке полной истории просмотров:', error);
        res.status(500).json({ error: 'Не удалось загрузить историю' });
    }
});

// === API: Количество просмотров за последнюю неделю ===
app.get('/api/view-history/last-week-count', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Определяем дату 7 дней назад
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const result = await sql`
            SELECT COUNT(*) AS count
            FROM view_history vh
            JOIN documents d ON vh.document_id = d.document_id
            WHERE vh.user_id = ${userId}
              AND d.is_archived = false
              AND vh.viewed_at >= ${oneWeekAgo.toISOString()}
        `;

        const count = parseInt(result[0].count, 10);

        res.json({ count });
    } catch (error) {
        console.error('Ошибка при подсчёте просмотров за неделю:', error);
        res.status(500).json({ error: 'Не удалось получить статистику' });
    }
});

// === API: Очистка истории просмотров ===
app.delete('/api/view-history/clear', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        await sql`
            DELETE FROM view_history
            WHERE user_id = ${userId}
        `;

        console.log(`✅ История просмотров очищена для пользователя ${userId}`);
        res.json({ success: true, message: 'История просмотров очищена' });
    } catch (error) {
        console.error('Ошибка при очистке истории просмотров:', error);
        res.status(500).json({ error: 'Не удалось очистить историю' });
    }
});

async function updateAIServiceKnowledgeBaseWithRetry(maxRetries = 3, delay = 2000) {
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://ai_classifier:5001';
    
    console.log('🔄 Syncing knowledge base with AI service...');
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            // Получаем категории и теги из БД
            const categories = await sql`SELECT name FROM categories ORDER BY name`;
            const tags = await sql`SELECT name FROM tags ORDER BY name`;
            
            console.log(`📊 Found in DB: ${categories.length} categories, ${tags.length} tags`);
            
            if (categories.length === 0 && tags.length === 0) {
                console.log('⚠️ No categories or tags found in database, skipping sync');
                return true;
            }
            
            // Отправляем одной компактной операцией
            const response = await fetch(`${aiServiceUrl}/update_kb`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categories: categories.map(c => c.name),
                    tags: tags.map(t => t.name)
                }),
                signal: AbortSignal.timeout(10000) // 10 секунд таймаут
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Knowledge base synced successfully');
                return true;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
            
        } catch (error) {
            console.error(`❌ Sync attempt ${i + 1} failed:`, error.message);
            
            if (i < maxRetries - 1) {
                console.log(`⏳ Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error('❌ Failed to sync knowledge base after all retries');
                console.log('⚠️ AI service will work with empty KB, categories/tags will be added dynamically');
                return false;
            }
        }
    }
}

// Функция синхронизации с AI сервисом
async function syncAIServiceKnowledgeBase() {
    try {
        const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://ai_classifier:5001';
        
        // Получаем категории и теги из БД
        const categories = await sql`SELECT name FROM categories ORDER BY name`;
        const tags = await sql`SELECT name FROM tags ORDER BY name`;
        
        console.log(`🔄 Syncing AI knowledge base: ${categories.length} categories, ${tags.length} tags`);
        
        const response = await fetch(`${aiServiceUrl}/update_kb`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                categories: categories.map(c => c.name),
                tags: tags.map(t => t.name)
            }),
            signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
            console.log('✅ AI knowledge base synced successfully');
            return true;
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Failed to sync AI knowledge base:', error.message);
        return false;
    }
}

// === Функция для анализа документа через AI сервис ===
// server.js - обновите функцию analyzeDocumentWithRussianAI

async function analyzeDocumentWithRussianAI(pdfPath, fileName) {
    const maxRetries = 3;
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://ai_classifier:5001';
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const pdfBuffer = await fsPromises.readFile(pdfPath);
            
            console.log(`🤖 Calling AI service: ${aiServiceUrl}/classify (attempt ${i + 1}/${maxRetries})`);
            
            const formData = new FormData();
            formData.append('file', new Blob([pdfBuffer]), fileName);
            
            const response = await fetch(`${aiServiceUrl}/classify`, {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(30000) // 30 секунд на анализ
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
            
            const result = await response.json();
            console.log('✅ AI analysis complete:', result.analysis?.category?.name);
            return result.analysis;
            
        } catch (error) {
            console.error(`❌ Attempt ${i + 1} failed:`, error.message);
            
            if (i < maxRetries - 1) {
                console.log(`⏳ Retrying in 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.error('❌ All AI analysis attempts failed');
                // Возвращаем fallback результат
                return {
                    category: {
                        name: "Общая документация",
                        confidence: 0.5,
                        is_new: false
                    },
                    tags: [
                        { name: "документ", confidence: 0.5, is_new: false }
                    ],
                    confidence: 0.5,
                    is_high_confidence: false,
                    message: "AI сервис временно недоступен. Пожалуйста, заполните поля вручную."
                };
            }
        }
    }
}

// Обновите эндпоинт AI анализа
app.post('/api/analyze-document', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Файл не загружен' });
        }
        
        console.log('🔍 Анализ документа через RuBERT:', req.file.originalname);
        
        // Анализируем документ через RuBERT
        const analysis = await analyzeDocumentWithRussianAI(req.file.path, req.file.originalname);
        
        // Удаляем временный файл
        await fsPromises.unlink(req.file.path).catch(err => 
            console.warn('⚠️ Не удалось удалить временный файл:', err.message)
        );
        
        if (!analysis) {
            return res.status(500).json({
                message: 'Не удалось проанализировать документ. Попробуйте еще раз или заполните поля вручную.'
            });
        }
        
        // Проверяем существование категории в БД
        let categoryId = null;
        let isNewCategory = false;
        
        if (analysis.category && analysis.category.name) {
            const existingCategory = await sql`
                SELECT category_id FROM categories 
                WHERE LOWER(name) = ${analysis.category.name.toLowerCase()}
            `;
            
            if (existingCategory.length > 0) {
                categoryId = existingCategory[0].category_id;
            } else {
                isNewCategory = true;
            }
        }
        
        // Проверяем существование тегов
        const tagsWithStatus = [];
        for (const tag of analysis.tags) {
            const existingTag = await sql`
                SELECT tag_id FROM tags 
                WHERE LOWER(name) = ${tag.name.toLowerCase()}
            `;
            
            tagsWithStatus.push({
                name: tag.name,
                id: existingTag.length > 0 ? existingTag[0].tag_id : null,
                isNew: existingTag.length === 0,
                confidence: tag.confidence
            });
        }
        
        res.json({
            success: true,
            analysis: {
                category: {
                    name: analysis.category.name,
                    id: categoryId,
                    isNew: isNewCategory,
                    confidence: analysis.category.confidence
                },
                tags: tagsWithStatus,
                confidence: analysis.confidence,
                isHighConfidence: analysis.is_high_confidence,
                message: analysis.is_high_confidence
                    ? 'RuBERT уверен в своем выборе. Вы можете принять предложения.'
                    : 'Рекомендуем проверить предложения перед подтверждением.'
            }
        });
        
    } catch (error) {
        console.error('❌ Ошибка при AI анализе:', error);
        
        if (req.file && req.file.path) {
            await fsPromises.unlink(req.file.path).catch(() => {});
        }
        
        res.status(500).json({
            message: 'Ошибка при анализе документа. Пожалуйста, попробуйте еще раз.'
        });
    }
});

// Добавьте эндпоинт для синхронизации базы знаний
app.post('/api/admin/sync-ai-knowledge-base', requireAuth, requireAdmin, async (req, res) => {
    try {
        await updateAIServiceKnowledgeBase();
        res.json({ success: true, message: 'База знаний AI синхронизирована' });
    } catch (error) {
        console.error('Ошибка синхронизации:', error);
        res.status(500).json({ message: 'Ошибка синхронизации' });
    }
});

// ========== ЭНДПОИНТЫ ДЛЯ ЧАТА ==========

app.post('/api/chat/search', requireAuth, async (req, res) => {
    try {
        const { query } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: 'Не указан запрос' });
        }
        
        // Создаём эмбеддинг для запроса
        const queryEmbedding = await createEmbedding(query, false);
        
        if (!queryEmbedding) {
            return res.status(500).json({ error: 'Ошибка создания эмбеддинга' });
        }
        
        // Используем векторный поиск с порогом схожести
        const results = await sql`
            SELECT 
                d.document_id as id,
                d.title,
                d.file_path as "filePath",
                d.preview_image as "previewImage",
                c.name as category,
                (1 - (d.embedding <=> ${JSON.stringify(queryEmbedding)}::vector)) AS similarity
            FROM documents d
            LEFT JOIN categories c ON d.category_id = c.category_id
            WHERE d.is_archived = false 
              AND d.embedding IS NOT NULL
              AND (1 - (d.embedding <=> ${JSON.stringify(queryEmbedding)}::vector)) > 0.35
            ORDER BY d.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
            LIMIT 10
        `;
        
        console.log(`🔍 Найдено ${results.length} релевантных документов`);
        
        // Для каждого документа извлекаем релевантный контекст
        const enrichedResults = await Promise.all(
            results.map(async (doc) => {
                const pdfPath = path.join(DOCUMENTS_PATH, path.basename(doc.filePath));
                const fullText = await extractTextFromPdf(pdfPath, 10000);
                const relevantContext = extractRelevantContext(fullText, query, 3000);
                
                return {
                    ...doc,
                    relevantContext,
                    similarity: parseFloat(doc.similarity).toFixed(3)
                };
            })
        );
        
        res.json({ 
            success: true, 
            results: enrichedResults,
            total: enrichedResults.length
        });
        
    } catch (error) {
        console.error('Ошибка поиска:', error);
        res.status(500).json({ error: 'Ошибка поиска' });
    }
});

app.post('/api/chat/answer', requireAuth, async (req, res) => {
    try {
        const { question, documentId } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Не указан вопрос' });
        }
        
        // Функция для проверки ответа в документе с улучшенным контекстом
        async function getAnswerFromDocument(doc) {
            const pdfPath = path.join(DOCUMENTS_PATH, path.basename(doc.file_path));
            
            // Извлекаем полный текст
            const fullText = await extractTextFromPdf(pdfPath, 8000);
            
            if (!fullText || fullText.length < 100) {
                return null;
            }
            
            // Извлекаем релевантный контекст
            const context = extractRelevantContext(fullText, question, 4000);
            
            const aiServiceUrl = process.env.AI_CHAT_URL || 'http://chat-assistant:8000';
            
            const aiResponse = await fetch(`${aiServiceUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: question,
                    context: context,
                    document_title: doc.title
                }),
                signal: AbortSignal.timeout(45000)
            });
            
            const aiResult = await aiResponse.json();
            
            return {
                answer: aiResult.answer,
                hasAnswer: aiResult.has_answer,
                confidence: aiResult.confidence,
                document: doc
            };
        }
        
        // Если указан конкретный документ
        if (documentId) {
            const docResult = await sql`
                SELECT document_id, title, file_path FROM documents 
                WHERE document_id = ${documentId} AND is_archived = false
            `;
            
            if (docResult.length > 0) {
                const result = await getAnswerFromDocument(docResult[0]);
                
                if (result && result.hasAnswer) {
                    return res.json({
                        success: true,
                        answer: result.answer,
                        hasAnswer: true,
                        confidence: result.confidence,
                        document: {
                            id: result.document.document_id,
                            title: result.document.title,
                            filePath: result.document.file_path
                        }
                    });
                }
            }
        }
        
        // Поиск по всем документам с использованием семантического поиска
        console.log('🔍 Семантический поиск ответа...');
        
        const queryEmbedding = await createEmbedding(question, false);
        
        if (!queryEmbedding) {
            return res.status(500).json({ error: 'Ошибка создания эмбеддинга' });
        }
        
        // Находим топ-5 наиболее релевантных документов
        const searchResults = await sql`
            SELECT 
                d.document_id,
                d.title,
                d.file_path,
                (1 - (d.embedding <=> ${JSON.stringify(queryEmbedding)}::vector)) AS similarity
            FROM documents d
            WHERE d.is_archived = false 
              AND d.embedding IS NOT NULL
            ORDER BY d.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
            LIMIT 5
        `;
        
        console.log(`📊 Проверяем ${searchResults.length} документов...`);
        
        let bestResult = null;
        
        for (const doc of searchResults) {
            console.log(`📄 Анализируем: ${doc.title} (релевантность: ${(doc.similarity * 100).toFixed(1)}%)`);
            
            const result = await getAnswerFromDocument(doc);
            
            if (result && result.hasAnswer) {
                console.log(`   ✅ Найден ответ! Уверенность: ${result.confidence}`);
                bestResult = result;
                
                if (result.confidence > 0.75) {
                    break; // Высокая уверенность — останавливаемся
                }
            }
        }
        
        if (bestResult) {
            res.json({
                success: true,
                answer: bestResult.answer,
                hasAnswer: true,
                confidence: bestResult.confidence,
                document: {
                    id: bestResult.document.document_id,
                    title: bestResult.document.title,
                    filePath: bestResult.document.file_path
                }
            });
        } else {
            res.json({
                success: true,
                answer: "К сожалению, я не смог найти ответ на ваш вопрос в загруженных документах. Попробуйте:\n\n• Переформулировать вопрос более конкретно\n• Использовать ключевые термины из документов\n• Загрузить дополнительные документы по теме\n\nЕсли вы считаете, что информация должна быть в документах, обратитесь к администратору.",
                hasAnswer: false,
                confidence: 0,
                document: null
            });
        }
        
    } catch (error) {
        console.error('Ошибка в чате:', error);
        res.status(500).json({ 
            error: 'Ошибка обработки запроса',
            answer: "Произошла техническая ошибка. Пожалуйста, попробуйте позже или обратитесь к администратору."
        });
    }
});

// Раздача статических файлов
app.use(express.static('public'));
app.use('/views', express.static('views'));

// Вызывайте синхронизацию при запуске сервера и после изменений категорий/тегов
// Добавьте после инициализации БД:
setTimeout(() => {
    updateAIServiceKnowledgeBaseWithRetry(5, 5000);
}, 10000);  // Подождем 10 секунд после запуска
// ========== ЗАПУСК СЕРВЕРА ==========
