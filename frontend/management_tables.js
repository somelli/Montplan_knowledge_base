 // management-tabs.js - управление вкладками на странице управления

// Состояние приложения
const state = {
    activeTab: 'users',
    data: {
        users: null,
        categories: null,
        tags: null,
        roles: null
    },
    isLoading: false
};

// Конфигурация для каждой вкладки
const tabConfig = {
    users: {
        tableId: 'users_table',
        buttonText: 'Добавить пользователя',
        apiEndpoint: '/api/admin/users',
        modalTitle: 'Добавить пользователя',
        columns: ['Пользователь', 'Email', 'Роль', 'Действия']
    },
    categories: {
        tableId: 'categories_table',
        buttonText: 'Добавить категорию',
        apiEndpoint: '/api/admin/categories',
        modalTitle: 'Добавить категорию',
        columns: ['Название категории', 'Действия']
    },
    tags: {
        tableId: 'tags_table',
        buttonText: 'Добавить тег',
        apiEndpoint: '/api/admin/tags',
        modalTitle: 'Добавить тег',
        columns: ['Название тега', 'Действия']
    },
    roles: {
        tableId: 'roles_table',
        buttonText: 'Добавить роль',
        apiEndpoint: '/api/admin/roles',
        modalTitle: 'Добавить роль',
        columns: ['Название роли', 'Действия']
    }
};

let userModal = null;
let availableRoles = [];
let editUserModal = document.getElementById('editUserModal');

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

// Функция для загрузки ролей из базы данных
let allRoles = []; // Будет заполнено при загрузке ролей

// После loadRolesFromDB() добавьте:
async function loadRolesFromDB() {
    try {
        const response = await fetch(`/api/admin/roles`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (!text) throw new Error('Empty response');
        const rolesData = JSON.parse(text);

        console.log('✅ Роли загружены:', rolesData);

        // Сохраняем ВСЕ объекты ролей
        allRoles = rolesData; // ← не .map(), а оригинал!

        // Обновляем подсказки (только имена)
        updateRoleSuggestions(); 
        return rolesData;

    } catch (error) {
        console.warn('❌ Не удалось загрузить роли, используем дефолтные:', error);
        
        updateRoleSuggestions();
        return allRoles;
    }
}

function updateEditRoleSuggestions(filter = '') {
    const suggestionsList = document.getElementById('editRoleSuggestions');
    suggestionsList.innerHTML = '';

    const filtered = allRoles.filter(role =>
        role.role_name.toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Новая роль — нажмите Enter';
        li.style.color = '#666';
        li.style.fontStyle = 'italic';
        suggestionsList.appendChild(li);
    } else {
        filtered.forEach(role => {
            const li = document.createElement('li');
            li.textContent = role.role_name;
            li.addEventListener('click', () => {
                document.getElementById('editRoleInput').value = role.role_name;
                suggestionsList.style.display = 'none';
            });
            suggestionsList.appendChild(li);
        });
    }
}

function initEditRoleAutocomplete() {
    const input = document.getElementById('editRoleInput');
    const suggestions = document.getElementById('editRoleSuggestions');

    if (!input || !suggestions) {
        console.warn('Элементы автозаполнения для редактирования не найдены');
        return;
    }

    input.addEventListener('focus', () => {
        suggestions.style.display = 'block';
        updateEditRoleSuggestions(input.value);
    });

    input.addEventListener('input', () => {
        updateEditRoleSuggestions(input.value);
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            suggestions.style.display = 'none';
        }, 200);
    });

    input.addEventListener('keydown', (e) => {
        const items = suggestions.querySelectorAll('li');
        const selected = suggestions.querySelector('.selected');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (selected) {
                selected.classList.remove('selected');
                if (selected.nextSibling) {
                    selected.nextSibling.classList.add('selected');
                }
            } else {
                items[0]?.classList.add('selected');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (selected) {
                selected.classList.remove('selected');
                if (selected.previousSibling) {
                    selected.previousSibling.classList.add('selected');
                }
            }
        } else if (e.key === 'Enter') {
            if (suggestions.style.display === 'block' && suggestions.querySelector('.selected')) {
                e.preventDefault();
                const selectedText = suggestions.querySelector('.selected').textContent;
                input.value = selectedText;
                suggestions.style.display = 'none';
            }
        }
    });
}

// Функция для отображения подсказок
function updateRoleSuggestions(filter = '') {
    const suggestionsList = document.getElementById('roleSuggestions');
    suggestionsList.innerHTML = '';

    const filtered = allRoles.filter(role =>
        role.role_name.toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Новая роль — нажмите Enter';
        li.style.color = '#666';
        li.style.fontStyle = 'italic';
        suggestionsList.appendChild(li);
    } else {
        filtered.forEach(role => {
            const li = document.createElement('li');
            li.textContent = role.role_name;
            li.addEventListener('click', () => {
                document.getElementById('roleInput').value = role.role_name;
                suggestionsList.style.display = 'none';
            });
            suggestionsList.appendChild(li);
        });
    }
}

// Инициализация автозаполнения
function initRoleAutocomplete() {
    const input = document.getElementById('roleInput');
    const suggestions = document.getElementById('roleSuggestions');

    console.log('🔧 initRoleAutocomplete:', { input, suggestions }); // ← ДОБАВЬТЕ ЭТО
    
    if (!input || !suggestions) {
        console.warn('⚠️ Элементы автозаполнения не найдены');
        return;
    }

    input.addEventListener('focus', () => {
        console.log('🟢 Фокус на поле роли'); // ← ДОБАВЬТЕ
        suggestions.style.display = 'block';
        updateRoleSuggestions(input.value);
    });

    input.addEventListener('focus', () => {
        suggestions.style.display = 'block';
        updateRoleSuggestions(input.value);
    });

    input.addEventListener('input', () => {
        updateRoleSuggestions(input.value);
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            suggestions.style.display = 'none';
        }, 200);
    });

    input.addEventListener('keydown', (e) => {
        const items = suggestions.querySelectorAll('li');
        const selected = suggestions.querySelector('.selected');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (selected) {
                selected.classList.remove('selected');
                if (selected.nextSibling) {
                    selected.nextSibling.classList.add('selected');
                }
            } else {
                items[0]?.classList.add('selected');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (selected) {
                selected.classList.remove('selected');
                if (selected.previousSibling) {
                    selected.previousSibling.classList.add('selected');
                }
            }
        } else if (e.key === 'Enter') {
            if (suggestions.style.display === 'block' && suggestions.querySelector('.selected')) {
                e.preventDefault();
                const selectedText = suggestions.querySelector('.selected').textContent;
                input.value = selectedText;
                suggestions.style.display = 'none';
            }
            // Если нет выделенного — просто принимаем введённое
        }
    });
}


// Функция обновления селекта с ролями
function updateRolesSelect(roles) {
    const rolesSelect = document.getElementById('roles');
    
    if (!rolesSelect) {
        console.error('Селект roles не найден');
        return;
    }
    
    rolesSelect.innerHTML = '';
    
    roles.forEach(role => {
        const option = document.createElement('option');
        option.value = role.role_id; // ← только ID!
        option.textContent = role.role_name;
        rolesSelect.appendChild(option);
    });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadDataForTab('users');
    
    // Заранее загружаем роли для ускорения работы
    loadRolesFromDB().catch(error => {
        console.warn('Не удалось предзагрузить роли:', error);
    });
});

// Обработка отправки формы
async function handleUserFormSubmit(e) {
    e.preventDefault();

    console.log('🔄 Начало обработки формы пользователя');
    
    // Проверяем пароли
    if (!validatePasswords()) {
        return;
    }
    
    // Собираем данные формы
    const roleName = document.getElementById('roleInput').value.trim();
    if (!roleName) {
        showNotification('Введите или выберите роль', 'error');
        return;
    }
    
    const formData = {
        full_name: document.getElementById('fullName').value.trim(),
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
        role: roleName,
    };

    console.log('📤 Отправляемые данные (RAW):', formData);
    console.log('📤 Email value:', JSON.stringify(formData.email));
    console.log('📤 Email length:', formData.email.length);
    
    // Проверка обязательных полей
    if (!formData.full_name || !formData.email || !formData.password) {
        alert('Пожалуйста, заполните все обязательные поля');
        return;
    }
    
    try {
        // Отключаем кнопку отправки
        const submitButton = document.querySelector('.modal_submit');
        submitButton.disabled = true;
        submitButton.textContent = 'Сохранение...';
        
        // Отправляем запрос на сервер
        const response = await fetch(`/api/admin/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Закрываем модальное окно
            closeModal(userModal);
            
            // Показываем уведомление об успехе
            showNotification('Пользователь успешно добавлен!', 'success');
            
            // Обновляем таблицу
            refreshTable();

        } else {
            // Обработка ошибок сервера
            let errorMessage = 'Ошибка при добавлении пользователя';
            
            if (result.errors) {
                // Показываем валидационные ошибки
                showFormErrors(result.errors);
                errorMessage = 'Пожалуйста, исправьте ошибки в форме';
            } else if (result.message) {
                errorMessage = result.message;
            }
            
            showNotification(errorMessage, 'error');
        }
        
    } catch (error) {
        console.error('Ошибка при отправке формы:', error);
        showNotification('Ошибка сети. Пожалуйста, попробуйте еще раз.', 'error');
    } finally {
        // Восстанавливаем кнопку
        const submitButton = document.querySelector('.modal_submit');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Сохранить';
        }
    }
}

async function handleCategoryFormSubmit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('categoryName').value.trim()
    };

    if (!formData.name) {
        showNotification('Введите название категории', 'error');
        return;
    }

    try {
        const submitButton = document.querySelector('#categoryModal .modal_submit');
        submitButton.disabled = true;
        submitButton.textContent = 'Сохранение...';

        const response = await fetch('/api/admin/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            closeModal(categoryModal);
            showNotification('Категория успешно добавлена!', 'success');
            refreshTable();
        } else {
            const errorMsg = result.message || 'Ошибка при добавлении категории';
            showNotification(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Ошибка при отправке формы категории:', error);
        showNotification('Ошибка сети', 'error');
    } finally {
        const submitButton = document.querySelector('#categoryModal .modal_submit');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Сохранить';
        }
    }
}

async function handleTagFormSubmit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('tagName').value.trim()
    };

    if (!formData.name) {
        showNotification('Введите название тега', 'error');
        return;
    }

    try {
        const submitButton = document.querySelector('#tagModal .modal_submit');
        submitButton.disabled = true;
        submitButton.textContent = 'Сохранение...';

        const response = await fetch('/api/admin/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            closeModal(tagModal);
            showNotification('Тег успешно добавлен!', 'success');
            refreshTable();
        } else {
            const errorMsg = result.message || 'Ошибка при добавлении тега';
            showNotification(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Ошибка при отправке формы тега:', error);
        showNotification('Ошибка сети', 'error');
    } finally {
        const submitButton = document.querySelector('#tagModal .modal_submit');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Сохранить';
        }
    }
}

async function handleRoleFormSubmit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('roleName').value.trim()
    };

    if (!formData.name) {
        showNotification('Введите название роли', 'error');
        return;
    }

    try {
        const submitButton = document.querySelector('#roleModal .modal_submit');
        submitButton.disabled = true;
        submitButton.textContent = 'Сохранение...';

        const response = await fetch('/api/admin/roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            closeModal(roleModal);
            showNotification('Роль успешно добавлена!', 'success');
            refreshTable();
        } else {
            const errorMsg = result.message || 'Ошибка при добавлении роли';
            showNotification(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Ошибка при отправке формы роли:', error);
        showNotification('Ошибка сети', 'error');
    } finally {
        const submitButton = document.querySelector('#roleModal .modal_submit');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Сохранить';
        }
    }
}

async function handleEditUserSubmit(e) {
    e.preventDefault();
    console.log('✅ handleEditUserSubmit вызван');

    const id = document.getElementById('editUserId').value;
    const fullName = document.getElementById('editFullName').value.trim();
    const roleName = document.getElementById('editRoleInput').value.trim();

    if (!fullName || !roleName) {
        showNotification('Имя и роль обязательны', 'error');
        return;
    }

    try {
        // Ищем роль по имени среди объектов
        const role = allRoles.find(r => r.role_name.toLowerCase() === roleName.toLowerCase());

        if (!role) {
            showNotification('Выберите корректную роль из списка', 'error');
            return;
        }

        const roleId = role.role_id;

        const response = await fetch(`/api/admin/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                full_name: fullName,
                role: roleId
            })
        });

        const result = await response.json();

        if (response.ok) {
            closeModal(editUserModal);
            showNotification('Пользователь успешно обновлён', 'success');
            refreshTable();
        } else {
            showNotification(result.message || 'Ошибка при обновлении', 'error');
        }
    } catch (error) {
        console.error('Ошибка сети:', error);
        showNotification('Не удалось подключиться к серверу', 'error');
    }
}

async function handleEditCategorySubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editCategoryId').value;
    const name = document.getElementById('editCategoryName').value.trim();

    try {
        const response = await fetch(`/api/admin/categories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const result = await response.json();

        if (response.ok) {
            closeModal(editCategoryModal);
            showNotification('Категория обновлена', 'success');
            refreshTable();
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        showNotification('Ошибка сети', 'error');
    }
}

async function handleEditTagSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editTagId').value;
    const name = document.getElementById('editTagName').value.trim();

    try {
        const response = await fetch(`/api/admin/tags/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const result = await response.json();

        if (response.ok) {
            closeModal(editTagModal);
            showNotification('Тег обновлён', 'success');
            refreshTable();
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        showNotification('Ошибка сети', 'error');
    }
}

async function handleEditRoleSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editRoleId').value;
    const name = document.getElementById('editRoleName').value.trim();

    try {
        const response = await fetch(`/api/admin/roles/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const result = await response.json();

        if (response.ok) {
            closeModal(editRoleModal);
            showNotification('Роль обновлена', 'success');
            refreshTable();
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        showNotification('Ошибка сети', 'error');
    }
}

// Инициализация вкладок
function initTabs() {
    const tabButtons = document.querySelectorAll('.control_button');
    
    tabButtons.forEach(button => {
        const tabName = button.getAttribute('data-tab');
        
        // Клик - основное действие
        button.addEventListener('click', () => {
            switchTab(tabName);
        });
        
        // Прелоад при наведении (если данных нет)
        button.addEventListener('mouseenter', () => {
            if (!state.data[tabName]) {
                preloadData(tabName);
            }
        });
    });
    
    // Обработчик для кнопки добавления
    const addButton = document.getElementById('add_button');
    if (addButton) {
        addButton.addEventListener('click', handleAddButtonClick);
    }

     initModal();
}

function initModal() {
    userModal = document.getElementById('userModal');
    categoryModal = document.getElementById('categoryModal');
    tagModal = document.getElementById('tagModal');
    roleModal = document.getElementById('roleModal');
    editUserModal = document.getElementById('editUserModal');
    editCategoryModal = document.getElementById('editCategoryModal');
    editTagModal = document.getElementById('editTagModal');
    editRoleModal = document.getElementById('editRoleModal');

    // Закрытие модалок
    [userModal, categoryModal, tagModal, roleModal, editUserModal, editCategoryModal, editTagModal, editRoleModal].forEach(modal => {
        if (!modal) return;
        const closeBtn = modal.querySelector('.modal_close');
        const cancelBtn = modal.querySelector('.modal_cancel');
        closeBtn?.addEventListener('click', () => closeModal(modal));
        cancelBtn?.addEventListener('click', () => closeModal(modal));
    });

    // Обработчики отправки форм
    document.getElementById('userForm')?.addEventListener('submit', handleUserFormSubmit);
    document.getElementById('categoryForm')?.addEventListener('submit', handleCategoryFormSubmit);
    document.getElementById('tagForm')?.addEventListener('submit', handleTagFormSubmit);
    document.getElementById('roleForm')?.addEventListener('submit', handleRoleFormSubmit);
    document.getElementById('editUserForm')?.addEventListener('submit', handleEditUserSubmit);
    document.getElementById('editCategoryForm')?.addEventListener('submit', handleEditCategorySubmit);
    document.getElementById('editTagForm')?.addEventListener('submit', handleEditTagSubmit);
    document.getElementById('editRoleForm')?.addEventListener('submit', handleEditRoleSubmit);

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            [userModal, categoryModal, tagModal, roleModal, editUserModal, editCategoryModal, editTagModal, editRoleModal].forEach(closeModal);
        }
    });

    // Автозаполнение ролей
    initRoleAutocomplete();
    initEditRoleAutocomplete();

    // Валидация паролей
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirmPassword');
    if (confirmPassword) {
        confirmPassword.addEventListener('input', validatePasswords);
    }
    if (password) {
        password.addEventListener('input', validatePasswords);
    }
}

function createPasswordErrorElement() {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'form_error';
    errorDiv.id = 'passwordError';
    confirmPassword.parentNode.insertBefore(errorDiv, confirmPassword.nextSibling);
    return errorDiv;
}

// Валидация паролей
function validatePasswords() {
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const passwordError = document.getElementById('passwordError');
    const submitButton = document.querySelector('.modal_submit');
    
    if (password && confirmPassword && password !== confirmPassword) {
        passwordError.textContent = 'Пароли не совпадают';
        passwordError.classList.add('show');
        document.getElementById('confirmPassword').classList.add('password_mismatch');
        submitButton.disabled = true;
        return false;
    } else {
        passwordError.classList.remove('show');
        document.getElementById('confirmPassword').classList.remove('password_mismatch');
        submitButton.disabled = false;
        return true;
    }
}


// Фоновая загрузка
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
        // Тихая ошибка - не мешаем пользователю
    }
}

// Обновление кнопки добавления
function updateAddButton(tabName) {
    const addButton = document.getElementById('add_button');
    const addButtonText = document.getElementById('add_button_text');
    
    if (addButton && addButtonText) {
        addButtonText.textContent = tabConfig[tabName].buttonText;
    }
}

// Переключение вкладки
function switchTab(tabName) {
    if (!tabConfig[tabName] || state.activeTab === tabName) {
        return;
    }
    
    state.activeTab = tabName;
    
    // Обновляем UI немедленно
    updateTabButtons(tabName);
    showActiveTable(tabName);
    updateAddButton(tabName);
    
    // Проверяем кэш
    const cachedData = state.data[tabName];
    
    if (cachedData) {
        // Данные уже в кэше - показываем мгновенно
        console.log(`[CACHE] Using cached data for ${tabName}`);
        renderTable(tabName, cachedData);
        
        // Фоновая проверка обновлений (без блокировки UI)
        checkForUpdates(tabName);
    } else {
        // Загружаем впервые
        loadDataForTab(tabName);
    }
}

// Фоновая проверка обновлений
async function checkForUpdates(tabName) {
    try {
        const response = await fetch(tabConfig[tabName].apiEndpoint);
        if (response.ok) {
            const freshData = await response.json();
            
            // Сравниваем количество записей
            if (freshData.length !== state.data[tabName]?.length) {
                console.log(`[UPDATE] Data changed for ${tabName}, updating...`);
                state.data[tabName] = freshData;
                renderTable(tabName, freshData);
            }
        }
    } catch (error) {
        // Тихий fail - не мешаем пользователю
        console.log(`[UPDATE] Failed to check updates for ${tabName}`);
    }
}

// Обновление состояния кнопок вкладок
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
    // Скрываем все таблицы
    const allTables = document.querySelectorAll('.table_container');
    allTables.forEach(table => {
        table.classList.remove('active');
    });
    
    // Показываем активную таблицу
    const activeTable = document.getElementById(tabConfig[tabName].tableId);
    if (activeTable) {
        activeTable.classList.add('active');
    }
}

// Показать ошибку
function showError(message) {
    alert(`Ошибка: ${message}`);
}

// Обработчик кнопки добавления
function handleAddButtonClick() {
    switch (state.activeTab) {
        case 'users':
            openUserModal();
            break;
        case 'categories':
            openCategoryModal();
            break;
        case 'tags':
            openTagModal();
            break;
        case 'roles':
            openRoleModal();
            break;
    }
}

function openUserModal() {
    // Очищаем форму
    document.getElementById('userForm').reset();
    
    // Сбрасываем ошибки
    document.querySelectorAll('.form_error').forEach(error => {
        error.classList.remove('show');
    });
    
    // Убираем подсветку полей с ошибками
    document.querySelectorAll('.password_mismatch').forEach(field => {
        field.classList.remove('password_mismatch');
    });
    
    // Включаем кнопку отправки
    const submitButton = document.querySelector('.modal_submit');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Сохранить';
    }
    
    // Устанавливаем заголовок
     document.getElementById('modalTitle').textContent = 'Добавить пользователя';
    
    // Загружаем роли из базы данных
    loadRolesFromDB();
    
    // Показываем модальное окно
    userModal.classList.add('active');
    
    // Фокус на первое поле
    document.getElementById('fullName')?.focus();
}

function openCategoryModal() {
    // Очищаем форму
    document.getElementById('categoryForm').reset();
    
    // Сбрасываем ошибки
    document.querySelectorAll('.form_error').forEach(error => {
        error.classList.remove('show');
    });
    
    // Убираем подсветку полей с ошибками
    document.querySelectorAll('.password_mismatch').forEach(field => {
        field.classList.remove('password_mismatch');
    });
    
    // Включаем кнопку отправки
    const submitButton = document.querySelector('.modal_submit');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Сохранить';
    }
    
    // Устанавливаем заголовок
     document.getElementById('modalTitle').textContent = 'Добавить категорию';
    
    // Показываем модальное окно
    categoryModal.classList.add('active');
    
    // Фокус на первое поле
    document.getElementById('categoryName')?.focus();
}

function openTagModal() {
    // Очищаем форму
    document.getElementById('tagForm').reset();
    
    // Сбрасываем ошибки
    document.querySelectorAll('.form_error').forEach(error => {
        error.classList.remove('show');
    });
    
    // Убираем подсветку полей с ошибками
    document.querySelectorAll('.password_mismatch').forEach(field => {
        field.classList.remove('password_mismatch');
    });
    
    // Включаем кнопку отправки
    const submitButton = document.querySelector('.modal_submit');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Сохранить';
    }
    
    // Устанавливаем заголовок
     document.getElementById('modalTitle').textContent = 'Добавить тег';
    
    // Показываем модальное окно
    tagModal.classList.add('active');
    
    // Фокус на первое поле
    document.getElementById('tagName')?.focus();
}

function openRoleModal() {
    // Очищаем форму
    document.getElementById('roleForm').reset();
    
    // Сбрасываем ошибки
    document.querySelectorAll('.form_error').forEach(error => {
        error.classList.remove('show');
    });
    
    // Убираем подсветку полей с ошибками
    document.querySelectorAll('.password_mismatch').forEach(field => {
        field.classList.remove('password_mismatch');
    });
    
    // Включаем кнопку отправки
    const submitButton = document.querySelector('.modal_submit');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Сохранить';
    }
    
    // Устанавливаем заголовок
    document.getElementById('modalTitle').textContent = 'Добавить роль';
    
    // Показываем модальное окно
    roleModal.classList.add('active');
    
    // Фокус на первое поле
    document.getElementById('roleName')?.focus();
}

// Открытие модального окна подтверждения удаления
function openDeleteConfirmModal(itemName, onConfirm) {
    const modal = document.getElementById('deleteConfirmModal');
    const itemNameElement = document.getElementById('deleteItemName');
    
    itemNameElement.textContent = itemName;
    
    // Удаляем старый обработчик, чтобы не было дублирования
    const confirmButton = document.getElementById('confirmDeleteBtn');
    const newConfirmButton = confirmButton.cloneNode(true);
    confirmButton.replaceWith(newConfirmButton);
    
    // Назначаем новый обработчик
    newConfirmButton.onclick = () => {
        onConfirm();
        closeModal(modal);
    };

    // Кнопка отмены
    const cancelButton = modal.querySelector('.modal_cancel');
    cancelButton.onclick = () => closeModal(modal);

    // Закрытие по крестику
    const closeBtn = modal.querySelector('.modal_close');
    closeBtn.onclick = () => closeModal(modal);

    modal.classList.add('active');
}

// Закрытие модального окна
function closeModal(modal) {
    if (modal && modal.classList.contains('active')) {
        modal.classList.remove('active');
    }
}

// Функция для отображения ошибок формы
function showFormErrors(errors) {
    // Сбрасываем все предыдущие ошибки
    document.querySelectorAll('.form_error').forEach(error => {
        error.classList.remove('show');
    });
    
    // Показываем новые ошибки
    for (const field in errors) {
        const errorElement = document.getElementById(`${field}Error`);
        if (errorElement) {
            errorElement.textContent = errors[field].join(', ');
            errorElement.classList.add('show');
        }
    }
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const messageSpan = document.getElementById('notificationMessage');
    
    if (!notification || !messageSpan) return;
    
    // Устанавливаем сообщение и цвет в зависимости от типа
    messageSpan.textContent = message;
    
    if (type === 'success') {
        notification.style.background = '#10B981';
    } else if (type === 'error') {
        notification.style.background = '#EF4444';
    } else if (type === 'warning') {
        notification.style.background = '#F59E0B';
    }
    
    // Показываем уведомление
    notification.classList.add('show');
    
    // Автоматически скрываем через 3 секунды
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Добавление обработчиков для кнопок действий
function addActionHandlers(type) {
    // Для пользователей
    document.querySelectorAll(`.action_btn.edit_btn[data-type="${type}"]`).forEach(button => {
        button.removeEventListener('click', editButtonHandler); // избегаем дублирования
        button.addEventListener('click', editButtonHandler);
    });

    document.querySelectorAll(`.action_btn.delete_btn[data-type="${type}"]`).forEach(button => {
        button.removeEventListener('click', deleteButtonHandler);
        button.addEventListener('click', deleteButtonHandler);
    });
}

// Обработчик редактирования
async function editButtonHandler(e) {
    const button = e.currentTarget;
    const id = button.getAttribute('data-id');
    const type = button.getAttribute('data-type');

    if (type === 'user') {
        try {
            const response = await fetch(`/api/admin/users/${id}`);
            if (!response.ok) throw new Error('Не удалось загрузить данные пользователя');
            const user = await response.json();

            // Открываем модальное окно редактирования
            window.openEditUserModal(user);
        } catch (error) {
            console.error('Ошибка при загрузке пользователя:', error);
            showNotification('Не удалось загрузить данные пользователя', 'error');
        }
    } else if (type === 'category') {
        try {
            const response = await fetch(`/api/admin/categories/${id}`);
            if (!response.ok) throw new Error('Не удалось загрузить данные категории');
            const category = await response.json();

            // Открываем модальное окно редактирования
            window.openEditCategoryModal(category);
        } catch (error) {
            console.error('Ошибка при загрузке категории:', error);
            showNotification('Не удалось загрузить данные категории', 'error');
        }
    } else if (type === 'tag') {
        try {
            const response = await fetch(`/api/admin/tags/${id}`);
            if (!response.ok) throw new Error('Не удалось загрузить данные тега');
            const tag = await response.json();

            // Открываем модальное окно редактирования
            window.openEditTagModal(tag);
        } catch (error) {
            console.error('Ошибка при загрузке тега:', error);
            showNotification('Не удалось загрузить данные тега', 'error');
        }
    } else if (type === 'role') {
        try {
            const response = await fetch(`/api/admin/roles/${id}`);
            if (!response.ok) throw new Error('Не удалось загрузить данные роли');
            const role = await response.json();

            // Открываем модальное окно редактирования
            window.openEditRoleModal(role);
        } catch (error) {
            console.error('Ошибка при загрузке роли:', error);
            showNotification('Не удалось загрузить данные роли', 'error');
        }
    }
}

// Обработчик удаления
async function deleteButtonHandler(e) {
    const button = e.currentTarget;
    const id = button.getAttribute('data-id');
    const type = button.getAttribute('data-type');

    if (!id || !type) {
        showNotification('Ошибка: не указан ID или тип', 'error');
        return;
    }

    // Словарь для отображения названий
    const typeNames = {
        user: 'Пользователя',
        category: 'Категорию',
        tag: 'Тег',
        role: 'Роль'
    };

    // Словарь для URL-путей
    const apiEndpoints = {
        user: 'users',
        category: 'categories',
        tag: 'tags',
        role: 'roles'
    };

    const typeName = typeNames[type] || 'Элемент';
    const endpoint = apiEndpoints[type];

    if (!endpoint) {
        showNotification('Неизвестный тип элемента', 'error');
        return;
    }

    // Открываем модальное окно подтверждения
    openDeleteConfirmModal(typeName.toLowerCase(), async () => {
        try {
            const response = await fetch(`/api/admin/${endpoint}/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (response.ok) {
                showNotification(`${typeName} успешно удалён`, 'success');
                refreshTable(); // Перезагружаем таблицу
            } else {
                const errorMsg = result.message || 'Ошибка при удалении';
                showNotification(errorMsg, 'error');
            }
        } catch (error) {
            console.error(`Ошибка при удалении ${typeName}:`, error);
            showNotification('Ошибка сети', 'error');
        }
    });
}
// Обновляем функцию loadDataForTab в management-tabs.js:

async function loadDataForTab(tabName) {
    const config = tabConfig[tabName];
    if (!config) return;
    
    try {
        // Загружаем данные с сервера
        const response = await fetch(config.apiEndpoint);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Ошибка загрузки данных: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Data received:', data);
        
        // Сохраняем данные в состоянии
        state.data[tabName] = data;
        
        // Рендерим таблицу
        renderTable(tabName, data);
        
    } catch (error) {
        console.error(`Ошибка загрузки данных для вкладки ${tabName}:`, error);
        console.error('Error details:', error);
        showError(`Не удалось загрузить данные. ${error.message}`);
        
        // Показываем пустую таблицу с сообщением об ошибке
        const tableBodyId = `${tabName}TableBody`;
        const tableBody = document.getElementById(tableBodyId);
        if (tableBody) {
            const columnsCount = tabConfig[tabName].columns.length;
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

// Рендеринг таблицы
function renderTable(tabName, data) {
    const tableBodyId = `${tabName}_table_body`;
    const tableBody = document.getElementById(tableBodyId);

    console.log(`[RENDER] === ${tabName.toUpperCase()} ===`);
    console.log(`[RENDER] Table body ID: ${tableBodyId}`);
    console.log(`[RENDER] Table body found:`, !!tableBody);
    console.log(`[RENDER] Data received:`, data);
    
    if (!tableBody) {
        console.error(`[RENDER] ❌ Table body not found for: ${tableBodyId}`);
        return;
    }
    
    if (!data || data.length === 0) {
        // Если данных нет
        tableBody.innerHTML = `
            <tr class="empty_row">
                <td colspan="${tabConfig[tabName].columns.length}">
                    Нет данных для отображения
                </td>
            </tr>
        `;
        return;
    }
    
    // Очищаем таблицу
    tableBody.innerHTML = '';
    
    // Рендерим строки в зависимости от типа данных
    switch (tabName) {
        case 'users':
            renderUsersTable(data, tableBody);
            break;
        case 'categories':
            renderCategoriesTable(data, tableBody);
            break;
        case 'tags':
            renderTagsTable(data, tableBody);
            break;
        case 'roles':
            renderRolesTable(data, tableBody);
            break;
        default:
            tableBody.innerHTML = `
                <tr class="error_row">
                    <td colspan="${tabConfig[tabName].columns.length}">
                        Неизвестный тип данных
                    </td>
                </tr>
            `;
    }
}

// Рендеринг таблицы пользователей
function renderUsersTable(users, tableBody) {
    users.forEach(user => {
        const row = document.createElement('tr');
        
        // Определяем статус
        const statusClass = user.is_active ? 'status-active' : 'status-inactive';
        const statusText = user.is_active ? 'Активен' : 'Неактивен';
        
        // Определяем роль (преобразуем массив ролей в строку)
        const rolesText = Array.isArray(user.roles) 
            ? user.roles.join(', ')
            : user.role_name || 'Пользователь';
        
        row.innerHTML = `
            <td class="user_col"><div class="user_icon">${user.full_name.charAt(0)}</div>${user.full_name || 'Не указано'}</td>
            <td class="email_col">${user.email}</td>
            <td class="roles_col">${rolesText}</td>
            <td class="actions_col">
                <button class="action_btn edit_btn" data-id="${user.user_id || user.id}" data-type="user">
                    <img src="./src/image/edit.svg" alt="Редактировать" title="Редактировать">
                </button>
                <button class="action_btn delete_btn" data-id="${user.user_id || user.id}" data-type="user">
                    <img src="./src/image/delete.png" alt="Удалить" title="Удалить">
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Добавляем обработчики для кнопок действий
    addActionHandlers('user');
}

// Рендеринг таблицы категорий
function renderCategoriesTable(categories, tableBody) {
    categories.forEach(category => {
        const row = document.createElement('tr');
        
        const statusClass = category.is_active ? 'status-active' : 'status-inactive';
        const statusText = category.is_active ? 'Активна' : 'Неактивна';
        
        row.innerHTML = `
            <td class="category_col"><div class="category_block"><img src="./src/image/folder.png" alt="Папка">${category.name || category.category_name}</div></td>
            <td class="actions_col">
                <button class="action_btn edit_btn" data-id="${category.category_id || category.id}" data-type="category">
                    <img src="./src/image/edit.svg" alt="Редактировать">
                </button>
        
                <button class="action_btn delete_btn" data-id="${category.category_id || category.id}" data-type="category">
                    <img src="./src/image/delete.png" alt="Удалить">
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Добавляем обработчики для кнопок действий
    addActionHandlers('category');
}

// Рендеринг таблицы тегов
function renderTagsTable(tags, tableBody) {
    tags.forEach(tag => {
        const row = document.createElement('tr');
        
        const statusClass = tag.is_active ? 'status-active' : 'status-inactive';
        const statusText = tag.is_active ? 'Активен' : 'Неактивен';
        
        row.innerHTML = `
            <td class="tag_col"><div class="tag_block"><img src="./src/image/tag.png" alt="Тег">${tag.name || tag.tag_name}</div></td>
            <td class="actions_col">
                <button class="action_btn edit_btn" data-id="${tag.tag_id || tag.id}" data-type="tag">
                    <img src="./src/image/edit.svg" alt="Редактировать">
                </button>
                
                <button class="action_btn delete_btn" data-id="${tag.tag_id || tag.id}" data-type="tag">
                    <img src="./src/image/delete.png" alt="Удалить">
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Добавляем обработчики для кнопок действий
    addActionHandlers('tag');
}

// Рендеринг таблицы ролей
function renderRolesTable(roles, tableBody) {
    roles.forEach(role => {
        const row = document.createElement('tr');
        
        const statusClass = role.is_active ? 'status-active' : 'status-inactive';
        const statusText = role.is_active ? 'Активен' : 'Неактивен';
        
        row.innerHTML = `
            <td class="role_col"><div class="role_block"><img src="./src/image/role.png" alt="Роль">${role.role_name}</div></td>
            <td class="actions_col">
                <button class="action_btn edit_btn" data-id="${role.role_id || role.id}" data-type="role">
                    <img src="./src/image/edit.svg" alt="Редактировать">
                </button>
                
                <button class="action_btn delete_btn" data-id="${role.role_id || role.id}" data-type="role">
                    <img src="./src/image/delete.png" alt="Удалить">
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Добавляем обработчики для кнопок действий
    addActionHandlers('role');
}
document.addEventListener('DOMContentLoaded', loadUserData);


// Глобальные функции для обновления данных
window.refreshTable = function() {
    loadDataForTab(state.activeTab);
};

window.switchToTab = function(tabName) {
    switchTab(tabName);
};

window.getActiveTab = function() {
    return state.activeTab;
};

window.openEditUserModal = function(user) {
    document.getElementById('editUserId').value = user.user_id;
    document.getElementById('editFullName').value = user.full_name;

    const roleInput = document.getElementById('editRoleInput');
    
    const roleName = user.role_name || (Array.isArray(user.roles) && user.roles[0]) || '';
    roleInput.value = roleName;

    // ← Ключевое: обновляем список после установки значения
    updateEditRoleSuggestions(roleName);

    editUserModal.classList.add('active');
    roleInput.focus();
};

window.openEditCategoryModal = function(category) {
    document.getElementById('editCategoryId').value = category.category_id;
    document.getElementById('editCategoryName').value = category.name;

    editCategoryModal.classList.add('active');
    editCategoryName.focus();
};

window.openEditTagModal = function(tag) {
    document.getElementById('editTagId').value = tag.tag_id;
    document.getElementById('editTagName').value = tag.name;

    editTagModal.classList.add('active');
    editTagName.focus();
};
window.openEditRoleModal = function(role) {
    const roleId = role.role_id || role.id;
    // Приоритет: сначала role_name, потом name
    const roleName = role.role_name || role.name;

    if (!roleId) {
        showNotification('Не удалось определить ID роли', 'error');
        return;
    }

    document.getElementById('editRoleId').value = roleId;
    document.getElementById('editRoleName').value = roleName;

    editRoleModal.classList.add('active');
    
    const input = document.getElementById('editRoleName');
    if (input) input.focus();
};

// window.openAddUserModal = openUserModal;
// window.closeUserModal = closeModal;

