
// --- Элементы ---
const documentNameInput = document.getElementById('documentName');
const documentInputBlock = document.querySelector('.document_input_block');

// Кастомный селект категории
const categorySelect = document.getElementById('categorySelect');
const selectedCategory = categorySelect.querySelector('.selected');
const categoryDropdown = categorySelect.querySelector('.select_dropdown');

// Кастомный мультиселект тегов
const tagsInput = document.getElementById('tagsInput');
const tagsList = document.getElementById('tagsList');
const tagsSearch = document.getElementById('tagsSearch');
const tagsDropdown = document.getElementById('tagsDropdown');
const tagsOptionsContainer = document.getElementById('tagsOptions');

let fileInput = document.getElementById('fileInput'); // ← let, потому что будем переопределять
let browseBtn = document.getElementById('browseBtn');


let allCategories = [];
let allTags = [];
let selectedCategoryId = null;
let selectedTagIds = new Set();
let uploadedFile = null;

let aiAnalysisResult = null;
let isAnalyzing = false;

// --- Фокус для поля названия ---
documentNameInput.addEventListener('focus', () => {
    documentInputBlock.classList.add('focused');
});

documentNameInput.addEventListener('blur', () => {
    documentInputBlock.classList.remove('focused');
});

// --- КАСТОМНЫЙ СЕЛЕКТ: Категория ---
function toggleCategoryDropdown(show) {
    if (show) {
        categoryDropdown.classList.add('show');
        categorySelect.classList.add('active');
    } else {
        categoryDropdown.classList.remove('show');
        categorySelect.classList.remove('active');
    }
}

// --- Функция: показать модальное окно с сообщением ---
function showModal(title, message) {
    const modal = document.getElementById('messageModal');
    document.getElementById('messageModalTitle').textContent = title;
    document.getElementById('messageModalText').textContent = message;
    modal.classList.add('active');

    // Закрытие по кнопкам
    const closeBtn = modal.querySelector('.modal_close');
    const cancelBtn = modal.querySelector('.modal_cancel');

    function closeModal() {
        modal.classList.remove('active');
        closeBtn.removeEventListener('click', closeModal);
        cancelBtn.removeEventListener('click', closeModal);
    }

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Закрытие по Escape
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// Загрузка категорий
async function loadCategories() {
    try {
        const response = await fetch('/api/admin/categories');
        if (response.ok) {
            allCategories = await response.json();
            categoryDropdown.innerHTML = '';

            allCategories.forEach(cat => {
                const option = document.createElement('div');
                option.className = 'select_option';
                option.dataset.id = cat.category_id;
                option.textContent = cat.name;

                option.addEventListener('click', (e) => {
                    e.stopPropagation();

                    selectedCategoryId = cat.category_id;
                    selectedCategory.textContent = cat.name;
                    toggleCategoryDropdown(false);
                });

                categoryDropdown.appendChild(option);
            });
        } else {
            console.error('Ошибка загрузки категорий:', await response.text());
        }
    } catch (error) {
        console.error('Ошибка при загрузке категорий:', error);
    }
}

// Загрузка тегов
async function loadTags() {
    try {
        const response = await fetch('/api/admin/tags');
        if (response.ok) {
            allTags = await response.json();
            tagsOptionsContainer.innerHTML = '';

            allTags.forEach(tag => {
                const option = document.createElement('div');
                option.className = 'tags_option';

                const checked = selectedTagIds.has(tag.tag_id.toString()) ? 'checked' : '';

                option.innerHTML = `
                    <input type="checkbox" id="tag-${tag.tag_id}" value="${tag.tag_id}" ${checked}>
                    <label for="tag-${tag.tag_id}">${tag.name}</label>
                `;
                tagsOptionsContainer.appendChild(option);

                const checkbox = option.querySelector('input');
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) {
                        if (selectedTagIds.size >= 3) {
                            showModal('Лимит тегов', 'Можно выбрать не более 3 тегов.');
                            checkbox.checked = false;
                            return;
                        }
                        selectedTagIds.add(tag.tag_id.toString());
                    } else {
                        selectedTagIds.delete(tag.tag_id.toString());
                    }
                    updateTagsDisplay();
                });
            });
        } else {
            console.error('Ошибка загрузки тегов:', await response.text());
        }
    } catch (error) {
        console.error('Ошибка при загрузке тегов:', error);
    }
}

function updateTagsDisplay() {
    // Очищаем список чипсов
    tagsList.innerHTML = '';

    // Добавляем чипсы
    selectedTagIds.forEach(tagId => {
        const tag = allTags.find(t => t.tag_id == tagId);
        if (!tag) return;

        const tagEl = document.createElement('div');
        tagEl.className = 'tag_item';
        tagEl.innerHTML = `
            <span>${tag.name}</span>
            <button type="button" data-id="${tag.tag_id}">×</button>
        `;
        tagsList.appendChild(tagEl);
    });

    // --- Управление видимостью ---
    if (selectedTagIds.size > 0) {
        tagsList.style.display = 'flex';
        tagsSearch.placeholder = '';
    } else {
        tagsList.style.display = 'none';
        tagsSearch.placeholder = 'Выбирите до 3 тегов';
    }

    // --- Синхронизация чекбоксов ---
    const checkboxes = tagsOptionsContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        const tagId = checkbox.value;
        checkbox.checked = selectedTagIds.has(tagId);
    });

    // --- Обработчики удаления ---
    tagsList.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tagId = e.target.dataset.id;
            selectedTagIds.delete(tagId);
            updateTagsDisplay(); // Полное обновление: чипсы + чекбоксы
        });
    });
}

// --- Drag & Drop ---
const uploadArea = document.getElementById('uploadArea');

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
    }
});

function handleFile(file) {
    const allowedTypes = ['application/pdf'];
    if (!allowedTypes.includes(file.type)) {
        showModal('Неподдерживаемый формат', 'Разрешены только PDF файлы');
        return;
    }

    uploadedFile = file;

    // Обновляем имя файла
    document.getElementById('fileNameDisplay').textContent = file.name;

    // Переключаем отображение
    document.getElementById('uploadDefaultContent').style.display = 'none';
    document.getElementById('uploadSuccessContent').style.display = 'flex';
}

function resetUploadArea() {
    // Очищаем всё
    fileInput.value = '';

    document.getElementById('uploadDefaultContent').style.display = 'flex';
    document.getElementById('uploadSuccessContent').style.display = 'none';
}

// Открытие/закрытие выпадающего списка категорий
categorySelect.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShown = categoryDropdown.classList.contains('show');
    closeAllDropdowns(); // Сначала закрываем всё
    if (!isShown) {
        toggleCategoryDropdown(true); // Потом открываем категорию
    }
});

// --- Функция: закрыть все выпадающие списки ---
function closeAllDropdowns(except = null) {
    // Закрываем категорию
    if (except !== 'category') {
        categoryDropdown.classList.remove('show');
        categorySelect.classList.remove('active');
    }

    // Закрываем теги
    if (except !== 'tags') {
        tagsDropdown.style.display = 'none';
    }
}

// --- МУЛЬТИСЕЛЕКТ: Теги ---
function toggleTagsDropdown(show) {
    if (show) {
        tagsDropdown.style.display = 'block';
        tagsSearch.focus();
    } else {
        tagsDropdown.style.display = 'none';
    }
}

// Фильтрация тегов
tagsSearch.addEventListener('input', () => {
    const query = tagsSearch.value.toLowerCase().trim();
    const options = tagsOptionsContainer.querySelectorAll('.tags_option');
    options.forEach(opt => {
        const label = opt.querySelector('label').textContent;
        if (label.toLowerCase().includes(query)) {
            opt.style.display = '';
        } else {
            opt.style.display = 'none';
        }
    });
});

// Открытие/закрытие тегов
tagsInput.addEventListener('click', (e) => {
    if (e.target === tagsSearch || e.target === tagsInput) {
        closeAllDropdowns(); // Сначала закрываем всё
        toggleTagsDropdown(true); // Потом открываем теги
    }
});

document.addEventListener('click', (e) => {
    if (!categorySelect.contains(e.target)) {
        categoryDropdown.classList.remove('show');
        categorySelect.classList.remove('active');
    }
    if (!tagsInput.contains(e.target) && !tagsDropdown.contains(e.target)) {
        tagsDropdown.style.display = 'none';
    }
});

// ========== AI АНАЛИЗ ==========
async function callAIAnalysis() {
    console.log('🔘 callAIAnalysis вызвана');
    
    if (!uploadedFile) {
        showModal('Файл не выбран', 'Сначала выберите PDF файл для анализа');
        return;
    }
    
    if (uploadedFile.type !== 'application/pdf') {
        showModal('Ошибка', 'AI анализ доступен только для PDF файлов');
        return;
    }
    
    if (isAnalyzing) {
        console.log('⏳ Анализ уже выполняется');
        return;
    }
    
    isAnalyzing = true;
    const analyzeBtn = document.querySelector('.analyze_button');
    const originalText = analyzeBtn ? analyzeBtn.textContent : 'Анализировать';
    
    if (analyzeBtn) {
        analyzeBtn.textContent = 'Анализируем...';
        analyzeBtn.disabled = true;
    }
    
    console.log('📄 Анализируем файл:', uploadedFile.name);
    
    try {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        
        const response = await fetch('/api/analyze-document', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        console.log('📊 Результат AI анализа:', result);
        
        if (response.ok && result.success) {
            aiAnalysisResult = result.analysis;
            showAISuggestionsModal(aiAnalysisResult);
        } else {
            showModal('Ошибка анализа', result.message || 'Не удалось проанализировать документ');
        }
    } catch (error) {
        console.error('❌ Ошибка:', error);
        showModal('Ошибка', 'Не удалось подключиться к серверу для анализа');
    } finally {
        isAnalyzing = false;
        if (analyzeBtn) {
            analyzeBtn.textContent = originalText;
            analyzeBtn.disabled = false;
        }
    }
}

function showAISuggestionsModal(analysis) {
    const modal = document.createElement('div');
    modal.className = 'modal_container active';
    modal.id = 'aiSuggestionsModal';
    
    let confidencePercent = Math.round((analysis.confidence || 0) * 1.5 * 100);
    confidencePercent = Math.min(confidencePercent, 100);
    
    let confidenceColor = '#155DFC'; // жёлтый по умолчанию (средняя уверенность)
        if (confidencePercent >= 60) {
            confidenceColor = '#155DFC'; // зелёный - высокая уверенность
        } else if (confidencePercent <= 30) {
            confidenceColor = '#155DFC'; // красный - низкая уверенность
        }

    modal.innerHTML = `
        <div class="modal_block" style="max-width: 600px;">
            <div class="modal_header" style="background-color: #1C4DFE; padding: 10px 30px;">
                <img style="width: 40px; height: 40px;" src="./src/image/ai.png" alt="ai">
                <h2 style="font-size: 20px; color: white;">Интеллектуальный анализ</h2>
                <button class="modal_close" onclick="this.closest('.modal_container').classList.remove('active')">
                    <img style="width: 20px; height: 20px;" src="./src/image/close_white.png" alt="Закрыть">
                </button>
            </div>
            <div class="modal_body" style="text-align: left;">
                <div style="margin-bottom: 20px; padding: 15px; background: #F1F5F9; border-radius: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <strong>Уверенность анализа:</strong>
                        <span style="color: ${confidenceColor}; font-weight: bold;">${confidencePercent}%</span>
                    </div>
                    <div style="background: #E2E8F0; height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: ${confidenceColor}; width: ${confidencePercent}%; height: 100%;"></div>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: bold; display: block; margin-bottom: 10px;">Предлагаемая категория:</label>
                    <div style="padding: 12px; background: ${analysis.category?.isNew ? '#FEF3C7' : '#F1F5F9'}; border-radius: 8px;">
                        <p>${analysis.category?.name || 'Не определена'}</p>
                        ${analysis.category?.isNew ? '<span style="color: #F59E0B; margin-left: 10px;">(новая категория)</span>' : ''}
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: bold; display: block; margin-bottom: 10px;">Предлагаемые теги:</label>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        ${analysis.tags?.map(tag => `
                            <div style="padding: 8px 12px; background: ${tag.isNew ? '#FEF3C7' : '#F1F5F9'}; border-radius: 6px;">
                                ${tag.name}
                                ${tag.isNew ? '<span style="color: #F59E0B; margin-left: 5px;">(новый)</span>' : ''}
                                <span style="color: #64748B; margin-left: 5px; font-size: 12px;">${Math.round(tag.confidence * 1.5 * 100)}%</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="form_actions" style="justify-content: space-between; padding: 0px 30px 20px 30px;">
                <button type="button" class="modal_cancel" id="rejectAISuggestions">Отклонить</button>
                <button type="button" class="modal_submit" id="acceptAISuggestions">Применить предложения</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const acceptBtn = modal.querySelector('#acceptAISuggestions');
    const rejectBtn = modal.querySelector('#rejectAISuggestions');
    const closeBtn = modal.querySelector('.modal_close');
    
    const closeModal = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    };
    
    if (acceptBtn) acceptBtn.addEventListener('click', () => {
        applyAISuggestions(analysis);
        closeModal();
    });
    if (rejectBtn) rejectBtn.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
}

async function applyAISuggestions(analysis) {
    try {
        let categoryId = analysis.category?.id;
        
        if (analysis.category?.isNew && analysis.category?.name) {
            showModal('Создание категории', `Создается категория "${analysis.category.name}"...`);
            const response = await fetch('/api/admin/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: analysis.category.name })
            });
            if (response.ok) {
                const result = await response.json();
                categoryId = result.category.category_id;
                await loadCategories();
                showModal('Успех', `Категория "${analysis.category.name}" успешно создана`);
            }
        }
        
        if (categoryId) {
            selectedCategoryId = categoryId;
            selectedCategory.textContent = analysis.category.name;
        }
        
        selectedTagIds.clear();
        
        if (analysis.tags) {
            for (const tag of analysis.tags) {
                let tagId = tag.id;
                if (tag.isNew && tag.name) {
                    const response = await fetch('/api/admin/tags', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: tag.name })
                    });
                    if (response.ok) {
                        const result = await response.json();
                        tagId = result.category.tag_id;
                        await loadTags();
                    }
                }
                if (tagId && selectedTagIds.size < 3) {
                    selectedTagIds.add(tagId.toString());
                }
            }
        }
        
        updateTagsDisplay();
        showModal('Готово', 'Предложения AI успешно применены к форме');
    } catch (error) {
        console.error('Ошибка:', error);
        showModal('Ошибка', 'Не удалось применить предложения AI');
    }
}

// --- Отправка формы ---
document.getElementById('documentForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!uploadedFile) {
        showModal('Файл не выбран', 'Пожалуйста, выберите PDF-файл для загрузки.');
        return;
    }

    if (!selectedCategoryId) {
        showModal('Категория не выбрана', 'Пожалуйста, выберите категорию документа.');
        return;
    }

    if (selectedTagIds.size === 0) {
        showModal('Теги не выбраны', 'Пожалуйста, выберите хотя бы один тег.');
        return;
    }

    const formData = new FormData();
    formData.append('file', uploadedFile);
    formData.append('title', documentNameInput.value.trim());
    formData.append('category_id', selectedCategoryId);
    formData.append('tag_ids', JSON.stringify(Array.from(selectedTagIds)));

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Устанавливаем название документа в модалку
            const docName = documentNameInput.value.trim() || uploadedFile.name;
            document.getElementById('uploadedDocName').textContent = docName;

            // Показываем модальное окно
            document.getElementById('successModal').classList.add('active');

            // --- Сброс формы ---
            document.getElementById('documentForm').reset();
            uploadedFile = null;
            resetUploadArea();
            selectedCategoryId = null;
            selectedTagIds.clear();
            updateTagsDisplay();
            selectedCategory.textContent = 'Выберите категорию';
        } else {
            alert('Ошибка: ' + (result.message || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка отправки:', error);
        showModal('Ошибка подключения', 'Не удалось отправить документ. Проверьте интернет-соединение и попробуйте снова.');    
    }
});

// Закрытие модального окна успеха
const successModal = document.getElementById('successModal');
const successModalCloseBtn = successModal.querySelector('.modal_close');
const successModalCancelBtn = successModal.querySelector('.modal_cancel');

function closeSuccessModal() {
    successModal.classList.remove('active');
}

successModalCloseBtn.addEventListener('click', closeSuccessModal);
successModalCancelBtn.addEventListener('click', closeSuccessModal);

// Закрытие по Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && successModal.classList.contains('active')) {
        closeSuccessModal();
    }
});

// --- Инициализация ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadCategories();
    await loadTags();
    updateTagsDisplay();
    resetUploadArea(); 

    const analyzeBtn = document.querySelector('.analyze_button');
    if (analyzeBtn) {
        console.log('✅ Привязываем обработчик к кнопке');
        analyzeBtn.onclick = function(e) {
            e.preventDefault();
            callAIAnalysis();
        };
    } else {
        console.error('❌ Кнопка .analyze_button не найдена');
    }

    // --- Делегирование кликов по uploadArea ---
    uploadArea.addEventListener('click', (e) => {
        // Клик ТОЛЬКО по кнопке "Выбрать файл"
        if (e.target.id === 'browseBtn') {
            e.preventDefault();
            fileInput.click();
        }

        // Клик ТОЛЬКО по кнопке "Удалить"
        if (e.target.id === 'removeFile') {
            e.stopPropagation();
            e.preventDefault();
            uploadedFile = null;
            resetUploadArea();
        }
    });
});
