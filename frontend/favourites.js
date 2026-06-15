// favourites.js - управление избранными документами

// Состояние приложения
const state = {
    activeTab: 'all', // all, folders
    data: {
        documents: null,
        folders: null,
        stats: {
            total: 0,
            folders: 0
        }
    },
    isLoading: false
};

// Конфигурация для каждой вкладки
const tabConfig = {
    all: {
        tableId: 'all_documents_table',
        apiEndpoint: '/api/favourites',
        title: 'Все избранное',
        columns: ['Документ', 'Категория', 'Дата добавления', 'Действия']
    },
    folders: {
        tableId: 'folders_table',
        apiEndpoint: '/api/folders',
        title: 'Папки',
        columns: ['Папка', 'Кол-во документов', 'Дата создания', 'Действия']
    }
};

// DOM элементы
let folderModal = null;
let moveToFolderModal = null;
let currentDocumentId = null;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

// Экранирование HTML для защиты от XSS
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Форматирование даты
function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU');
}

// Вспомогательная функция: затемнение цвета
function shadeColor(color, percent) {
    let R = parseInt(color.slice(1, 3), 16);
    let G = parseInt(color.slice(3, 5), 16);
    let B = parseInt(color.slice(5, 7), 16);

    R = Math.max(0, Math.min(255, R + percent));
    G = Math.max(0, Math.min(255, G + percent));
    B = Math.max(0, Math.min(255, B + percent));

    const newR = R.toString(16).padStart(2, '0');
    const newG = G.toString(16).padStart(2, '0');
    const newB = B.toString(16).padStart(2, '0');

    return `#${newR}${newG}${newB}`;
}

// Закрытие всех кастомных дропдаунов
function closeAllCustomDropdowns() {
    document.querySelectorAll('.custom_select .select_dropdown').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
    document.querySelectorAll('.custom_select').forEach(select => {
        select.classList.remove('active');
    });
}

// Показать уведомление
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const messageSpan = document.getElementById('notificationMessage');
    
    if (!notification || !messageSpan) return;
    
    messageSpan.textContent = message;
    
    const colors = {
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B'
    };
    notification.style.background = colors[type] || colors.success;
    
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Закрытие модального окна
function closeModal(modal) {
    if (modal && modal.classList.contains('active')) {
        modal.classList.remove('active');
    }
}

// ========== ОСНОВНЫЕ ФУНКЦИИ ==========

// Загрузка данных пользователя
async function loadUserData() {
    try {
        const response = await fetch('/api/user');
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.user) {
                const userRole = data.user.roles && data.user.roles.length > 0 
                    ? data.user.roles[0] 
                    : 'Пользователь';
                
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

// Загрузка статистики
async function loadStats() {
    try {
        const favResponse = await fetch('/api/favourites/count');
        const foldersResponse = await fetch('/api/folders');
        
        if (favResponse.ok && foldersResponse.ok) {
            const favData = await favResponse.json();
            const foldersData = await foldersResponse.json();
            
            state.stats = {
                total: favData.count || 0,
                folders: foldersData.length || 0
            };
            updateStatsDisplay();
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// Обновление отображения статистики
function updateStatsDisplay() {
    const totalElement = document.querySelector('.stat_item:first-child .stat_number');
    const foldersElement = document.querySelectorAll('.stat_item .stat_number')[1];
    
    if (totalElement) totalElement.textContent = state.stats.total || 0;
    if (foldersElement) foldersElement.textContent = state.stats.folders || 0;
}

// Инициализация горизонтального скролла
function initHorizontalScroll() {
    const container = document.querySelector('.stats_container');
    if (!container) return;

    container.addEventListener('wheel', function (e) {
        if (e.deltaY === 0) return;
        e.preventDefault();
        this.scrollBy({
            left: e.deltaY,
            behavior: 'smooth'
        });
    });
}

// Фоновая загрузка данных
async function preloadData(tabName) {
    if (state.isLoading || state.data[tabName]) return;
    
    try {
        const response = await fetch(tabConfig[tabName].apiEndpoint);
        if (response.ok) {
            const data = await response.json();
            state.data[tabName] = data;
            console.log(`[PRELOAD] Data preloaded for ${tabName}`);
        }
    } catch (error) {
        console.warn(`[PRELOAD] Failed to preload ${tabName}:`, error);
    }
}

// Обновление заголовка
function updateTitle(tabName) {
    const mainTitle = document.querySelector('.main_title');
    if (mainTitle) {
        mainTitle.textContent = tabConfig[tabName].title;
    }
}

// Обновление кнопок вкладок
function updateTabButtons(activeTabName) {
    const tabButtons = document.querySelectorAll('.control_button');
    
    tabButtons.forEach(button => {
        const tabName = button.getAttribute('data-tab');
        if (tabName === activeTabName) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

// Показ активной таблицы
function showActiveTable(tabName) {
    const allTables = document.querySelectorAll('.table_container');
    allTables.forEach(table => {
        table.classList.remove('active');
    });
    
    const activeTable = document.getElementById(tabConfig[tabName].tableId);
    if (activeTable) {
        activeTable.classList.add('active');
    }
}

// Фоновая проверка обновлений
async function checkForUpdates(tabName) {
    try {
        const response = await fetch(tabConfig[tabName].apiEndpoint);
        if (response.ok) {
            const freshData = await response.json();
            
            if (freshData.length !== state.data[tabName]?.length) {
                console.log(`[UPDATE] Data changed for ${tabName}, updating...`);
                state.data[tabName] = freshData;
                renderTable(tabName, freshData);
                loadStats();
            }
        }
    } catch (error) {
        console.log(`[UPDATE] Failed to check updates for ${tabName}`);
    }
}

// Загрузка данных для вкладки
async function loadDataForTab(tabName) {
    const config = tabConfig[tabName];
    if (!config) return;
    
    try {
        const response = await fetch(config.apiEndpoint);
        
        if (!response.ok) {
            throw new Error(`Ошибка загрузки данных: ${response.status}`);
        }
        
        const data = await response.json();
        
        state.data[tabName] = data;
        renderTable(tabName, data);
        
    } catch (error) {
        console.error(`Ошибка загрузки данных для вкладки ${tabName}:`, error);
        
        const tableBody = document.getElementById(`${tabName}_table_body`);
        if (tableBody) {
            const columnsCount = config.columns.length;
            tableBody.innerHTML = `
                <tr class="error-row">
                    <td colspan="${columnsCount}">
                        <div style="padding: 20px; text-align: center; color: #dc3545;">
                            <p>Ошибка загрузки данных</p>
                            <p style="font-size: 14px; margin-top: 10px;">${error.message}</p>
                            <button onclick="loadDataForTab('${tabName}')" 
                                    style="margin-top: 10px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                Попробовать снова
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }
    }
}

// Переключение вкладки
function switchTab(tabName) {
    if (!tabConfig[tabName] || state.activeTab === tabName) {
        return;
    }
    
    state.activeTab = tabName;
    
    updateTabButtons(tabName);
    showActiveTable(tabName);
    updateTitle(tabName);
    
    const addButton = document.getElementById('createFolderBtn');
    if (addButton) {
        addButton.classList.toggle('hidden', tabName !== 'folders');
    }

    const cachedData = state.data[tabName];
    
    if (cachedData) {
        renderTable(tabName, cachedData);
        checkForUpdates(tabName);
    } else {
        loadDataForTab(tabName);
    }
}

// Рендеринг таблицы
function renderTable(tabName, data) {
    const tableBodyId = `${tabName}_table_body`;
    const tableBody = document.getElementById(tableBodyId);
    
    if (!tableBody) {
        console.error(`[RENDER] ❌ Table body not found for: ${tableBodyId}`);
        return;
    }
    
    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr class="empty_row">
                <td colspan="${tabConfig[tabName].columns.length}">
                    Нет данных для отображения
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = '';
    
    switch (tabName) {
        case 'all':
            renderAllDocumentsTable(data, tableBody);
            break;
        case 'folders':
            renderFoldersTable(data, tableBody);
            break;
    }
}

// Рендеринг таблицы всех документов
function renderAllDocumentsTable(documents, tableBody) {
    documents.forEach(doc => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td class="doc_col">
                <div class="doc_block">
                    <img src="./src/image/document.png" alt="Документ">
                    <div class="doc_info">
                        <span class="doc_title">${escapeHtml(doc.title || 'Без названия')}</span>
                    </div>
                </div>
            </td>
            <td class="category_col">${escapeHtml(doc.category || 'Без категории')}</td>
            <td class="date_col">${formatDate(doc.upload_date)}</td>
            <td class="actions_col">
                <button class="action_btn view_btn" data-id="${doc.document_id}" data-type="document" title="Просмотреть">
                    <img src="./src/image/view_blue.png" alt="Открыть">
                </button>
                <button class="action_btn move_btn ${doc.folder_id ? 'in-folder' : ''}" 
                        data-fav-id="${doc.favourite_id}" 
                        data-document-id="${doc.document_id}"
                        data-type="document" 
                        title="Переместить в папку">
                    <svg viewBox="0 0 20.5 19.5" xmlns="http://www.w3.org/2000/svg" width="20.500000" height="19.500000" fill="none">
                        <path d="M1.75 0.75L7.75 0.75L10.25 3.75L18.75 3.75C19.3023 3.75 19.75 4.1977 19.75 4.75L19.75 17.75C19.75 18.3023 19.3023 18.75 18.75 18.75L1.75 18.75C1.19772 18.75 0.75 18.3023 0.75 17.75L0.75 1.75C0.75 1.19772 1.19772 0.75 1.75 0.75Z" fill-rule="nonzero" stroke="rgb(127.5,127.5,127.5)" stroke-linejoin="round" stroke-width="1.500000" />
                    </svg>
                </button>
                <button class="action_btn delete_btn" 
                        data-fav-id="${doc.favourite_id}" 
                        data-document-id="${doc.document_id}" 
                        data-type="document" 
                        title="Удалить из избранного">
                    <img src="./src/image/delete.png" alt="Удалить">
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    addActionHandlers('document');
}

// Рендеринг таблицы папок
function renderFoldersTable(folders, tableBody) {
    folders.forEach(folder => {
        const row = document.createElement('tr');
        
        const folderColor = folder.color || '#548BA0';
        const darkColor = shadeColor(folderColor, -20);

        row.innerHTML = `
            <td class="folder_col">
                <div class="folder_block">
                    <div class="folder_icon" style="width: 36px; height: 36px; display: inline-block;">
                        <svg viewBox="0 0 36.3633 36.0654" xmlns="http://www.w3.org/2000/svg" width="36.363281" height="36.065430" fill="none">
                            <rect width="36.016750" height="36.065662" x="0" y="0" transform="matrix(1,0,0.00959781,1,0,0)" fill="#F1F5F9"/>
                            <path d="M0 1.50274L0 25.5465L3.75175 10.5192L26.6374 10.5192L26.6374 6.01094C26.6374 5.18098 25.9655 4.50821 25.1367 4.50821L15.007 4.50821L11.2552 0L1.5007 0C0.671885 0 0 0.672798 0 1.50274Z" 
                                  fill="${darkColor}" fill-rule="nonzero" transform="matrix(1,0,0.00959781,1,3.05176,5.25977)" />
                            <path d="M27.0126 15.0274L30.014 0L3.61106 0L0 15.0274L27.0126 15.0274Z" 
                                  fill="${folderColor}" fill-rule="nonzero" transform="matrix(1,0,0.00959781,1,3.15234,15.7788)" />
                        </svg>
                    </div>
                    <span>${escapeHtml(folder.name)}</span>
                </div>
            </td>
            <td class="count_col">${folder.documentsCount || 0}</td>
            <td class="actions_col">
                <button class="action_btn open_btn" data-id="${folder.folder_id}" data-type="folder" title="Открыть папку">
                    <svg viewBox="0 0 20.5 19.5" width="20.5" height="19.5" fill="none">
                        <path d="M1.75 0.75L7.75 0.75L10.25 3.75L18.75 3.75C19.3023 3.75 19.75 4.1977 19.75 4.75L19.75 17.75C19.75 18.3023 19.3023 18.75 18.75 18.75L1.75 18.75C1.19772 18.75 0.75 18.3023 0.75 17.75L0.75 1.75C0.75 1.19772 1.19772 0.75 1.75 0.75Z" stroke="#1C4DFE" stroke-width="1.5" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button class="action_btn edit_btn" data-id="${folder.folder_id}" data-type="folder" title="Редактировать">
                    <img src="./src/image/edit.svg" alt="Редактировать">
                </button>
                <button class="action_btn delete_btn" data-id="${folder.folder_id}" data-type="folder" title="Удалить папку">
                    <img src="./src/image/delete.png" alt="Удалить">
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    addActionHandlers('folder');
}

// Добавление обработчиков для кнопок действий
function addActionHandlers(type) {
    document.querySelectorAll(`
        .action_btn.view_btn[data-type="${type}"],
        .action_btn.open_btn[data-type="${type}"]
    `).forEach(button => {
        button.removeEventListener('click', viewButtonHandler);
        button.addEventListener('click', viewButtonHandler);
    });

    document.querySelectorAll(`.action_btn.move_btn[data-type="${type}"]`).forEach(button => {
        button.removeEventListener('click', moveButtonHandler);
        button.addEventListener('click', moveButtonHandler);
    });

    document.querySelectorAll(`.action_btn.edit_btn[data-type="${type}"]`).forEach(button => {
        button.removeEventListener('click', editButtonHandler);
        button.addEventListener('click', editButtonHandler);
    });

    document.querySelectorAll(`.action_btn.delete_btn[data-type="${type}"]`).forEach(button => {
        button.removeEventListener('click', deleteButtonHandler);
        button.addEventListener('click', deleteButtonHandler);
    });
}

// Обработчик просмотра документа/папки
function viewButtonHandler(e) {
    const button = e.currentTarget;
    const id = button.getAttribute('data-id');
    const type = button.getAttribute('data-type');

    if (type === 'document') {
        window.location.href = `/viewing.html?id=${id}&from=favourites`;
    } else if (type === 'folder') {
        window.location.href = `/folder_view.html?folderId=${id}`;
    }
}

// Создание кастомного селекта для папок
function createCustomFolderSelect(folders, currentFolderId = null, currentFolderName = null) {
    const formGroup = document.querySelector('#moveToFolderForm .form_group');
    if (!formGroup) return;

    // Находим старый select и удаляем его
    const oldSelect = document.getElementById('folderSelect');
    if (oldSelect) oldSelect.remove();

    // Находим старый кастомный селект, если есть
    const oldCustomSelect = formGroup.querySelector('.custom_select');
    if (oldCustomSelect) oldCustomSelect.remove();

    // Удаляем старый warning, если есть
    const oldWarning = document.getElementById('moveWarning');
    if (oldWarning) oldWarning.remove();

    // Создаём контейнер для кастомного селекта
    const customSelect = document.createElement('div');
    customSelect.className = 'custom_select';
    customSelect.setAttribute('tabindex', '0');

    // Отображаемый текст
    const selectedSpan = document.createElement('span');
    selectedSpan.className = 'selected';
    selectedSpan.textContent = 'Выберите папку';
    customSelect.appendChild(selectedSpan);

    // Выпадающий список
    const dropdown = document.createElement('div');
    dropdown.className = 'select_dropdown';

    // Функция закрытия дропдауна
    const closeDropdown = () => {
        dropdown.classList.remove('show');
        customSelect.classList.remove('active');
    };

    // Функция открытия дропдауна
    const openDropdown = () => {
        closeAllCustomDropdowns();
        dropdown.classList.add('show');
        customSelect.classList.add('active');
    };

    // Опция "Без папки"
    const noFolderOption = document.createElement('div');
    noFolderOption.className = 'select_option';
    noFolderOption.dataset.id = '';
    noFolderOption.textContent = 'Без папки';
    noFolderOption.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedSpan.textContent = 'Без папки';
        customSelect.dataset.selectedId = '';
        closeDropdown();
        if (typeof updateMoveWarning === 'function') updateMoveWarning(null, null);
    });
    dropdown.appendChild(noFolderOption);

    // Опции для каждой папки
    folders.forEach(folder => {
        const option = document.createElement('div');
        option.className = 'select_option';
        option.dataset.id = folder.folder_id;
        option.textContent = folder.name;
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedSpan.textContent = folder.name;
            customSelect.dataset.selectedId = folder.folder_id;
            closeDropdown();
            if (typeof updateMoveWarning === 'function') updateMoveWarning(currentFolderId, currentFolderName);
        });
        dropdown.appendChild(option);
    });

    customSelect.appendChild(dropdown);

    // Добавляем warning div
    const warningDiv = document.createElement('div');
    warningDiv.id = 'moveWarning';
    warningDiv.style.display = 'none';
    warningDiv.style.marginTop = '8px';
    warningDiv.style.fontSize = '14px';
    warningDiv.style.color = '#1C4DFE';
    warningDiv.style.backgroundColor = 'rgba(28, 77, 254, 0.1)';
    warningDiv.style.padding = '8px 12px';
    warningDiv.style.borderRadius = '8px';
    
    formGroup.appendChild(customSelect);
    formGroup.appendChild(warningDiv);

    // Клик по селекту
    customSelect.addEventListener('click', (e) => {
        e.stopPropagation();
        const isShown = dropdown.classList.contains('show');
        if (isShown) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    // Обновление warning сообщения
    function updateMoveWarning(currentId, currentName) {
        const selectedId = customSelect.dataset.selectedId;
        if (warningDiv && currentId && selectedId && currentId.toString() === selectedId) {
            warningDiv.innerHTML = `Документ уже находится в папке <strong>"${escapeHtml(currentName)}"</strong>. Он будет перемещён в выбранную папку.`;
            warningDiv.style.display = 'block';
        } else {
            warningDiv.style.display = 'none';
        }
    }

    // Если документ уже в папке, устанавливаем её как выбранную по умолчанию
    if (currentFolderId) {
        const matchingOption = Array.from(dropdown.querySelectorAll('.select_option')).find(
            opt => opt.dataset.id === currentFolderId.toString()
        );
        if (matchingOption) {
            selectedSpan.textContent = matchingOption.textContent;
            customSelect.dataset.selectedId = currentFolderId;
            updateMoveWarning(currentFolderId, currentFolderName);
        }
    }
}

// Обработчик перемещения документа
async function moveButtonHandler(e) {
    const button = e.currentTarget;
    const favouriteId = button.getAttribute('data-fav-id');

    currentDocumentId = favouriteId;

    try {
        const docResponse = await fetch(`/api/favourites/${favouriteId}`);
        if (!docResponse.ok) throw new Error('Не удалось загрузить данные документа');
        
        const favDoc = await docResponse.json();

        const folderResponse = await fetch('/api/folders');
        if (!folderResponse.ok) throw new Error('Не удалось загрузить список папок');
        const folders = await folderResponse.json();

        createCustomFolderSelect(folders, favDoc.folder_id, favDoc.folder_name);

        openMoveToFolderModal();
    } catch (error) {
        console.error('Ошибка при подготовке модального окна:', error);
        showNotification('Не удалось загрузить данные для перемещения', 'error');
    }
}

// Обработчик редактирования
async function editButtonHandler(e) {
    const button = e.currentTarget;
    const id = button.getAttribute('data-id');
    const type = button.getAttribute('data-type');

    if (type === 'folder') {
        try {
            const response = await fetch(`/api/folders/${id}`);
            if (!response.ok) throw new Error('Не удалось загрузить данные папки');
            const folder = await response.json();
            openEditFolderModal(folder);
        } catch (error) {
            console.error('Ошибка при загрузке папки:', error);
            showNotification('Не удалось загрузить данные папки', 'error');
        }
    }
}

// Обработчик удаления
async function deleteButtonHandler(e) {
    const button = e.currentTarget;
    
    const type = button.getAttribute('data-type');
    const id = button.getAttribute('data-fav-id') || button.getAttribute('data-id');

    if (!id || !type) {
        showNotification('Ошибка: не указан ID или тип', 'error');
        return;
    }

    const typeNames = {
        document: 'Документ из избранного',
        folder: 'Папку'
    };

    const apiEndpoints = {
        document: 'favourites',
        folder: 'folders'
    };

    const typeName = typeNames[type] || 'Элемент';
    const endpoint = apiEndpoints[type];

    if (!endpoint) {
        showNotification('Неизвестный тип элемента', 'error');
        return;
    }

    openDeleteConfirmModal(typeName.toLowerCase(), async () => {
        try {
            const response = await fetch(`/api/${endpoint}/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Ошибка при удалении');
            }

            showNotification(`${typeName} успешно удалён`, 'success');
            refreshTable();
            loadStats();
        } catch (error) {
            console.error(`Ошибка при удалении ${typeName}:`, error);
            showNotification(error.message || 'Ошибка сети', 'error');
        }
    });
}

// ========== МОДАЛЬНЫЕ ОКНА ==========

// Открытие модального окна перемещения
function openMoveToFolderModal() {
    if (moveToFolderModal) {
        moveToFolderModal.classList.add('active');
    }
}

// Обработчик перемещения документа в папку
async function handleMoveToFolderSubmit(e) {
    e.preventDefault();

    const customSelect = document.querySelector('#moveToFolderForm .custom_select');
    const folderId = customSelect ? customSelect.dataset.selectedId : null;

    try {
        const submitButton = moveToFolderModal.querySelector('.modal_submit');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Перемещение...';
        }

        const response = await fetch(`/api/favourites/${currentDocumentId}/move`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId: folderId || null })
        });

        const result = await response.json();

        if (response.ok) {
            closeModal(moveToFolderModal);
            showNotification('Документ перемещён', 'success');
            refreshTable();
            loadStats();
        } else {
            showNotification(result.message || 'Ошибка при перемещении', 'error');
        }
    } catch (error) {
        console.error('Ошибка при перемещении:', error);
        showNotification('Ошибка сети', 'error');
    } finally {
        const submitButton = moveToFolderModal.querySelector('.modal_submit');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Переместить';
        }
    }
}

// Обработчик создания папки
function openCreateFolderModal() {
    const folderNameInput = document.getElementById('folderName');
    const folderIdInput = document.getElementById('folderId');
    const folderModalTitle = document.getElementById('folderModalTitle');
    
    if (folderNameInput) folderNameInput.value = '';
    if (folderIdInput) folderIdInput.value = '';
    if (folderModalTitle) folderModalTitle.textContent = 'Создать папку';
    
    initColorPalette('#548BA0');
    
    if (folderModal) {
        folderModal.classList.add('active');
        folderNameInput?.focus();
    }
}

// Обработчик редактирования папки
function openEditFolderModal(folder) {
    const folderNameInput = document.getElementById('folderName');
    const folderIdInput = document.getElementById('folderId');
    const folderModalTitle = document.getElementById('folderModalTitle');
    
    if (folderNameInput) folderNameInput.value = folder.name;
    if (folderIdInput) folderIdInput.value = folder.folder_id;
    if (folderModalTitle) folderModalTitle.textContent = 'Редактировать папку';
    
    initColorPalette(folder.color || '#548BA0');
    
    if (folderModal) {
        folderModal.classList.add('active');
        folderNameInput?.focus();
    }
}

// Обработчик отправки формы папки
async function handleFolderFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('folderId')?.value;
    const name = document.getElementById('folderName')?.value.trim();

    const selectedColorElement = document.querySelector('.color_option.selected');
    const color = selectedColorElement ? selectedColorElement.getAttribute('data-color') : '#1C4DFE';

    if (!name) {
        showNotification('Введите название папки', 'error');
        return;
    }

    const isEditing = !!id;
    const method = isEditing ? 'PUT' : 'POST';
    const url = isEditing ? `/api/folders/${id}` : '/api/folders';

    try {
        const submitButton = folderModal?.querySelector('.modal_submit');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Сохранение...';
        }

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });

        const result = await response.json();

        if (response.ok) {
            closeModal(folderModal);
            showNotification(
                isEditing ? 'Папка успешно обновлена' : 'Папка успешно создана',
                'success'
            );
            refreshTable();
            loadStats();
        } else {
            const errorMsg = result.message || 'Ошибка при сохранении папки';
            showNotification(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Ошибка при сохранении папки:', error);
        showNotification('Ошибка сети', 'error');
    } finally {
        const submitButton = folderModal?.querySelector('.modal_submit');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Сохранить';
        }
    }
}

// Открытие модального окна подтверждения удаления
function openDeleteConfirmModal(itemName, onConfirm) {
    const modal = document.getElementById('deleteConfirmModal');
    const itemNameElement = document.getElementById('deleteItemName');
    
    if (itemNameElement) itemNameElement.textContent = itemName;
    
    const confirmButton = document.getElementById('confirmDeleteBtn');
    if (confirmButton) {
        const newConfirmButton = confirmButton.cloneNode(true);
        confirmButton.replaceWith(newConfirmButton);
        
        newConfirmButton.onclick = () => {
            onConfirm();
            closeModal(modal);
        };
    }

    const cancelButton = modal?.querySelector('.modal_cancel');
    if (cancelButton) {
        cancelButton.onclick = () => closeModal(modal);
    }

    const closeBtn = modal?.querySelector('.modal_close');
    if (closeBtn) {
        closeBtn.onclick = () => closeModal(modal);
    }

    if (modal) modal.classList.add('active');
}

// ========== ЦВЕТОВАЯ ПАЛИТРА ==========

const PRESET_COLORS = [
    { code: '#548BA0'},
    { code: '#6DA87A'},
    { code: '#BAD9A0'},
    { code: '#F5EC6D'},
    { code: '#EFB231'},
    { code: '#EC6D10'},
    { code: '#aa4f46'},
    { code: '#C6888B'},
    { code: '#E07D91'}
];

function initColorPalette(initialColor = '#548BA0') {
    const palette = document.getElementById('colorPalette');
    if (!palette) return;

    palette.innerHTML = '';

    PRESET_COLORS.forEach(color => {
        const colorOption = document.createElement('div');
        colorOption.className = 'color_option';
        colorOption.style.backgroundColor = color.code;
        colorOption.setAttribute('data-color', color.code);

        if (color.code.toLowerCase() === initialColor.toLowerCase()) {
            colorOption.classList.add('selected');
        }

        colorOption.addEventListener('click', () => selectColor(color.code));
        palette.appendChild(colorOption);
    });

    if (!document.querySelector('.color_option.selected')) {
        const first = palette.querySelector('.color_option');
        if (first) first.classList.add('selected');
    }
}

function selectColor(colorCode) {
    document.querySelectorAll('.color_option').forEach(option => {
        option.classList.remove('selected');
    });

    const selectedOption = document.querySelector(`.color_option[data-color="${colorCode}"]`);
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

// Инициализация вкладок
function initTabs() {
    const tabButtons = document.querySelectorAll('.control_button');
    
    tabButtons.forEach(button => {
        const tabName = button.getAttribute('data-tab');
        
        button.addEventListener('click', () => {
            switchTab(tabName);
        });
        
        button.addEventListener('mouseenter', () => {
            if (!state.data[tabName]) {
                preloadData(tabName);
            }
        });
    });
}

// Инициализация модальных окон
function initModals() {
    folderModal = document.getElementById('folderModal');
    moveToFolderModal = document.getElementById('moveToFolderModal');

    [folderModal, moveToFolderModal].forEach(modal => {
        if (!modal) return;
        const closeBtn = modal.querySelector('.modal_close');
        const cancelBtn = modal.querySelector('.modal_cancel');
        closeBtn?.addEventListener('click', () => closeModal(modal));
        cancelBtn?.addEventListener('click', () => closeModal(modal));
    });

    document.getElementById('folderForm')?.addEventListener('submit', handleFolderFormSubmit);
    document.getElementById('moveToFolderForm')?.addEventListener('submit', handleMoveToFolderSubmit);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            [folderModal, moveToFolderModal].forEach(closeModal);
        }
    });
}

// Загрузка документов из папки
async function loadFolderDocuments(folderId) {
    try {
        const response = await fetch(`/api/favourites?folderId=${folderId}`);
        if (response.ok) {
            const documents = await response.json();
            
            switchTab('all');
            state.data.all = documents;
            renderTable('all', documents);
            
            const folderResponse = await fetch(`/api/folders/${folderId}`);
            if (folderResponse.ok) {
                const folder = await folderResponse.json();
                document.querySelector('.main_title').textContent = `Папка: ${folder.name}`;
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки документов папки:', error);
        showNotification('Не удалось загрузить документы папки', 'error');
    }
}

// Глобальные функции
window.refreshTable = function() {
    loadDataForTab(state.activeTab);
};

window.switchToTab = function(tabName) {
    switchTab(tabName);
};

window.getActiveTab = function() {
    return state.activeTab;
};

window.openCreateFolderModal = openCreateFolderModal;

// DOM готов
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadDataForTab('all');
    loadStats();
    loadUserData();
    initModals();
    initHorizontalScroll();

    const addButton = document.getElementById('createFolderBtn');
    if (addButton) {
        addButton.classList.toggle('hidden', state.activeTab !== 'folders');
    }
});

// Закрытие дропдаунов при клике вне
document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom_select')) {
        closeAllCustomDropdowns();
    }
});