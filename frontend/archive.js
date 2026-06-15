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

class ModalManager {
    constructor() {
        this.modals = {
            success: document.getElementById('successModal'),
            message: document.getElementById('messageModal'),
            deleteConfirm: document.getElementById('deleteConfirmModal')
        };

        this.bindEvents();
    }

    bindEvents() {
        // Кнопки закрытия
        document.querySelectorAll('.modal_close, .modal_cancel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal_container');
                if (modal) modal.style.display = 'none';
            });
        });

        // Закрытие по клику вне окна
        document.querySelectorAll('.modal_container').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    /**
     * Показывает модальное окно подтверждения
     * @param {string} itemName — имя элемента
     * @param {string} actionVerb — глагол
     * @param {string} pastTense — прошедшее время
     * @param {Function} onConfirm — функция, которая выполнится при подтверждении
     */

    confirmAction(itemName, actionVerb, pastTense, onConfirm) {
        const modal = this.modals.deleteConfirm;

        // Обновляем текст
        document.querySelector('#deleteConfirmModal .modal_body p span').textContent = actionVerb;
        document.getElementById('deleteItemName').textContent = itemName;

        // Настраиваем кнопку подтверждения
        const confirmBtn = modal.querySelector('#confirmDeleteBtn');
        const newBtn = confirmBtn.cloneNode(true);
        newBtn.textContent = actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1); 
        confirmBtn.replaceWith(newBtn);

        newBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            onConfirm(pastTense); 
        });

        modal.style.display = 'flex';
    }

    /**
     * Показывает сообщение об успехе
     * @param {string} fileName — имя файла
     * @param {string} pastTense — "удалён", "восстановлен"
     */

    showSuccess(fileName, pastTense) {
        const modal = this.modals.success;

        const h2 = modal.querySelector('.modal_header h2');
        h2.textContent = pastTense === 'восстановлен' ? 'Документ восстановлен' : 'Документ удален';

        const strong = modal.querySelector('#uploadedDocName');
        const span = modal.querySelector('#successModal .modal_body p span');
        strong.textContent = fileName;
        span.textContent = pastTense;

        modal.style.display = 'flex';
    }

    /**
     * @param {string} message — текст ошибки
     */

    showError(message) {
        document.getElementById('messageModalTitle').textContent = 'Ошибка';
        document.getElementById('messageModalText').textContent = message;
        this.modals.message.style.display = 'flex';
    }
}

class DocumentsManager {
    constructor() {
        this.documentsContainer = null;
        this.documents = [];
        this.originalDocuments = [];

        this.eventHandlers = new Map();
        this.observers = [];
        this.abortController = new AbortController();
        
        this.init();
    }

    async init() {
        this.createDocumentsContainer();

        // Сначала загружаем документы с сервера
        await this.loadDocuments();
        window.documentsManager = this;
    }

    createDocumentsContainer() {
        const contentBlock = document.querySelector('.content_block');
        contentBlock.replaceChildren();

        const container = document.createElement('div');
        container.className = 'documents_container';

        const header = document.createElement('div');
        header.className = 'documents_header';
        header.innerHTML = `
            <h2>Все архивированные документы</h2>
            <div class="documents_count">Загрузка...</div>
        `;

        const documentsList = document.createElement('div');
        documentsList.className = 'documents_list';
        documentsList.id = 'documentsList';

        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.innerHTML = '<p>Загрузка документов...</p>';
        documentsList.appendChild(loading);

        container.appendChild(header);
        container.appendChild(documentsList);
        contentBlock.appendChild(container);

        this.documentsContainer = container;
    }

    async loadDocuments() {
        try {
            console.log('Запрос к /api/documents...');
            
            // --- Запрос свежих данных с сервера ---
            const response = await fetch('/api/admin/documents', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const result = await response.json();

            if (!result.success) {
                this.showError(result.message || 'Не удалось загрузить документы');
                return;
            }

            console.log('Ответ от /api/documents:', result);

            // Просто сохраняем данные
            this.initialDocuments = [...result.documents]; 
            this.originalDocuments = [...result.documents];
            this.documents = [...result.documents];

            this.renderDocuments();
            this.updateDocumentCount();
        }
        catch (error) {
            console.error('Error loading documents:', error);
            this.showError('Ошибка при загрузке документов');
        }
    }

    updateDocumentCount() {
        const countElement = this.documentsContainer.querySelector('.documents_count');
        if (countElement) {
            countElement.textContent = `${this.documents.length} ${this.getDocumentWord(this.documents.length)}`;
        }
    }

    setupTooltipObserver() {
        this.tooltipObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const title = entry.target;
                const tooltip = title.nextElementSibling;
                if (title.scrollWidth > 300) {
                    tooltip.classList.add('multiline');
                } else {
                    tooltip.classList.remove('multiline');
                }
            }
        });

        document.querySelectorAll('.document_title').forEach(el => {
            this.tooltipObserver.observe(el);
        });
    }

    renderDocuments() {
        const documentsList = document.getElementById('documentsList');
        if (!documentsList) return;

        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
        
        // Используем replaceChildren для очистки
        documentsList.replaceChildren(); 

        if (this.documents.length === 0) {
            documentsList.innerHTML = this.getEmptyStateHTML();
            return;
        }

        // Используем DocumentFragment для лучшей производительности
        const fragment = document.createDocumentFragment();
        
        this.documents.forEach(doc => {
            const card = this.createDocumentCardElement(doc);
            fragment.appendChild(card);
        });

        documentsList.appendChild(fragment);

        this.setupTooltipObserver();
    }

    createDocumentCardElement(doc) {
        const card = document.createElement('div');
        card.className = 'document_card';
        card.dataset.id = doc.id;
        card.dataset.category = doc.category;

        let previewHTML = '';

        if (doc.previewImage) {
            // Показываем готовое превью с сервера
            previewHTML = `<img src="${doc.previewImage}" alt="Превью" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">`;
        } else {
            // Если превью нет — показыываем заглушку
            previewHTML = `
                <div style="
                    width: 100%; 
                    height: 100%; 
                    background: #f0f0f0; 
                    border-radius: 8px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-size: 12px; 
                    color: #888;
                ">
                    Нет превью
                </div>
            `;
        }

        card.innerHTML = `
            <div class="document_preview">${previewHTML}</div>
            <div class="document_content">
                <div class="tooltip-wrapper">
                    <h3 class="document_title">${doc.title}</h3>
                    <span class="tooltip">${doc.title}</span>
                </div>
            </div>
            <div class="action_buttons">
                <button class="action_btn restore_btn">Восстановить</button>
                <button class="action_btn delete_btn">Удалить</button>
            </div>
        `;

        // Добавляем обработчики событий
        const restoreBtn = card.querySelector('.restore_btn');
        const deleteBtn = card.querySelector('.delete_btn');

        restoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.confirmRestore(doc.id, doc.title);
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.confirmDelete(doc.id, doc.title);
        });

        return card;
    }

    async confirmRestore(docId, title) {
        window.modalManager.confirmAction(
            title,
            'восстановить',
            'восстановлен',
            async (pastTense) => {
                try {
                    const response = await fetch(`/api/admin/documents/restore/${docId}`, {
                        method: 'POST',
                        credentials: 'include'
                    });

                    const result = await response.json();

                    if (result.success) {
                        window.modalManager.showSuccess(title, pastTense);
                        this.loadDocuments(); // Обновляем список
                    } else {
                        window.modalManager.showError(result.message || 'Не удалось восстановить документ.');
                    }
                } catch (error) {
                    console.error('Ошибка восстановления:', error);
                    window.modalManager.showError('Не удалось восстановить документ.');
                }
            }
        );
    }

    async confirmDelete(docId, title) {
        window.modalManager.confirmAction(
            title,
            'навсегда удалить',
            'удалён',
            async (pastTense) => {
                try {
                    const response = await fetch(`/api/admin/documents/delete/${docId}`, {
                        method: 'DELETE',
                        credentials: 'include'
                    });

                    const result = await response.json();

                    if (result.success) {
                        window.modalManager.showSuccess(title, pastTense);
                        this.loadDocuments(); // Обновляем список
                    } else {
                        window.modalManager.showError(result.message || 'Не удалось удалить документ.');
                    }
                } catch (error) {
                    console.error('Ошибка удаления:', error);
                    window.modalManager.showError('Не удалось удалить документ.');
                }
            }
        );
    }

    updateDocumentCard(docId) {
        const card = document.querySelector(`.document_card[data-id="${docId}"]`);
        if (!card || !card.isConnected) return;

        const doc = this.documents.find(d => d.id === docId);
        if (!doc) return;
    }

    getDocumentWord(count) {
        const lastDigit = count % 10;
        const lastTwoDigits = count % 100;
        if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'документов';
        if (lastDigit === 1) return 'документ';
        if (lastDigit >= 2 && lastDigit <= 4) return 'документа';
        return 'документов';
    }

    showError(message) {
        const documentsList = document.getElementById('documentsList');
        documentsList.innerHTML = `
            <div class="empty_state">
                <h3>Ошибка загрузки</h3>
                <p>${message}</p>
                <button onclick="documentsManager.loadDocuments()"
                        style="margin-top: 16px; padding: 8px 16px; background: #1C4DFE; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    Повторить попытку
                </button>
            </div>
        `;
    }
}

let documentsManager;

function initializeDocumentsManager() {
    if (!documentsManager) {
        documentsManager = new DocumentsManager();
        window.documentsManager = documentsManager;
    }
    return documentsManager;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDocumentsManager);
} else {
    initializeDocumentsManager();
}

let modalManager;

function initializeModalManager() {
    if (!modalManager) {
        modalManager = new ModalManager();
        window.modalManager = modalManager;
    }
    return modalManager;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeModalManager();
        initializeDocumentsManager();
    });
} else {
    initializeModalManager();
    initializeDocumentsManager();
}