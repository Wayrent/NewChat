// main.js
import * as Core from './core.js';
import * as DOM from './dom.js';
import * as Handlers from './handlers.js';

document.addEventListener('DOMContentLoaded', () => {
    Core.checkAuth();
});

// Подключаем обработчики
DOM.registerForm.addEventListener('submit', Handlers.handleRegister);
DOM.loginForm.addEventListener('submit', Handlers.handleLogin);
DOM.logoutButton.addEventListener('click', Handlers.handleLogout);
DOM.messageForm.addEventListener('submit', Handlers.handleMessageSubmit);

DOM.switchToLoginButton.addEventListener('click', () => Core.showPage('login'));
DOM.switchToRegisterButton.addEventListener('click', () => Core.showPage('register'));