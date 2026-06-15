/**
 * history.js — Логика страницы полной истории просмотров
 */

class HistoryPage {
    constructor() {
        this.userId = null;
        this.setup();
    }

    setup() {
        document.addEventListener('DOMContentLoaded', () => {
            this.loadUserData();
            this.loadViewHistory();

            // Обработчики кнопок
            document.getElementById('backButton')?.addEventListener('click', () => {
                window.history.back(); // или window.location.href = '/account.html';
            });

            document.querySelector('.clear_history_btn')?.addEventListener('click', () => {
                this.clearHistory();
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

                const userNameSpan = document.querySelector('.user_info span');
                const userRoleDiv = document.querySelector('.user_role');

                if (userNameSpan) {
                    userNameSpan.textContent = data.user.name || data.user.email;
                }
                if (userRoleDiv) {
                    const role = data.user.roles?.[0] || 'Пользователь';
                    userRoleDiv.textContent = role.toLowerCase();
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки данных пользователя:', error);
            this.showError('Не удалось загрузить профиль');
        }
    }

    async loadViewHistory() {
        const container = document.getElementById('viewHistoryList');
        if (!container) return;

        try {
            // 🔥 Используем новый маршрут с /all
            const response = await fetch('/api/view-history/all', { credentials: 'include' });
            if (!response.ok) throw new Error('Ошибка загрузки истории');

            const data = await response.json();
            container.innerHTML = '';

            if (!data.success || !data.history || data.history.length === 0) {
                container.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">История просмотров пуста</p>';
                return;
            }

            data.history.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history_item';
                historyItem.style.cursor = 'pointer';

                historyItem.innerHTML = `
                    <div class="doc_name">
                        <img src="./src/image/document.png" alt="Документ">
                        <span>${this.truncateText(item.title, 35)}</span>
                    </div>
                    <div class="doc_details">
                        <span class="doc_date">${item.viewed_at}</span>
                    </div>
                `;

                historyItem.onclick = () => {
                    const page = item.page || item.page_number || 1;
                    window.location.href = `/viewing.html?id=${item.document_id}&page=${page}`;
                };

                container.appendChild(historyItem);
            });
        } catch (error) {
            console.error('Ошибка при загрузке полной истории:', error);
            container.innerHTML = '<p style="color:red;">Ошибка загрузки истории</p>';
        }
    }

    async clearHistory() {
        // Показываем модальное окно
        document.getElementById('deleteConfirmModal').classList.add('active');

        // Обработчик подтверждения
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const cancelBtn = document.querySelector('#deleteConfirmModal .modal_cancel');
        const closeBtn = document.querySelector('#deleteConfirmModal .modal_close');

        const handleConfirm = async () => {
            try {
                const response = await fetch('/api/view-history/clear', {
                    method: 'DELETE',
                    credentials: 'include'
                });

                if (response.ok) {
                    const container = document.getElementById('viewHistoryList');
                    container.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">История очищена</p>';
                    this.showNotification('История просмотров очищена');
                } else {
                    throw new Error('Не удалось очистить историю');
                }
            } catch (error) {
                console.error('Ошибка при очистке истории:', error);
                this.showError('Не удалось очистить историю');
            } finally {
                closeModal();
            }
        };

        const closeModal = () => {
            document.getElementById('deleteConfirmModal').classList.remove('active');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', closeModal);
            closeBtn.removeEventListener('click', closeModal);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);

        // Закрытие по клику вне окна (опционально)
        const modal = document.getElementById('deleteConfirmModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    truncateText(text, maxLength) {
        if (!text) return 'Без названия';
        return text.length > maxLength 
            ? text.substring(0, maxLength) + '...' 
            : text;
    }

    showNotification(message) {
        let notif = document.getElementById('notification');
        if (!notif) {
            notif = document.createElement('div');
            notif.id = 'notification';
            notif.className = 'notification';
            notif.innerHTML = `<span>${message}</span>`;
            document.body.appendChild(notif);
        }
        notif.querySelector('span').textContent = message;
        notif.classList.add('show');
        setTimeout(() => notif.classList.remove('show'), 3000);
    }

    showError(message) {
        this.showNotification(message);
    }
}

// Инициализация
new HistoryPage();