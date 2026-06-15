class AccountPage {
    constructor() {
        this.userId = null;
        this.setup();
    }

    setup() {
        document.addEventListener('DOMContentLoaded', () => {
            this.loadUserData()
                .then(() => {
                    this.loadStats();
                    this.loadViewHistory();
                });
        });
    }

    async loadUserData() {
        try {
            const response = await fetch('/api/user', { credentials: 'include' });
            if (!response.ok) throw new Error('Не удалось загрузить данные пользователя');

            const data = await response.json();

            if (data.user) {
                this.userId = data.user.id;

                // Обновляем имя и роль
                const userNameSpan = document.querySelector('.user_info span');
                const userRoleDiv = document.querySelector('.user_role');

                if (userNameSpan) {
                    userNameSpan.textContent = data.user.name || data.user.email;
                }
                if (userRoleDiv) {
                    const role = data.user.roles && data.user.roles.length > 0 
                        ? data.user.roles[0] 
                        : 'Пользователь';
                    userRoleDiv.textContent = role.toLowerCase();
                }

                // Обновляем приветствие
                const welcomeName = document.querySelector('.main_title span');
                if (welcomeName) {
                    const nameParts = data.user.name?.trim().split(' ') || [];
                    const secondPart = nameParts.length >= 2 ? nameParts[1] : nameParts[0]; // если есть две части — берём вторую, иначе первую
                    const displayName = secondPart || data.user.email?.split('@')[0] || 'Пользователь';

                    welcomeName.textContent = displayName;
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки данных пользователя:', error);
            this.showError('Не удалось загрузить профиль');
        }
    }

    async loadStats() {
        try {
            // Количество в избранном
            const favRes = await fetch('/api/favourites/count', { credentials: 'include' });
            const favData = await favRes.json();
            this.updateStat('favouritesCount', favData.count || 0);

            // Количество папок
            const folderRes = await fetch('/api/folders', { credentials: 'include' });
            const folderData = await folderRes.json();
            this.updateStat('foldersCount', folderData.length || 0);

            // Количество просмотров за последнюю неделю
            const weekRes = await fetch('/api/view-history/last-week-count', { credentials: 'include' });
            const weekData = await weekRes.json();
            this.updateStat('recentViewsCount', weekData.count || 0);

        } catch (error) {
            console.error('Ошибка загрузки статистики:', error);
        }
    }

    updateStat(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    async loadViewHistory() {
        const container = document.getElementById('viewHistoryList');
        if (!container) return;

        try {
            const response = await fetch('/api/view-history', { credentials: 'include' });
            if (!response.ok) throw new Error('Ошибка загрузки истории');

            const data = await response.json();
            container.innerHTML = '';

            if (!data.history || data.history.length === 0) {
                container.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Пока нет просмотров</p>';
                return;
            }

            data.history.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history_item';
                historyItem.style.cursor = 'pointer';

                historyItem.innerHTML = `
                    <div class="doc_name">
                        <img src="./src/image/document.png" alt="Документ">
                        <span>${this.truncateText(item.title, 30)}</span>
                    </div>
                    <span class="doc_date">${item.viewed_at}</span>
                `;

                historyItem.onclick = () => {
                    const page = item.page || item.page_number || 1;
                    window.location.href = `/viewing.html?id=${item.document_id}&page=${page}`;
                };

                container.appendChild(historyItem);
            });
        } catch (error) {
            console.error('Ошибка при загрузке истории:', error);
            container.innerHTML = '<p style="color:red;">Ошибка загрузки</p>';
        }
    }

    truncateText(text, maxLength) {
        if (!text) return 'Без названия';
        return text.length > maxLength 
            ? text.substring(0, maxLength) + '...' 
            : text;
    }

    showError(message) {
        const content = document.querySelector('.content_block');
        if (content) {
            const errorEl = document.createElement('div');
            errorEl.style.color = 'red';
            errorEl.style.padding = '20px';
            errorEl.style.textAlign = 'center';
            errorEl.textContent = message;
            content.appendChild(errorEl);
        }
    }
}

// Инициализация при загрузке страницы
new AccountPage();