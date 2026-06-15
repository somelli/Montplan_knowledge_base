// folder_view.js - просмотр содержимого папки избранного

// Глобальное состояние
const state = {
    folderId: null,
    folderData: null,
    documents: [],
    isEditing: false,
    selectedDocuments: new Set() // Храним favourite_id
};

// DOM элементы
let notification = null;
let notificationMessage = null;
let editBtn = null;
let deleteBtn = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
    notification = document.getElementById('notification');
    notificationMessage = document.getElementById('notificationMessage');
    editBtn = document.querySelector('.action_btn.edit_btn');
    deleteBtn = document.querySelector('.action_btn.delete_btn');

    // Получаем ID папки из URL параметров
    const urlParams = new URLSearchParams(window.location.search);
    state.folderId = urlParams.get('folderId');

    if (!state.folderId) {
        showNotification('Не указан ID папки', 'error');
        setTimeout(() => {
            window.location.href = '/favourites.html';
        }, 2000);
        return;
    }

    // Загружаем данные
    await loadUserData();
    await loadFolderData();
    await loadFolderDocuments();

    // Настраиваем обработчики событий
    setupEventListeners();
});

// Настройка обработчиков событий
function setupEventListeners() {
    // Кнопка "Назад"
    document.getElementById('backToList').addEventListener('click', () => {
        window.location.href = '/favourites.html';
    });

    // Кнопка редактирования
    editBtn?.addEventListener('click', toggleEditMode);

    // Кнопка удаления выбранных
    deleteBtn?.addEventListener('click', bulkDeleteSelected);

    // Закрытие уведомления по клику
    notification?.addEventListener('click', hideNotification);
}

// Переключение режима редактирования
function toggleEditMode() {
    state.isEditing = !state.isEditing;
    editBtn.setAttribute('data-editing', state.isEditing);

    if (state.isEditing) {
        editBtn.querySelector('img').src = './src/image/save.svg';
        editBtn.title = 'Сохранить';
        deleteBtn.style.display = 'flex';
        document.body.classList.add('editing'); // Включаем отображение чекбоксов
        enableCheckboxes();
    } else {
        editBtn.querySelector('img').src = './src/image/edit.svg';
        editBtn.title = 'Редактировать';
        deleteBtn.style.display = 'none';
        document.body.classList.remove('editing'); // Скрываем чекбоксы
        state.selectedDocuments.clear();
    }
}

// Включаем чекбоксы
function enableCheckboxes() {
    const rows = document.querySelectorAll('#all_table_body tr');
    rows.forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = state.selectedDocuments.has(checkbox.dataset.id);
        }
    });

    // Отключаем клик по строке
    rows.forEach(row => {
        row.style.cursor = 'default';
        row.onclick = null;
    });
}


// Обновляем список выбранных документов
function updateSelection() {
    const checkboxes = document.querySelectorAll('#all_table_body input[type="checkbox"]');
    state.selectedDocuments = new Set(
        Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.dataset.id)
    );
}

// Обработчик изменения чекбокса
function handleCheckboxChange(e) {
    updateSelection();
}

// Удаление выбранных документов
async function bulkDeleteSelected() {
    if (state.selectedDocuments.size === 0) {
        showNotification('Ничего не выбрано', 'warning');
        return;
    }

    openDeleteConfirmModal('выбранные документы', async () => {
        try {
            const response = await fetch('/api/favourites/bulk-unassign-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    favourite_ids: Array.from(state.selectedDocuments).map(id => parseInt(id))
                })
            });

            const result = await response.json();

            if (response.ok) {
                showNotification(`Откреплено ${result.unassigned} документов от папки`, 'success');
                // Обновляем список
                await loadFolderDocuments();
                toggleEditMode(); // Выходим из режима редактирования
            } else {
                showNotification(result.message || 'Ошибка при откреплении', 'error');
            }
        } catch (error) {
            console.error('Ошибка при массовом откреплении:', error);
            showNotification('Ошибка сети', 'error');
        }
    });
}

// Загрузка данных пользователя
async function loadUserData() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            const data = await response.json();
            if (data.user) {
                const userRole = data.user.roles?.[0] || 'Пользователь';
                const userNameSpan = document.querySelector('.user_info span');
                const userRoleDiv = document.querySelector('.user_role');
                if (userNameSpan) userNameSpan.textContent = data.user.name || data.user.email;
                if (userRoleDiv) userRoleDiv.textContent = userRole.toLowerCase();
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
    }
}

// Загрузка данных о папке
async function loadFolderData() {
    try {
        const response = await fetch(`/api/folders/${state.folderId}`);
        if (!response.ok) throw new Error('Не удалось загрузить данные папки');
        state.folderData = await response.json();
        const titleElement = document.querySelector('.main_title');
        if (titleElement) titleElement.textContent = state.folderData.name;
    } catch (error) {
        console.error('Ошибка при загрузке данных папки:', error);
        showNotification('Не удалось загрузить данные папки', 'error');
        setTimeout(() => window.location.href = '/favourites.html', 2000);
    }
}

// Загрузка документов из папки
async function loadFolderDocuments() {
    try {
        const response = await fetch(`/api/favourites?folderId=${state.folderId}`);
        if (!response.ok) throw new Error('Не удалось загрузить документы папки');
        state.documents = await response.json();
        renderDocumentsTable(state.documents);
    } catch (error) {
        console.error('Ошибка при загрузке документов папки:', error);
        showNotification('Не удалось загрузить документы папки', 'error');
        renderEmptyTable('Не удалось загрузить документы');
    }
}

// Рендеринг таблицы документов
function renderDocumentsTable(documents) {
    const tableBody = document.getElementById('all_table_body');
    if (!tableBody) return;

    if (!documents || documents.length === 0) {
        renderEmptyTable('В этой папке пока нет документов');
        return;
    }

    tableBody.innerHTML = '';

    documents.forEach(doc => {
        const row = document.createElement('tr');
        row.dataset.favouriteId = doc.favourite_id;

        row.innerHTML = `
            <td>
                <div class="checkbox-container">
                    <input type="checkbox" data-id="${doc.favourite_id}">
                </div>
            </td>
            <td class="doc_col">
                <div class="doc_block">
                    <img src="./src/image/document.png" alt="Документ">
                    <div class="doc_info">
                        <span class="doc_title">${doc.title || 'Без названия'}</span>
                    </div>
                </div>
            </td>
            <td class="date_col">${formatDate(doc.upload_date)}</td>
        `;

        // Назначаем поведение строки
        if (state.isEditing) {
            row.style.cursor = 'default';
            row.onclick = null;
        } else {
            row.style.cursor = 'pointer';
            row.onclick = () => {
                window.location.href = `/viewing.html?id=${doc.document_id}&from=folder`;
            };
        }

        // Добавляем обработчик изменения чекбокса
        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', handleCheckboxChange);

        tableBody.appendChild(row);
    });
}

function renderEmptyTable(message) {
    const tableBody = document.getElementById('all_table_body');
    if (!tableBody) return;
    tableBody.innerHTML = `<tr class="empty_row"><td colspan="2">${message}</td></tr>`;
}

// Форматирование даты
function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU');
}

// Открытие модального окна подтверждения удаления
function openDeleteConfirmModal(itemName, onConfirm) {
    let modal = document.getElementById('deleteConfirmModal');
    if (!modal) {
        modal = createDeleteModal();
        document.body.appendChild(modal);
    }

    const itemNameElement = modal.querySelector('#deleteItemName');
    itemNameElement.textContent = itemName;

    const confirmButton = modal.querySelector('#confirmDeleteBtn');
    const newConfirmButton = confirmButton.cloneNode(true);
    confirmButton.replaceWith(newConfirmButton);
    newConfirmButton.onclick = () => {
        onConfirm();
        closeModal(modal);
    };

    const cancelButton = modal.querySelector('.modal_cancel');
    cancelButton.onclick = () => closeModal(modal);

    const closeBtn = modal.querySelector('.modal_close');
    closeBtn.onclick = () => closeModal(modal);

    modal.classList.add('active');
}

// Создание модального окна подтверждения удаления
function createDeleteModal() {
    const modal = document.createElement('div');
    modal.id = 'deleteConfirmModal';
    modal.className = 'modal_container';

    modal.innerHTML = `
        <div class="modal_block">
            <div class="modal_header">
                <h2>Подтвердите удаление</h2>
                <button class="modal_close"><img src="./src/image/close.png" alt="Закрыть"></button>
            </div>
            <div class="modal_body">
                <p>Вы уверены, что хотите удалить <strong id="deleteItemName">элемент</strong>?<br>Это действие нельзя отменить.</p>
            </div>
            <div class="form_actions" style="padding: 20px 30px; margin: 0;">
                <button type="button" class="modal_cancel">Отмена</button>
                <button type="button" class="modal_submit" id="confirmDeleteBtn">Удалить</button>
            </div>
        </div>
    `;

    return modal;
}

// Закрытие модального окна
function closeModal(modal) {
    if (modal && modal.classList.contains('active')) {
        modal.classList.remove('active');
    }
}

// Показать уведомление
function showNotification(message, type = 'success') {
    if (!notification || !notificationMessage) return;
    notificationMessage.textContent = message;
    notification.style.background = {
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B'
    }[type] || '#10B981';
    notification.classList.add('show');
    setTimeout(hideNotification, 3000);
}

// Скрыть уведомление
function hideNotification() {
    if (notification) {
        notification.classList.remove('show');
    }
}

// Обновление данных
window.refreshFolderView = async function() {
    await loadFolderData();
    await loadFolderDocuments();
};