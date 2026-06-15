async function loadUserData() {
    try {
        const response = await fetch('/api/user');
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.user) {
                // Получаем первую роль из массива или показываем 'Пользователь' по умолчанию
                const userRole = data.user.roles && data.user.roles.length > 0 
                    ? data.user.roles[0] 
                    : 'Пользователь';
                
                // Обновляем данные в хедере
                const userNameSpan = document.querySelector('.user_info span');
                const userRoleDiv = document.querySelector('.user_role');
                
                if (userNameSpan) userNameSpan.textContent = data.user.name || data.user.email;
                if (userRoleDiv) userRoleDiv.textContent = userRole.toLowerCase();
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
    }
}

document.addEventListener('DOMContentLoaded', loadUserData);

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

let fileInput = document.getElementById('fileInput');
let browseBtn = document.getElementById('browseBtn');

let allCategories = [];
let allTags = [];
let selectedCategoryId = null;
let selectedTagIds = new Set();
let uploadedFile = null;

document.getElementById('back_btn').addEventListener('click', (e) => {
    e.preventDefault();

    const docId = new URLSearchParams(window.location.search).get('id');
    if (docId) {
        window.location.href = `/viewing.html?id=${docId}`;
    } else {
        window.history.back() || (window.location.href = '/template.html');
    }
});

documentNameInput.addEventListener('focus', () => {
    documentInputBlock.classList.add('focused');
});

documentNameInput.addEventListener('blur', () => {
    documentInputBlock.classList.remove('focused');
});

// Кастомный селект для категорий
function toggleCategoryDropdown(show) {
    if (show) {
        categoryDropdown.classList.add('show');
        categorySelect.classList.add('active');
    } else {
        categoryDropdown.classList.remove('show');
        categorySelect.classList.remove('active');
    }
}

function showModal(title, message) {
    const modal = document.getElementById('messageModal');
    const titleElement = modal.querySelector('#messageModalTitle');
    const messageElement = modal.querySelector('#messageModalText');
    
    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;
    modal.classList.add('active');

    // Закрытие по кнопкам
    const closeBtn = modal.querySelector('.modal_close');
    const cancelBtn = modal.querySelector('.modal_cancel');

    function closeModal() {
        modal.classList.remove('active');
        if (closeBtn) closeBtn.removeEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.removeEventListener('click', closeModal);
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Закрытие по Escape
    function handleEsc(e) {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    }
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
    tagsList.innerHTML = '';

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

    if (selectedTagIds.size > 0) {
        tagsList.style.display = 'flex';
        tagsSearch.placeholder = '';
    } else {
        tagsList.style.display = 'none';
        tagsSearch.placeholder = 'Выбирите до 3 тегов';
    }

    const checkboxes = tagsOptionsContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        const tagId = checkbox.value;
        checkbox.checked = selectedTagIds.has(tagId);
    });

    tagsList.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tagId = e.target.dataset.id;
            selectedTagIds.delete(tagId);
            updateTagsDisplay();
        });
    });
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

// Закрытие всех выпадающих списков
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

// Закрытие модального окна успеха
const successModal = document.getElementById('successModal');
const successModalCloseBtn = successModal.querySelector('.modal_close');
const successModalCancelBtn = successModal.querySelector('.modal_cancel');

function closeSuccessModal() {
    const docId = window.documentToRedirectId;
    if (docId) {
        window.location.href = `/viewing.html?id=${docId}`;
    } else {
        window.history.back();
    }
}

successModalCloseBtn.addEventListener('click', closeSuccessModal);
successModalCancelBtn.addEventListener('click', closeSuccessModal);

// Закрытие по Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && successModal.classList.contains('active')) {
        closeSuccessModal();
    }
});

// Загрузка данных документа
async function loadDocumentData(docId) {
    try {
        const response = await fetch(`/api/admin/documents/${docId}`);
        if (!response.ok) throw new Error('Документ не найден');

        const doc = await response.json();

        // Заполняем форму
        documentNameInput.value = doc.title;
        document.getElementById('documentNameCounter').innerText = `${doc.title.length}/50`;

        // Устанавливаем категорию
        selectedCategoryId = doc.category_id;
        selectedCategory.textContent = doc.category_name;

        // Устанавливаем теги
        selectedTagIds = new Set(doc.tags.map(tag => {
            const found = allTags.find(t => t.name === tag);
            return found ? found.tag_id.toString() : null;
        }).filter(Boolean));
        updateTagsDisplay();
    } catch (error) {
        console.error('Ошибка загрузки данных документа:', error);
        showModal('Ошибка', 'Не удалось загрузить данные документа');
    }
}

// Сохранение изменений
document.getElementById('documentForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedCategoryId) {
        showModal('Ошибка', 'Выберите категорию');
        return;
    }

    const formData = {
        title: documentNameInput.value.trim(),
        category_id: selectedCategoryId,
        tag_ids: Array.from(selectedTagIds)
    };

    try {
        const response = await fetch(`/api/admin/documents/${documentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            document.getElementById('uploadedDocName').textContent = formData.title;
             window.documentToRedirectId = result.document.id;
            successModal.classList.add('active');
        } else {
            showModal('Ошибка', result.message || 'Не удалось сохранить изменения');
        }
    } catch (error) {
        console.error('Ошибка отправки формы:', error);
        showModal('Ошибка', 'Не удалось подключиться к серверу');
    }
});

document.getElementById('archive_btn').addEventListener('click', (e) => {
    const docId = new URLSearchParams(window.location.search).get('id');
    if (!docId) return;

    e.preventDefault();
    
    // Получаем название документа
    const documentTitle = documentNameInput.value.trim() || 'документ';

    const message = `Вы уверены, что хотите отправить <strong>${documentTitle}</strong> в архив?`;
    
    showConfirmModal(
        'Подтвердите архивацию',
        message,
        async () => {
            await handleArchiveDocument();
        }
    );
});


// Отправка запроса на архивацию
async function handleArchiveDocument() {
    try {
        const response = await fetch(`/api/admin/documents/${documentId}/archive`, {
            method: 'PATCH',
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            showSuccessModal('Документ успешно архивирован!');
            setTimeout(() => {
                window.location.href = '/template.html';
            }, 1500);
        } else {
            showModal('Ошибка', result.message || 'Не удалось заархивировать документ.');
        }
    } catch (error) {
        console.error('Ошибка при архивации:', error);
        showModal('Ошибка', 'Не удалось подключиться к серверу.');
    }
}

// Удаление документа
document.getElementById('delete_btn').addEventListener('click', () => {
    const docId = new URLSearchParams(window.location.search).get('id');
    if (!docId) return;

    showConfirmModal(
        'Подтвердите удаление',
        `Вы уверены, что хотите навсегда удалить <strong>${documentNameInput.value || 'документ'}</strong>?`,
        async () => {
            try {
                const response = await fetch(`/api/admin/documents/delete/${docId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });

                if (response.ok) {
                    showSuccessModal('Документ успешно удалён!');
                    setTimeout(() => {
                        window.location.href = '/template.html';
                    }, 1500);
                } else {
                    const result = await response.json();
                    showModal('Ошибка', result.message || 'Не удалось удалить документ');
                }
            } catch (error) {
                console.error('Ошибка при удалении:', error);
                showModal('Ошибка', 'Не удалось подключиться к серверу');
            }
        }
    );
});

// Функция показа модального окна подтверждения
function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('messageDeleteArchiveModal');
    const titleElement = modal.querySelector('#messageModalTitle');
    const messageElement = modal.querySelector('#messageModalText');
    
    // Устанавливаем заголовок
    if (titleElement) titleElement.textContent = title;
    
    if (messageElement) messageElement.innerHTML = message;
    
    const confirmBtn = modal.querySelector('.modal_submit');
    const cancelBtn = modal.querySelector('.modal_cancel');
    const closeBtn = modal.querySelector('.modal_close');
    
    // Показываем модальное окно
    modal.classList.add('active');
    
    // Обработчики событий
    function closeModal() {
        modal.classList.remove('active');
        cleanUpEvents();
    }
    
    function handleConfirm() {
        onConfirm();
        closeModal();
    }
    
    function cleanUpEvents() {
        if (confirmBtn) confirmBtn.removeEventListener('click', handleConfirm);
        if (cancelBtn) cancelBtn.removeEventListener('click', closeModal);
        if (closeBtn) closeBtn.removeEventListener('click', closeModal);
        document.removeEventListener('keydown', handleEsc);
    }
    
    function handleEsc(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    }
    
    // Добавляем обработчики
    if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    document.addEventListener('keydown', handleEsc);
}

// Функция показа успешного модального окна
function showSuccessModal(message) {
    const modal = document.getElementById('successDeleteArchiveModal');
    const h2 = modal.querySelector('h2');
    const p = modal.querySelector('.modal_body p');
    
    if (h2) h2.textContent = 'Успешно!';
    if (p) p.innerHTML = `<p>${message}</p>`;
    
    modal.classList.add('active');
    
    // Закрытие по кнопке
    const closeBtn = modal.querySelector('.modal_close');
    const cancelBtn = modal.querySelector('.modal_cancel');
    
    function closeModal() {
        modal.classList.remove('active');
        if (closeBtn) closeBtn.removeEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.removeEventListener('click', closeModal);
        document.removeEventListener('keydown', handleEsc);
    }
    
    function handleEsc(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    }
    
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    document.addEventListener('keydown', handleEsc);
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadCategories();
    await loadTags();

    const urlParams = new URLSearchParams(window.location.search);
    documentId = urlParams.get('id');

    if (documentId) {
        await loadDocumentData(documentId);
    } else {
        showModal('Ошибка', 'Не указан ID документа');
    }

    updateTagsDisplay();
});