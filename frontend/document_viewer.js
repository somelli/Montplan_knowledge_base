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

                // Показываем кнопку редактирования документа только для админа
                const editButton = document.getElementById('editDoc');
                const urlParams = new URLSearchParams(window.location.search);
                const docId = urlParams.get('id');
                if (data.isAdmin) {
                    editButton.style.display = 'block';
                    editButton.onclick = () => {
                        window.location.href = `/edit_documents.html?id=${docId}`;
                    };
                } else {
                    editButton.style.display = 'none';
                }
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
    }
}

class DocumentViewer {
    constructor() {
        this.pdf = null;
        this.currentPage = 1;
        this.zoom = 1;
        this.docId = null;
        this.isPageVisible = true;

        this.elements = {
            title: document.getElementById('documentTitle'),
            category: document.getElementById('docCategory'),
            tags: document.getElementById('docTags'),
            uploadDate: document.getElementById('docUploadDate'),
            fileSize: document.getElementById('docFileSize'),
            pdfContainer: document.querySelector('.pdf_container'),
            canvasContainer: document.getElementById('pdfCanvasContainer'), 
            canvas: null,
            pageInfo: document.getElementById('pageInfo'),
            pageCount: document.getElementById('pageCount'),
            prevPage: document.getElementById('prevPage'),
            nextPage: document.getElementById('nextPage'),
            zoomIn: document.getElementById('zoomIn'),
            zoomOut: document.getElementById('zoomOut'),
            zoomValue: document.getElementById('zoomValue'),
            addBookmark: document.getElementById('addBookmark'),
            addNote: document.getElementById('addNote'),
            notesList: document.getElementById('notesList'),
            bookmarksList: document.getElementById('bookmarksList'),
            userNotesTitle: document.getElementById('userNotesTitle'),
            userBookmarksTitle: document.getElementById('userBookmarksTitle'),
            backToList: document.getElementById('backToList'),
            downloadDoc: document.getElementById('downloadDoc'),
            printDoc: document.getElementById('printDoc'),
            addToFavourites: document.getElementById('addToFavourites')
        };

        this.setupEventListeners();
        this.loadDocument();
        this.updateZoomDisplay(); // Устанавливаем начальное значение "100%"
        this.hasSentHistory = false;
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    }

        handleVisibilityChange() {
            if (document.visibilityState === 'hidden' && !this.hasSentHistory) {
                this.sendCurrentPageToHistory();
            }
        }

    // Отправка текущей страницы в историю
    async sendCurrentPageToHistory() {
        // Защита от повторной отправки
        if (this.hasSentHistory || !this.docId || !this.userId) return;

        this.hasSentHistory = true;

        const payload = {
            documentId: parseInt(this.docId, 10),
            page: this.currentPage
        };

        const data = new Blob([JSON.stringify(payload)], {
            type: 'application/json'
        });

        // Пытаемся отправить через sendBeacon
        if (navigator.sendBeacon) {
            const sent = navigator.sendBeacon('/api/view-history', data);
            if (sent) {
                console.debug('История отправлена через sendBeacon');
                return;
            }
        }

        try {
            await fetch('/api/view-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include',
                keepalive: true
            });
            console.debug('История отправлена через fetch (keepalive)');
        } catch (error) {
            console.debug('Не удалось отправить историю');
        }
    }

    setupNavigationInterceptor() {
        const sidebarNav = document.getElementById('sidebarNav');
        
        // Используем делегирование событий
        sidebarNav.addEventListener('click', async (e) => {
            const link = e.target.closest('a');
            if (!link || !link.href || link.href === window.location.href) return;

            e.preventDefault(); // Блокируем мгновенный переход

            // Отправляем историю
            this.sendCurrentPageToHistory();

            // Даём браузеру время на отправку
            await new Promise(resolve => setTimeout(resolve, 100));

            window.location.href = link.href;
        });
    }

    formatDateLabel(dateString) {
        if (!dateString) return '—';

        let date = null;

        if (dateString instanceof Date) {
            date = dateString;
        }
        else if (typeof dateString === 'string') {
            const ruDateMatch = dateString.match(/(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
            if (ruDateMatch) {
                const [, day, month, year, hours, minutes, seconds] = ruDateMatch;
                date = new Date(year, month - 1, day, hours, minutes, seconds);
            }
            else {
                date = new Date(dateString);
            }
        }

        // Проверка валидности даты
        if (!date || isNaN(date.getTime())) return '—';

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const formattedTime = date.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        if (dateOnly.getTime() === today.getTime()) {
            return `Сегодня, ${formattedTime}`;
        } else if (dateOnly.getTime() === yesterday.getTime()) {
            return `Вчера, ${formattedTime}`;
        } else {
            return date.toLocaleDateString('ru-RU');
        }
    }

    async waitForCanvasRender() {
        return new Promise((resolve) => {
            const check = () => {
                const selector = `canvas[data-page-num="${this.currentPage}"]`;
                const canvas = this.elements.canvasContainer.querySelector(selector);
                if (canvas) {
                    console.log(`Нашли canvas: ${selector}`);
                    resolve();
                } else {
                    console.log(`Canvas для стр. ${this.currentPage} ещё не готов...`);
                    requestAnimationFrame(check);
                }
            };
            check();
        });
    }

    async loadDocument() {
        const urlParams = new URLSearchParams(window.location.search);
        this.docId = urlParams.get('id');

        const requestedPage = urlParams.get('page');
        console.log('URL параметры:', {
            id: this.docId,
            page: requestedPage,
            hasPage: urlParams.has('page')
        });

        this.currentPage = requestedPage ? Math.max(1, parseInt(requestedPage, 10)) : 1;

        if (!this.docId) {
            await this.showAlert('Не указан ID документа');
            return;
        }

        try {
            const response = await fetch(`/api/documents/${this.docId}`, {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Документ не найден');

            const doc = await response.json();
            console.log('Документ загружен:', doc);

            this.renderDocumentInfo(doc);
            await this.loadPdf(doc.filePath); // Ждём полного рендера

            if (requestedPage) {
                console.log(`Ожидаем canvas для страницы ${this.currentPage}...`);
                await this.waitForCanvasRender();
                console.log(`Canvas найден, прокручиваем к странице ${this.currentPage}`);
                this.scrollToPage(this.currentPage);
            } else {
                document.getElementById('currentPage').textContent = this.currentPage;
            }

            await this.loadUserDataAndNotes();
        } catch (error) {
            console.error('Ошибка загрузки документа:', error);
            this.elements.canvasContainer.textContent = 'Ошибка загрузки PDF';
        }

        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        this.setupNavigationInterceptor();
    }

    async loadUserDataAndNotes() {
        try {
            const userResponse = await fetch('/api/user', {
                credentials: 'include'
            });
            const userData = await userResponse.json();

            if (userData.user) {
                this.userId = userData.user.id;

                await Promise.all([
                    this.loadNotes(),
                    this.loadBookmarks()
                ]);

                this.showTab('notes'); // По умолчанию открываем "Заметки"
            }
        } catch (error) {
            console.error('Ошибка загрузки пользователя:', error);
        }
    }

    async addNote() {
        const text = await this.showModalInput('Добавить заметку', 'Введите текст заметки...');
        if (!text) return;

        const note = {
            documentId: this.docId,
            page: this.currentPage,
            content: text.trim()
        };

        try {
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(note),
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                // Добавляем в список
                this.displayNote(result.note);
            } else {
                await this.showAlert('Ошибка сохранения заметки');
            }
        } catch (error) {
            console.error('Ошибка отправки заметки:', error);
            await this.showAlert('Не удалось сохранить заметку');
        }
    }

    async loadNotes() {
        this.elements.notesList.innerHTML = '';

        try {
            const response = await fetch(`/api/notes/${this.docId}`, {
                credentials: 'include'
            });

            const result = await response.json();
            const notes = result.notes || [];

            if (notes.length === 0) {
                this.elements.notesList.innerHTML = '<p style="color:#888;font-size:13px;">Пока нет заметок</p>';
                return;
            }

            notes.forEach(note => this.displayNote(note));
        } catch (error) {
            console.error('Ошибка загрузки заметок:', error);
            this.elements.notesList.innerHTML = '<p style="color:red;">Ошибка загрузки заметок</p>';
        }
    }

    displayNote(note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'note_item';
        noteEl.innerHTML = `
            <div class="note_info">
                <span class="note_page">Стр. ${note.page}</span> 
                <span class="note_time">${this.formatDateLabel(note.timestamp)}</span>
            </div>
            <div class="note_content">
                <span class="note_text">${note.text}</span> 
                <button class="delete_note_btn">
                    <img src="./src/image/delete.png" alt="Удалить">
                </button>
            </div>
        `;

        const deleteBtn = noteEl.querySelector('.delete_note_btn');
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.showConfirm('Вы уверены, что хотите удалить эту заметку?')
                .then(confirmed => {
                    if (confirmed) {
                        this.deleteNote(note.id, noteEl);
                    }
                });
        };

        this.elements.notesList.appendChild(noteEl);
    }

    async deleteNote(noteId, noteElement) {
        try {
            const response = await fetch(`/api/notes/${noteId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                noteElement.remove();
            } else {
                await this.showAlert('Ошибка', 'Не удалось удалить заметку');
            }
        } catch (error) {
            console.error('Ошибка при удалении заметки:', error);
            await this.showAlert('Ошибка', 'Не удалось подключиться к серверу');
        }
    }
    
    // === Закладки ===
    async addBookmark() {
        if (!this.userId) {
            await this.showAlert('Ошибка: пользователь не авторизован');
            return;
        }

        const note = await this.showModalInput(
            'Добавить закладку',
            'Введите комментарий (необязательно)...'
        );

        const bookmark = {
            documentId: this.docId,
            page: this.currentPage,
            note: note ? note.trim() : null,
            userId: this.userId
        };

        try {
            const response = await fetch('/api/bookmarks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookmark),
                credentials: 'include'
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 409) {
                    await this.showAlert('Закладка уже существует', 'На этой странице уже есть закладка');
                } else {
                    await this.showAlert('Не удалось добавить закладку. Повторите попытку.');
                }
                return;
            }

            const result = await response.json();
            if (result.success && result.bookmark) {
                // Добавляем закладку в список сразу, как заметку
                this.displayBookmark(result.bookmark);
            } else {
                await this.showAlert('Закладка добавлена, но не отображена');
            }
        } catch (error) {
            console.error('Ошибка при добавлении закладки:', error);
            await this.showAlert('Не удалось подключиться к серверу');
        }
    }

    async loadBookmarks() {
        this.elements.bookmarksList.innerHTML = '';

        try {
            const response = await fetch(`/api/bookmarks/${this.docId}`, {
                credentials: 'include'
            });

            const result = await response.json();
            const bookmarks = result.bookmarks || [];

            if (bookmarks.length === 0) {
                this.elements.bookmarksList.innerHTML = '<p style="color:#888;font-size:13px;">Пока нет закладок</p>';
                return;
            }

            bookmarks.forEach(bookmark => this.displayBookmark(bookmark));
        } catch (error) {
            console.error('Ошибка загрузки закладок:', error);
            this.elements.bookmarksList.innerHTML = '<p style="color:red;">Ошибка загрузки</p>';
        }
    }

    displayBookmark(bookmark) {
        const bookmarkEl = document.createElement('div');
        bookmarkEl.className = 'note_item';
        bookmarkEl.innerHTML = `
            <div class="note_info">
                <span class="note_page">Стр. ${bookmark.page}</span> 
                <span class="note_time">${this.formatDateLabel(bookmark.timestamp)}</span>
            </div>
            <div class="note_content">
                <span class="note_text">${bookmark.note || 'Без комментария'}</span> 
                <button class="delete_bookmark_btn">
                    <img src="./src/image/delete.png" alt="Удалить">
                </button>
            </div>
        `;
        
        // Добавляем обработчик удаления
        const deleteBtn = bookmarkEl.querySelector('.delete_bookmark_btn');
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.showConfirm('Вы уверены, что хотите удалить эту закладку?')
                .then(confirmed => {
                    if (confirmed) {
                        this.deleteBookmark(bookmark.id, bookmarkEl);
                    }
                });
        };

        this.elements.bookmarksList.appendChild(bookmarkEl);
    }

    async deleteBookmark(bookmarkId, bookmarkElement) {
        try {
            const response = await fetch(`/api/bookmarks/${bookmarkId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                bookmarkElement.remove();
            } else {
                const errorData = await response.json().catch(() => ({}));
                await this.showAlert('Ошибка', errorData.error || 'Не удалось удалить закладку');
            }
        } catch (error) {
            console.error('Ошибка при удалении закладки:', error);
            await this.showAlert('Ошибка', 'Не удалось подключиться к серверу');
        }
    }

    showModalInput(title, placeholder = '') {
        return new Promise((resolve) => {
            const modal = document.getElementById('modalInput');
            const overlay = document.getElementById('modalOverlay');
            const titleEl = document.getElementById('modalTitle');
            const inputEl = document.getElementById('modalInputText');
            const cancelBtn = document.getElementById('modalCancel');
            const confirmBtn = document.getElementById('modalConfirm');

            titleEl.textContent = title;
            inputEl.value = '';
            inputEl.placeholder = placeholder;

            const open = () => {
                modal.style.display = 'block';
                overlay.style.display = 'block';
                inputEl.focus();
            };

            const close = () => {
                modal.style.display = 'none';
                overlay.style.display = 'none';
                inputEl.value = '';
            };

            const confirm = () => {
                const value = inputEl.value.trim();
                close();
                resolve(value);
            };

            cancelBtn.onclick = () => {
                close();
                resolve(null);
            };

            confirmBtn.onclick = confirm;

            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    confirm();
                } else if (e.key === 'Escape') {
                    cancelBtn.click();
                }
            };

            open();
        });
    }

    showConfirm(message = 'Вы уверены?') {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const overlay = document.getElementById('modalOverlay');
            const messageEl = document.getElementById('confirmMessage');
            const cancelBtn = document.getElementById('confirmCancel');
            const deleteBtn = document.getElementById('confirmDelete');

            messageEl.textContent = message;

            const open = () => {
                modal.style.display = 'block';
                overlay.style.display = 'block';
            };

            const close = () => {
                modal.style.display = 'none';
                overlay.style.display = 'none';
            };

            cancelBtn.onclick = () => {
                close();
                resolve(false);
            };

            deleteBtn.onclick = () => {
                close();
                resolve(true);
            };

            overlay.onclick = () => {
                close();
                resolve(false);
            };

            open();
        });
    }

    showAlert(title = 'Информация', message = '') {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const overlay = document.getElementById('modalOverlay');
            const titleEl = document.getElementById('confirmTitle');
            const messageEl = document.getElementById('confirmMessage');
            const cancelBtn = document.getElementById('confirmCancel');
            const deleteBtn = document.getElementById('confirmDelete');

            titleEl.textContent = title;
            messageEl.textContent = message;
            cancelBtn.textContent = 'Ок';
            deleteBtn.style.display = 'none';

            const open = () => {
                modal.style.display = 'block';
                overlay.style.display = 'block';
            };

            const close = () => {
                modal.style.display = 'none';
                overlay.style.display = 'none';
                deleteBtn.style.display = 'block';
                resolve();
            };

            cancelBtn.onclick = close;
            overlay.onclick = close;

            open();
        });
    }

    async addToFavourites() {
        try {
            if (!this.userId) {
                await this.showAlert('Ошибка', 'Вы не авторизованы');
                return;
            }

            const button = this.elements.addToFavourites;
            const isCurrentlyFavourited = button.classList.contains('favourited');

            const url = `/api/favourites/${this.docId}`;
            let response;

            if (isCurrentlyFavourited) {
                // Удаляем из избранного
                response = await fetch(url, {
                    method: 'DELETE',
                    credentials: 'include'
                });

                if (response.ok) {
                    button.classList.remove('favourited');
                    await this.showAlert('Удалено из избранного', 'Документ больше не в избранном');
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    await this.showAlert('Ошибка', errorData.error || 'Не удалось удалить из избранного');
                }
            } else {
                // Добавляем в избранное
                response = await fetch('/api/favourites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ documentId: this.docId }),
                    credentials: 'include'
                });

                if (response.ok) {
                    button.classList.add('favourited');
                    await this.showAlert('Добавлено в избранное', 'Документ сохранён');
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    if (errorData.error === 'Документ уже в избранном') {
                        button.classList.add('favourited');
                    } else {
                        await this.showAlert('Ошибка', 'Не удалось добавить в избранное');
                    }
                }
            }

            // Обновляем состояние после изменения
            await this.checkIfFavourited();

        } catch (error) {
            console.error('Ошибка при работе с избранным:', error);
            await this.showAlert('Ошибка', 'Не удалось подключиться к серверу');
        }
    }

    renderDocumentInfo(doc) {
        this.elements.title.textContent = doc.title;
        this.elements.category.textContent = doc.category || '—';

        this.elements.tags.innerHTML = '';
        if (doc.tags && doc.tags.length > 0) {
            doc.tags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.classList.add('tag');
                tagEl.textContent = tag;
                this.elements.tags.appendChild(tagEl);
            });
        } else {
            this.elements.tags.textContent = '—';
        }

        const date = new Date(doc.uploadDate);
        this.elements.uploadDate.textContent = date.toLocaleDateString('ru-RU');

        // Скачивание
        this.elements.downloadDoc.onclick = () => {
            const link = document.createElement('a');
            link.href = doc.filePath;
            link.download = doc.title + '.pdf';
            link.click();
        };

        // Печать
        this.elements.printDoc.onclick = () => {
            if (!this.pdf) {
                this.showAlert('Ошибка', 'PDF ещё не загружен');
                return;
            }

            // Сохраняем текущее состояние прокрутки
            const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;

            // Вызываем печать
            window.print();

            // Возвращаем прокрутку
            requestAnimationFrame(() => {
                window.scrollTo(0, scrollPosition);
            });
        };

        // Проверка, в избранном ли документ
        this.checkIfFavourited();
    }
    
    async checkIfFavourited() {
        const docId = parseInt(this.docId, 10);

        if (!Number.isInteger(docId) || docId <= 0) {
            console.warn('Некорректный ID документа:', this.docId);
            return;
        }

        try {
            const url = `/api/favourites/check?documentId=${encodeURIComponent(docId)}`;
            
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Ответ сервера:', response.status, errorText);
                throw new Error(`Ошибка проверки избранного: ${response.status}`);
            }

            const data = await response.json();

            if (typeof data.isFavourite === 'boolean') {
                this.elements.addToFavourites.classList.toggle('favourited', data.isFavourite);
            }
        } catch (error) {
            console.error('Не удалось проверить статус избранного:', error);
        }
    }

    async loadPdf(filePath) {
        try {
            const loadingTask = pdfjsLib.getDocument(filePath);
            this.pdf = await loadingTask.promise;

            this.elements.pageCount.textContent = this.pdf.numPages;
            await this.renderAllPages();
        } catch (error) {
            console.error('Ошибка загрузки PDF:', error);
            this.elements.canvasContainer.textContent = 'Не удалось загрузить PDF';
        }
    }

    async renderAllPages() {
        const container = this.elements.canvasContainer;
        container.innerHTML = '';

        const canvases = [];

        for (let i = 1; i <= this.pdf.numPages; i++) {
            const page = await this.pdf.getPage(i);
            const scale = this.zoom;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.style.display = 'block';
            canvas.style.margin = '10px auto';
            canvas.style.border = '1px solid #ddd';
            canvas.dataset.pageNum = i;

            canvas.addEventListener('click', () => {
                this.goToPage(i);
            });

            container.appendChild(canvas);
            canvases.push({ canvas, page, viewport });
        }

        const renderPromises = canvases.map(({ canvas, page, viewport }) => {
            const context = canvas.getContext('2d');
            return page.render({ canvasContext: context, viewport }).promise;
        });

        await Promise.all(renderPromises);

        document.getElementById('currentPage').textContent = this.currentPage;
    }

    async renderPageToContainer(pageNum, container) {
        const page = await this.pdf.getPage(pageNum);
        const scale = this.zoom;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.display = 'block';
        canvas.style.margin = '10px auto';
        canvas.style.border = '1px solid #ddd';
        canvas.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
        canvas.dataset.pageNum = pageNum;

        canvas.addEventListener('click', () => {
            this.goToPage(pageNum);
        });

        await page.render({
            canvasContext: context,
            viewport
        }).promise;

        container.appendChild(canvas);
    }

    updateZoomDisplay() {
        this.elements.zoomValue.textContent = Math.round(this.zoom * 100) + '%';
    }
    
    updateCurrentPageFromScroll = () => {
        const scrollContainer = this.elements.pdfContainer;
        const canvases = Array.from(this.elements.canvasContainer.querySelectorAll('canvas'));
        const containerTop = scrollContainer.scrollTop;
        const threshold = containerTop + 50;

        let latestPage = 1;
        for (const canvas of canvases) {
            const rect = canvas.getBoundingClientRect();
            const canvasTopRelativeToScroll = rect.top - scrollContainer.getBoundingClientRect().top + containerTop;
            if (canvasTopRelativeToScroll <= threshold) {
                latestPage = parseInt(canvas.dataset.pageNum);
            } else {
                break;
            }
        }

        this.currentPage = latestPage;
        document.getElementById('currentPage').textContent = this.currentPage;
    };

    scrollToPage(pageNum) {
        const scrollContainer = this.elements.pdfContainer;
        
        const tryScroll = () => {
            const pageCanvas = this.elements.canvasContainer.querySelector(`canvas[data-page-num="${pageNum}"]`);
            if (pageCanvas) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const canvasRect = pageCanvas.getBoundingClientRect();
                scrollContainer.scrollTop += canvasRect.top - containerRect.top - 50;
                this.currentPage = pageNum;
                document.getElementById('currentPage').textContent = pageNum;
            } else {
                requestAnimationFrame(tryScroll);
            }
        };

        tryScroll();
    }

    goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.pdf.numPages) return;
        this.scrollToPage(pageNum); 
    }

    async reRenderPdf() {
        const container = this.elements.canvasContainer;
        const currentScrollTop = container.scrollTop;
        const currentScrollLeft = container.scrollLeft;
        const currentPage = this.currentPage;

        container.innerHTML = '';

        const canvases = [];

        for (let i = 1; i <= this.pdf.numPages; i++) {
            const page = await this.pdf.getPage(i);
            const viewport = page.getViewport({ scale: this.zoom });

            const canvas = document.createElement('canvas');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.style.display = 'block';
            canvas.style.margin = '10px auto';
            canvas.style.border = '1px solid #ddd';
            canvas.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
            canvas.dataset.pageNum = i;

            canvas.addEventListener('click', () => {
                this.goToPage(i);
            });

            container.appendChild(canvas);
            canvases.push({ canvas, page, viewport });
        }

        const renderPromises = canvases.map(({ canvas, page, viewport }) => {
            const context = canvas.getContext('2d');
            return page.render({ canvasContext: context, viewport }).promise;
        });

        await Promise.all(renderPromises);

        // Восстанавливаем состояние
        this.currentPage = currentPage;
        document.getElementById('currentPage').textContent = this.currentPage;

        // Восстанавливаем прокрутку
        requestAnimationFrame(() => {
            container.scrollTop = currentScrollTop;
            container.scrollLeft = currentScrollLeft;
        });
    }


    setupEventListeners() {
        const container = document.getElementById('pdfContainer');

        container.addEventListener('scroll', this.updateCurrentPageFromScroll);

        this.elements.prevPage.onclick = () => {
            if (this.currentPage > 1) {
                this.goToPage(this.currentPage - 1);
            }
        };

        this.elements.nextPage.onclick = () => {
            if (this.currentPage < this.pdf.numPages) {
                this.goToPage(this.currentPage + 1);
            }
        };

        this.elements.zoomIn.onclick = () => {
            const zoomLevels = [0.25, 0.5, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
            const current = this.zoom;
            const next = zoomLevels.find(level => level > current) || 2;
            if (this.zoom !== next) {
                this.zoom = next;
                this.updateZoomDisplay();
                this.reRenderPdf();
            }
        };

        this.elements.zoomOut.onclick = () => {
            const zoomLevels = [0.25, 0.5, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
            const current = this.zoom;
            const prev = [...zoomLevels].reverse().find(level => level < current) || 0.25;
            if (this.zoom !== prev) {
                this.zoom = prev;
                this.updateZoomDisplay();
                this.reRenderPdf();
            }
        };

        this.elements.addBookmark.onclick = () => {
            this.addBookmark();
        };

        this.elements.addNote.onclick = () => {
            this.addNote();
        };

        this.elements.userNotesTitle.onclick = () => {
            this.showTab('notes');
        };

        this.elements.userBookmarksTitle.onclick = () => {
            this.showTab('bookmarks');
        };

        this.elements.addToFavourites.onclick = () => {
            this.addToFavourites();
        };

        this.elements.backToList.onclick = () => {
            this.sendCurrentPageToHistory(); // Отправляем перед переходом
            
            // Определяем referrer (откуда пришли)
            const referrer = document.referrer;
            
            // Если пришли со страницы редактирования - идём на главную
            if (referrer && referrer.includes('edit_documents.html')) {
                window.location.href = '/template.html';
            } else {
                // Иначе пробуем вернуться назад, но с проверкой
                const previousPage = document.referrer;
                
                // Если предыдущая страница - это страница просмотра или редактирования
                if (previousPage && (previousPage.includes('viewing.html') || previousPage.includes('edit_documents.html'))) {
                    window.location.href = '/template.html';
                } else {
                    window.history.back();
                }
            }
        };
    }


    showTab(tab) {
        // Сброс активного состояния
        this.elements.userNotesTitle.classList.remove('active');
        this.elements.userBookmarksTitle.classList.remove('active');

        // Скрытие всех списков
        this.elements.notesList.style.display = 'none';
        this.elements.bookmarksList.style.display = 'none';

        if (tab === 'bookmarks') {
            this.elements.userBookmarksTitle.classList.add('active');
            this.elements.bookmarksList.style.display = 'block';
        } else {
            this.elements.userNotesTitle.classList.add('active');
            this.elements.notesList.style.display = 'block';
        }
    }
}

document.addEventListener('DOMContentLoaded', loadUserData);

document.addEventListener('DOMContentLoaded', () => {
    new DocumentViewer();
});