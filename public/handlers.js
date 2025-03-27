// handlers.js

import * as Core from './core.js';
import * as DOM from './dom.js';

// Обработчики аутентификации
async function handleRegister(e) {
    e.preventDefault();
    const username = DOM.registerForm.querySelector('#register-username').value.trim();
    const password = DOM.registerForm.querySelector('#register-password').value.trim();

    if (!username || !password) {
        alert('Имя пользователя и пароль должны быть указаны');
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const result = await response.text();
        alert(result);

        Core.showPage('login');
    } catch (error) {
        alert(`Ошибка регистрации: ${error.message}`);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = DOM.loginForm.querySelector('#login-username').value.trim();
    const password = DOM.loginForm.querySelector('#login-password').value.trim();

    if (!username || !password) {
        alert('Имя пользователя и пароль должны быть указаны');
        return;
    }

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const result = await response.text();
        alert(result);
        Core.checkAuth();

    } catch (error) {
        alert(`Ошибка входа: ${error.message}`);
    }
}

async function handleLogout() {
    const response = await fetch('/logout', { method: 'POST', credentials: 'include' });
    const result = await response.text();
    alert(result);
    Core.showPage('login');
}

// Обработчик отправки сообщений
function handleMessageSubmit(e) {
    e.preventDefault();
    const message = DOM.messageInput.value.trim();
    if (message !== '') {
        if (!Core.socket || !Core.username) {
            alert('Вы не авторизованы');
            return;
        }

        if (Core.currentChatType === 'public') {
            Core.socket.emit('sendMessage', message);
        } else {
            Core.socket.emit('sendPrivateMessage', { recipient: Core.currentRecipient, text: message });
        }

        DOM.messageInput.value = '';
    }
}

// Экспорты
export {
    handleRegister,
    handleLogin,
    handleLogout,
    handleMessageSubmit
};