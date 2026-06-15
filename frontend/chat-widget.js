(function() {
    'use strict';
    
    let isOpen = false;
    let isLoading = false;
    let chatWindow = null;
    let chatMessages = null;
    let chatInput = null;
    let sendBtn = null;
    let typingIndicator = null;
    
    // Получаем элементы
    const widget = document.querySelector('.chat-widget');
    const chatButton = widget.querySelector('.chat-button');
    const closeBtn = widget.querySelector('.chat-close');
    chatWindow = widget.querySelector('.chat-window');
    chatMessages = document.getElementById('chatMessages');
    chatInput = document.getElementById('chatInput');
    sendBtn = document.getElementById('chatSendBtn');
    
    function autoResize() {
        // Проверяем, есть ли текст
        if (!chatInput.value.trim()) {
            chatInput.style.height = '40px';
            chatInput.style.overflowY = 'hidden';
            return;
        }
        
        // Проверяем, есть ли перенос строки
        const hasLineBreak = chatInput.value.includes('\n');
        
        if (!hasLineBreak) {
            // Если нет переноса строки, проверяем, помещается ли текст по ширине
            // Создаем временный элемент для измерения ширины текста
            const tempSpan = document.createElement('span');
            tempSpan.style.position = 'absolute';
            tempSpan.style.visibility = 'hidden';
            tempSpan.style.whiteSpace = 'nowrap';
            tempSpan.style.fontSize = window.getComputedStyle(chatInput).fontSize;
            tempSpan.style.fontFamily = window.getComputedStyle(chatInput).fontFamily;
            tempSpan.style.fontWeight = window.getComputedStyle(chatInput).fontWeight;
            tempSpan.innerText = chatInput.value;
            document.body.appendChild(tempSpan);
            
            const textWidth = tempSpan.offsetWidth;
            document.body.removeChild(tempSpan);
            
            // Получаем доступную ширину поля (ширина минус padding)
            const inputWidth = chatInput.clientWidth - 28; // 14px padding слева и справа
            
            // Если текст помещается по ширине, оставляем 40px
            if (textWidth <= inputWidth) {
                if (chatInput.style.height !== '40px') {
                    chatInput.style.height = '40px';
                    chatInput.style.overflowY = 'hidden';
                }
                return;
            }
        }
        
        // Если есть перенос строки ИЛИ текст не помещается по ширине
        // Сбрасываем высоту для расчета
        chatInput.style.height = 'auto';
        
        // Получаем высоту содержимого
        const scrollHeight = chatInput.scrollHeight;
        
        // Устанавливаем новую высоту, но не больше 120px
        let newHeight = scrollHeight;
        if (newHeight > 120) {
            newHeight = 120;
            chatInput.style.overflowY = 'auto';
        } else {
            chatInput.style.overflowY = 'hidden';
        }
        
        chatInput.style.height = newHeight + 'px';
    }
    
    function toggleChat() {
        isOpen = !isOpen;
        chatWindow.style.display = isOpen ? 'flex' : 'none';
        if (isOpen) {
            setTimeout(() => {
                chatInput.focus();
                chatInput.style.height = '40px';
                chatInput.style.overflowY = 'hidden';
                scrollToBottom();
            }, 100);
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function addMessage(role, content, doc, quote) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        
        if (role === 'assistant') {
            const img = document.createElement('img');
            img.src = './src/image/ai.png';
            img.alt = 'Чат-бот';
            img.style.width = '20px';
            img.style.height = '20px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '50%';
            avatar.appendChild(img);
        } else {
            const img = document.createElement('img');
            img.src = './src/image/account_round_icon.png';
            img.alt = 'Пользователь';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '50%';
            avatar.appendChild(img);
        }
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Форматируем ответ с выделением цитат
        let formattedContent = content.replace(/\n/g, '<br>');
        
        // Выделяем кавычки (цитаты из документа)
        formattedContent = formattedContent.replace(
            /"([^"]+)"/g, 
            '<span style="background: #f0f4ff; padding: 2px 6px; border-radius: 6px; font-style: italic;">«$1»</span>'
        );
        
        contentDiv.innerHTML = `<p>${formattedContent}</p>`;
        
        if (doc && role === 'assistant') {
            const docPreview = document.createElement('div');
            docPreview.className = 'doc-preview';
            docPreview.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px;
                background: #f8f9fa;
                border-radius: 8px;
                margin-top: 12px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            docPreview.innerHTML = `
                <img src="${doc.previewImage || '/src/image/document.png'}" 
                    alt="PDF" 
                    style="width: 32px; height: 32px; object-fit: contain;">
                <div class="doc-info">
                    <div class="doc-title" style="font-weight: 500; font-size: 13px;">${escapeHtml(doc.title)}</div>
                    <div class="doc-size" style="font-size: 11px; color: #6c757d;">PDF документ</div>
                </div>
            `;
            docPreview.addEventListener('click', function() {
                window.location.href = `/viewing.html?id=${doc.id}`;
            });
            contentDiv.appendChild(docPreview);
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        
        chatMessages.appendChild(messageDiv);
        scrollToBottom();
    }

    
    function showTyping() {
        isLoading = true;
        typingIndicator = document.createElement('div');
        typingIndicator.className = 'chat-message assistant';
        typingIndicator.innerHTML = `
            <div class="message-avatar">
                <img src="./src/image/ai.png" alt="Чат-бот" style="width:20px;height:20px;object-fit:cover;border-radius:50%">
            </div>
            <div class="message-content">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(typingIndicator);
        scrollToBottom();
    }
    
    function hideTyping() {
        isLoading = false;
        if (typingIndicator) {
            typingIndicator.remove();
            typingIndicator = null;
        }
    }
    
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `chat-notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            background: ${type === 'info' ? '#1C4DFE' : '#28a745'};
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    async function sendMessage() {
        const question = chatInput.value.trim();
        if (!question || isLoading) return;
        
        addMessage('user', question);
        chatInput.value = '';
        chatInput.style.height = '40px';
        sendBtn.disabled = true;
        
        showTyping();
        
        scrollToBottom();
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 секунд
            
            const answerRes = await fetch('/api/chat/answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ question: question }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!answerRes.ok) {
                throw new Error(`HTTP ${answerRes.status}`);
            }
            
            const answerData = await answerRes.json();
            
            hideTyping();
            
            if (answerData.hasAnswer) {
                addMessage('assistant', answerData.answer, answerData.document);
                
                // Если ответ содержит цитату, показываем уведомление
                if (answerData.answer.includes('"')) {
                    showNotification('Ответ основан на цитате из документа');
                }
            } else {
                addMessage('assistant', answerData.answer);
            }
            
        } catch (error) {
            console.error('Ошибка:', error);
            hideTyping();
            
            if (error.name === 'AbortError') {
                addMessage('assistant', 'Поиск ответа занимает слишком много времени. Попробуйте:\n\n• Задать более конкретный вопрос\n• Упростить формулировку\n• Проверить, что документы загружены');
            } else {
                addMessage('assistant', 'Произошла ошибка. Пожалуйста, попробуйте позже или переформулируйте вопрос.');
            }
        } finally {
            sendBtn.disabled = false;
        }
    }
    
    chatButton.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', toggleChat);
    sendBtn.addEventListener('click', sendMessage);
    
    chatInput.addEventListener('input', function() {
        sendBtn.disabled = !this.value.trim();
        autoResize();
    });
    
    chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (this.value.trim()) {
                sendMessage();
            }
        }
    });
    
    // Инициализация
    chatInput.style.height = '40px';
    chatInput.style.overflowY = 'hidden';
    
    fetch('/api/user', { credentials: 'include' })
        .then(response => {
            if (!response.ok) {
                widget.style.display = 'none';
            }
        })
        .catch(() => {
            widget.style.display = 'none';
        });
})();