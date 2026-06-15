class DocumentsManager {
    constructor() {
        this.documentsContainer = null;
        this.documents = [];
        this.originalDocuments = [];

        this.eventHandlers = new Map();
        this.observers = [];
        this.abortController = new AbortController();
        
        
        this.activeFilters = {
            categories: new Set(),
            tags: new Set(),
            year: null
        };
        
        this.init();
    }

    async init() {
        this.createDocumentsContainer();
        this.setupEventListeners();

        // Сначала загружаем документы с сервера
        await this.loadDocuments();
        window.documentsManager = this;
    }

    createDocumentsContainer() {
        const contentBlock = document.querySelector('.content_block');

        this.cleanupEventListeners();
        contentBlock.replaceChildren();

        const container = document.createElement('div');
        container.className = 'documents_container';

        const header = document.createElement('div');
        header.className = 'documents_header';
        header.innerHTML = `
            <h2>Все документы</h2>
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

    setupEventListeners() {
        const searchInput = document.querySelector('.search_block input');
        if (!searchInput) return;

        const signal = this.abortController.signal;
        const searchBlock = searchInput.closest('.search_block');
        
        // Создаем кнопку очистки
        const clearButton = this.createClearButton();
        if (searchBlock) {
            searchBlock.style.position = 'relative';
            searchBlock.appendChild(clearButton);
        }

        // Функция показа/скрытия кнопки
        const toggleClearButton = () => {
            clearButton.style.display = searchInput.value.trim() ? 'block' : 'none';
        };

        const debouncedSearch = this.debounce((query) => {
            this.searchDocuments(query);
        }, 300);

        searchInput.addEventListener('input', (e) => {
            toggleClearButton();
            debouncedSearch(e.target.value);
        }, { signal });

        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            toggleClearButton();
            searchInput.blur();
            debouncedSearch.cancel?.(); // Отменяем отложенный поиск
            this.searchDocuments('');
        }, { signal });

        // Показ истории при фокусе
        searchInput.addEventListener('focus', () => {
            this.loadSearchHistory();
        }, { signal });

        // Поиск по Enter
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                debouncedSearch.cancel?.(); // Отменяем отложенный поиск
                const query = e.target.value.trim();
                this.searchDocuments(query);
                e.target.blur();
            }
        }, { signal });

        // Скрываем историю при потере фокуса
        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                const searchBlock = document.querySelector('.search_block');
                const searchIcon = searchBlock?.querySelector('img');
                if (searchBlock && searchIcon) {
                    this.hideSearchHistory(searchBlock, searchIcon);
                }
            }, 200);
        }, { signal });

        toggleClearButton();
        
        this.setupCustomSort();
        this.setupFilterDropdown();
        this.loadFilters();
    }

    createClearButton() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search_clear';
        button.textContent = '✕';
        button.title = 'Очистить поиск';
        
        button.classList.add('search_clear_button');
        
        return button;
    }

    debounce(func, wait) {
        let timeout;
        const debounced = function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
        debounced.cancel = () => clearTimeout(timeout);
        return debounced;
    }

    // Метод для очистки всех обработчиков
    cleanupEventListeners() {
        this.abortController.abort();
        this.abortController = new AbortController();
        
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
        
        this.eventHandlers.clear();
    }

    setupFilterDropdown() {
        const filterButton = document.getElementById('filterButton');
        const filterDropdown = document.getElementById('filterDropdown');
        const applyButton = document.getElementById('applyFiltersButton');
        const resetButton = document.getElementById('resetFiltersButton');

        // Показ/скрытие
        filterButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = filterDropdown.style.display !== 'block';
            filterDropdown.style.display = isHidden ? 'block' : 'none';
            filterButton.querySelector('.sort_arrow').textContent = isHidden ? '▲' : '▼';
            filterButton.classList.toggle('active', isHidden);
        });

        document.addEventListener('click', () => {
            filterDropdown.style.display = 'none';
            filterButton.classList.remove('active');
            filterButton.querySelector('.sort_arrow').textContent = '▼';
        });

        filterDropdown.addEventListener('click', (e) => e.stopPropagation());

        // Применить
        applyButton.addEventListener('click', () => {
            this.applyFilters();
            filterDropdown.style.display = 'none';
            filterButton.classList.remove('active');
            filterButton.querySelector('.sort_arrow').textContent = '▼';
        });

        // Сбросить
        resetButton.addEventListener('click', () => {
            this.resetFilters();
        });
    }

    applyFilters() {
        // Категории
        const categoryCheckboxes = document.querySelectorAll('#categoriesContainer input[type="checkbox"]');
        const selectedCategories = new Set(
            Array.from(categoryCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value)
        );

        // Теги
        const tagCheckboxes = document.querySelectorAll('#tagsContainer input[type="checkbox"]');
        const selectedTags = new Set(
            Array.from(tagCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value)
        );

        // Год
        const yearRadio = document.querySelector('#yearsContainer input[type="radio"]:checked');
        const selectedYear = yearRadio ? yearRadio.value : null;

        this.activeFilters = { categories: selectedCategories, tags: selectedTags, year: selectedYear };

        this.reapplyAllFilters();    
    }

    resetFilters() {
        document.querySelectorAll('#categoriesContainer input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('#tagsContainer input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('#yearsContainer input[type="radio"]').forEach(r => r.checked = false);

        // Сбрасываем состояние
        this.activeFilters = { categories: new Set(), tags: new Set(), year: null };

        this.documents = [...this.originalDocuments];

        this.reapplyAllFilters();
    }


    setupCustomSort() {
        const sortButton = document.getElementById('sortButton');
        const sortDropdown = document.getElementById('sortDropdown');
        const radioInputs = sortDropdown.querySelectorAll('input[type="radio"][name="sort_criteria"]');
        const resetButton = document.getElementById('resetSortButton');
        const defaultButtonText = 'Сортировка';

        const updateButtonText = () => {
            const checkedRadio = Array.from(radioInputs).find(radio => radio.checked);
            const labelText = checkedRadio
                ? (sortDropdown.querySelector(`label[for="${checkedRadio.id}"]`) || checkedRadio.closest('label'))?.textContent.trim()
                : '';
            sortButton.innerHTML = `${labelText || defaultButtonText} <span class="sort_arrow">▼</span>`;
        };

        updateButtonText();

        radioInputs.forEach(radio => {
            radio.addEventListener('change', () => {
                updateButtonText();
                this.sortDocuments(radio.value);
                sortDropdown.style.display = 'none';
                sortButton.classList.remove('active');
                sortButton.querySelector('.sort_arrow').textContent = '▼';
            });
        });

        if (resetButton) {
            resetButton.addEventListener('click', (e) => {
                e.stopPropagation();

                radioInputs.forEach(radio => (radio.checked = false));
                sortButton.innerHTML = `${defaultButtonText} <span class="sort_arrow">▼</span>`;

                // Восстанавливаем изначальный порядок загрузки
                this.documents = [...this.initialDocuments];

                // Применяем фильтры и поиск
                this.reapplyAllFilters();

                // Закрываем меню
                sortDropdown.style.display = 'none';
                sortButton.classList.remove('active');
            });
        }

        sortButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = sortDropdown.style.display !== 'block';
            sortDropdown.style.display = isHidden ? 'block' : 'none';
            sortButton.querySelector('.sort_arrow').textContent = isHidden ? '▲' : '▼';
            sortButton.classList.toggle('active', isHidden);
        });

        document.addEventListener('click', () => {
            sortDropdown.style.display = 'none';
            sortButton.classList.remove('active');
            sortButton.querySelector('.sort_arrow').textContent = '▼';
        });

        sortDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    async loadDocuments() {
        try {
            console.log('Запрос к /api/documents...');
            
            // --- Запрос свежих данных с сервера ---
            const response = await fetch('/api/documents', {
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

    async loadFilters() {
        try {
            const response = await fetch('/api/filters', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Не удалось загрузить фильтры');

            const data = await response.json();

            this.renderFilterOptions(data);
        } catch (error) {
            console.error('Ошибка загрузки фильтров:', error);
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

        // Форматируем дату
        let formattedDate = 'Дата не указана';
        if (doc.uploadDate) {
            const uploadDate = new Date(doc.uploadDate);
            formattedDate = uploadDate.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        }

        let previewHTML = '';

        if (doc.previewImage) {
            // Показываем готовое превью с сервера
            previewHTML = `<img src="${doc.previewImage}" alt="Превью" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">`;
        } else {
            // Если превью нет — показываем заглушку
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
        
        // Генерируем теги
        let tagsHTML = '';
        if (doc.tags && doc.tags.length > 0) {
            const tagsToShow = doc.tags.slice(0, 3).map(tag => `<span class="groups">${tag}</span>`).join('');
            const extraTags = doc.tags.length > 3 ? `<span class="groups">+${doc.tags.length - 3}</span>` : '';
            tagsHTML = `
                <div class="document_groups">
                    ${doc.category ? `<span class="groups">${doc.category}</span>` : ''}
                    ${tagsToShow}
                    ${extraTags}
                </div>
            `;
        } else if (doc.category) {
            tagsHTML = `
                <div class="document_groups">
                    <span class="groups">${doc.category}</span>
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
            ${tagsHTML}
            <div class="document_meta">
                <span>Загружено:</span>
                <span>${formattedDate}</span>
            </div>
        `;

        // Добавляем обработчик клика
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.preview_canvas, .groups')) {
                window.location.href = `./viewing.html?id=${doc.id}`;
            }
        });

        return card;
    }

    updateDocumentCard(docId) {
        const card = document.querySelector(`.document_card[data-id="${docId}"]`);
        if (!card || !card.isConnected) return;

        const doc = this.documents.find(d => d.id === docId);
        if (!doc) return;

        if (doc.previewImage) {
            const img = card.querySelector('.document_preview img');
            if (img) img.src = doc.previewImage;
        }
    }

    getDocumentWord(count) {
        const lastDigit = count % 10;
        const lastTwoDigits = count % 100;
        if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'документов';
        if (lastDigit === 1) return 'документ';
        if (lastDigit >= 2 && lastDigit <= 4) return 'документа';
        return 'документов';
    }

    updateDocumentCount() {
        const countElement = this.documentsContainer.querySelector('.documents_count');
        if (countElement) {
            countElement.textContent = `${this.documents.length} ${this.getDocumentWord(this.documents.length)}`;
        }
    }

    async searchDocuments(query) {
        const input = document.querySelector('.search_block input');
        query = (query || input.value || '').trim();

        const existingHistory = document.querySelector('.search_history');
        if (existingHistory) {
            existingHistory.remove();
        }

        if (query) {
            await this.saveSearchQuery(query);
        }

        this.reapplyAllFilters();
    }

    reapplyAllFilters() {
        const { categories, tags, year } = this.activeFilters;
        const searchInput = document.querySelector('.search_block input');
        const query = searchInput?.value.trim().toLowerCase() || '';

        // Фильтруем по категориям, тегам, году
        let filtered = this.originalDocuments.filter(doc => {
            const matchesCategory = categories.size === 0 || categories.has(doc.category);
            
            const docTags = new Set(doc.tags || []);
            const matchesTag = tags.size === 0 || [...tags].some(t => docTags.has(t));

            let matchesYear = true;
            if (year) {
                const uploadDate = new Date(doc.uploadDate);
                const docYear = uploadDate.getFullYear();

                if (year.includes('-')) {
                    const [start, end] = year.split('-').map(Number);
                    matchesYear = docYear >= start && docYear <= end;
                } else {
                    matchesYear = docYear === Number(year);
                }
            }

            return matchesCategory && matchesTag && matchesYear;
        });

        // Поиск
        if (query) {
            filtered = filtered.filter(doc => {
                const title = doc.title.toLowerCase();
                const category = (doc.category || '').toLowerCase();
                const tagsStr = (doc.tags || []).join(' ').toLowerCase();
                return title.includes(query) || category.includes(query) || tagsStr.includes(query);
            });
        }

        // Сохраняем и отображаем
        this.documents = filtered;
        this.renderDocuments();
        this.updateVisibleCount(filtered.length);
    }

    applyFiltersToCurrentList() {
        const { categories, tags, year } = this.activeFilters;
        const searchInput = document.querySelector('.search_block input');
        const query = searchInput?.value.trim().toLowerCase() || '';

        // Фильтруем текущий список
        let filtered = this.documents.filter(doc => {
            const matchesCategory = categories.size === 0 || categories.has(doc.category);
            
            const docTags = new Set(doc.tags || []);
            const matchesTag = tags.size === 0 || [...tags].some(t => docTags.has(t));

            let matchesYear = true;
            if (year) {
                const uploadDate = new Date(doc.uploadDate);
                const docYear = uploadDate.getFullYear();

                if (year.includes('-')) {
                    const [start, end] = year.split('-').map(Number);
                    matchesYear = docYear >= start && docYear <= end;
                } else {
                    matchesYear = docYear === Number(year);
                }
            }

            return matchesCategory && matchesTag && matchesYear;
        });

        // Поиск
        if (query) {
            filtered = filtered.filter(doc => {
                const title = doc.title.toLowerCase();
                const category = (doc.category || '').toLowerCase();
                const tagsStr = (doc.tags || []).join(' ').toLowerCase();
                return title.includes(query) || category.includes(query) || tagsStr.includes(query);
            });
        }

        // Сохраняем и отображаем
        this.documents = filtered;
        this.renderDocuments();
        this.updateVisibleCount(filtered.length);
    }

    sortDocuments(criteria) {
        let sorted = [...this.originalDocuments];

        switch (criteria) {
            case 'newest':
                sorted.sort((a, b) => (b.uploadDate ? new Date(b.uploadDate) : 0) - (a.uploadDate ? new Date(a.uploadDate) : 0));
                break;
            case 'oldest':
                sorted.sort((a, b) => (a.uploadDate ? new Date(a.uploadDate) : 0) - (b.uploadDate ? new Date(b.uploadDate) : 0));
                break;
            case 'name_asc':
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'name_desc':
                sorted.sort((a, b) => b.title.localeCompare(a.title));
                break;
            default:
                return;
        }

        this.documents = sorted;
        
        this.applyFiltersToCurrentList();
    }

    renderFilterOptions({ categories, tags }) {
        const years = [
            '2026', '2025', '2024', '2023', '2022', '2021',
            '2016-2020', '2010-2015'
        ];

        const createCheckbox = (name, value, containerId, checked = false) => {
            return `
                <label class="filter_option">
                    <input type="checkbox" value="${value}" ${checked ? 'checked' : ''}>
                    ${name}
                </label>`;
        };

        const createRadio = (name, value, containerId, checked = false) => {
            return `
                <label class="filter_option">
                    <input type="radio" name="filter_year" value="${value}" ${checked ? 'checked' : ''}>
                    ${name}
                </label>`;
        };

        // Категории
        const categoriesHtml = categories
            .map(cat => createCheckbox(cat, cat, 'categories'))
            .join('');
        document.getElementById('categoriesContainer').innerHTML = categoriesHtml;

        // Теги
        const tagsHtml = tags
            .map(tag => createCheckbox(tag, tag, 'tags'))
            .join('');
        document.getElementById('tagsContainer').innerHTML = tagsHtml;

        // Годы
        const yearsHtml = years
            .map(year => {
                const [start, end] = year.split('-');
                const label = end ? `${start}–${end}` : year;
                return createRadio(label, year, 'years');
            })
            .join('');
        document.getElementById('yearsContainer').innerHTML = yearsHtml;
    }

    updateVisibleCount(count) {
        const countElement = this.documentsContainer.querySelector('.documents_count');
        if (countElement) {
            countElement.textContent = `${count} ${this.getDocumentWord(count)}`;
        }
    }

    async saveSearchQuery(query) {
        try {
            await fetch('/api/search/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ query })
            });
        } catch (e) {
            console.warn('Не удалось сохранить запрос в историю');
        }
    }

    async loadSearchHistory() {
        try {
            const response = await fetch('/api/search/history', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });

            const result = await response.json();
            if (result.success) {
                this.renderSearchHistory(result.queries);
            }
        } catch (e) {
            console.warn('Не удалось загрузить историю поиска');
        }
    }

    renderSearchHistory(queries) {
        const searchBlock = document.querySelector('.search_block');
        const searchIcon = searchBlock.querySelector('img');
        let historyHTML = '';

        if (queries && queries.length > 0) {
            historyHTML = `
                <div class="search_history">
                    ${queries.map(q => `
                        <div class="history_item" data-query="${q}">
                            <img src="./src/image/search.png" alt="Поиск">
                            <span>${q}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            historyHTML = `
                <div class="search_history" style="
                    position: absolute; top: 100%; left: 0; right: 0;
                    background: white; border: 1px solid #ddd;
                    border-top: none; border-radius: 0 0 10px 10px;
                    padding: 10px; text-align: center; color: #888; font-size: 14px; z-index: 1000;
                ">
                    Нет истории
                </div>
            `;
        }

        // Удаляем старую историю поиска
        const existingHistory = document.querySelector('.search_history');
        if (existingHistory) {
            existingHistory.remove();
        }

        // Вставляем новую историю поиска
        searchBlock.insertAdjacentHTML('beforeend', historyHTML);

        if (searchIcon) {
            searchIcon.style.display = 'none';
        }

        searchBlock.classList.add('with-history');

        // Добавляем обработчики для элементов истории
        document.querySelectorAll('.history_item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const query = item.getAttribute('data-query');
                const input = document.querySelector('.search_block input');
                input.value = query;

                // Обновляем состояние кнопки очистки
                const clearButton = document.querySelector('.search_clear');
                if (clearButton) {
                    clearButton.style.display = input.value.trim() ? 'block' : 'none';
                }

                this.searchDocuments(query);
                this.hideSearchHistory(searchBlock, searchIcon); // Скрываем историю и возвращаем иконку
            });
        });

        // Закрытие при клике вне области
        document.addEventListener('click', (e) => {
            if (!searchBlock.contains(e.target)) {
                this.hideSearchHistory(searchBlock, searchIcon);
            }
        });
    }

    hideSearchHistory(searchBlock, searchIcon) {
        const history = document.querySelector('.search_history');
        if (history) history.remove();
        searchBlock.classList.remove('with-history');
        if (searchIcon) {
            searchIcon.style.display = '';
        }
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