// navigation.js - общий скрипт для всех страниц

async function initNavigation() {
    try {
        console.log('Starting initialization...');

        // Проверяем пользователя
        const userResponse = await fetch('/api/user');

        if (userResponse.status === 401) {
            window.location.href = '/';
            return;
        }

        if (!userResponse.ok) {
            throw new Error(`User API error: ${userResponse.status}`);
        }

        const userData = await userResponse.json();
        console.log('User authenticated:', userData);

        // Загружаем навигацию
        await loadNavigation();

    } catch (error) {
        console.error('Init failed:', error);
        showDefaultNavigation();
    }
}

async function loadNavigation() {
    try {
        console.log('Loading navigation...');

        const response = await fetch('/api/navigation');

        if (!response.ok) {
            throw new Error(`Navigation API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('Navigation loaded:', data);

        const nav = document.getElementById('sidebarNav');
        if (!nav) return;

        // Очищаем ТОЛЬКО навигацию
        nav.innerHTML = '';

        // Получаем текущую страницу
        const currentPage = window.location.pathname;
        console.log('Current page:', currentPage);

        const urlParams = new URLSearchParams(window.location.search);
        const fromSource = urlParams.get('from'); // например, 'favourites'

        let isActive = false;

        data.navigation.forEach(item => {
            const button = document.createElement('button');
            button.className = 'nav_button';

            if (item.adminOnly) {
                button.classList.add('nav_admin_only');
            }

            // === ОПРЕДЕЛЕНИЕ АКТИВНОЙ ВКЛАДКИ ===
            isActive = false;

            if (currentPage.includes('viewing.html')) {
                const isFavouritesPage = item.href && item.href.includes('favourites.html');
                const isDocumentationPage = item.href && item.href.includes('template.html');

                if (fromSource === 'favourites' && isFavouritesPage) {
                    isActive = true;
                    console.log('✅ Active: Избранное (переход из избранного)');
                } else if (!fromSource && isDocumentationPage) {
                    isActive = true;
                    console.log('✅ Active: Документация (прямой просмотр)');
                }
            } else {
                // Обычная логика для всех других страниц
                const pageName = getPageNameFromHref(item.href);
                const currentPageName = getCurrentPageName();

                if (pageName && currentPageName && pageName === currentPageName) {
                    isActive = true;
                    console.log(`✅ Active: ${item.title} (по совпадению имени)`);
                }
            }

            if (isActive) {
                button.classList.add('active');
                console.log(`Marking ${item.title} as active (from: ${fromSource})`);
            }

            button.innerHTML = `
                <img src="${item.icon}" alt="${item.title}">
                <a href="${item.href}">${item.title}</a>
            `;

            // Добавляем обработчик клика
            button.addEventListener('click', (e) => {
                if (item.href.startsWith('#admin-')) {
                    e.preventDefault();
                    handleAdminClick(item.id, item.title);
                } else if (item.href && item.href !== '#' && !item.href.startsWith('#')) {
                    window.location.href = item.href;
                }
            });

            nav.appendChild(button);
        });

        // Обработка выхода
        const logoutLink = document.getElementById('logoutLink');
        if (logoutLink) {
            logoutLink.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    await fetch('/api/logout', { method: 'POST' });

                    // Очищаем кэш
                    sessionStorage.removeItem('cached_documents');

                    window.location.href = '/';
                } catch (error) {
                    console.error('Logout error:', error);
                }
            });
        }


    } catch (error) {
        console.error('Navigation load failed:', error);
        showDefaultNavigation();

    }
}

// Вспомогательные функции для определения страницы
function getPageNameFromHref(href) {
    if (!href || href === '#') return null;

    // Извлекаем имя файла из href
    const match = href.match(/\/([^\/]+\.html)/);
    if (match) {
        return match[1];
    }

    // Если href уже содержит имя файла
    if (href.includes('.html')) {
        return href.split('/').pop();
    }

    return null;
}

function getCurrentPageName() {
    const path = window.location.pathname;
    const match = path.match(/\/([^\/]+\.html)/);
    return match ? match[1] : 'template.html'; // по умолчанию
}

// Функция для показа навигации по умолчанию
function showDefaultNavigation() {
    const nav = document.getElementById('sidebarNav');
    if (!nav) return;

    nav.innerHTML = `
        <button class="nav_button">
            <img src="./src/image/documentation.png" alt="Документация">
            <a href="./template.html">Документация</a>
        </button>
        <button class="nav_button">
            <img src="./src/image/account.png" alt="Аккаунт">
            <a href="./account.html">Аккаунт</a>
        </button>
        <button class="nav_button">
            <img src="./src/image/favourites.png" alt="Избранное">
            <a href="#">Избранное</a>
        </button>
        <button class="nav_button">
            <img src="./src/image/settings.png" alt="Настройки">
            <a href="./settings.html">Настройки</a>
        </button>ss
    `;
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', initNavigation);