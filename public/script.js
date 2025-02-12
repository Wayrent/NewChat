// Глобальная переменная для сокета
let socket = null;

// Получаем элементы DOM
const registerContainer = document.getElementById('register-container');
const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const messagesContainer = document.getElementById('messages');
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const logoutButton = document.getElementById('logout-button');

// Скрываем все контейнеры по умолчанию
registerContainer.style.display = 'none';
loginContainer.style.display = 'none';
chatContainer.style.display = 'none';

// Множество для хранения ID уже отображённых сообщений
const displayedMessages = new Set();

// Временная метка последнего полученного сообщения
let lastReceivedTimestamp = null;

// Проверка авторизации при загрузке страницы
async function checkAuth() {
    try {
        const response = await fetch('/check-auth', { credentials: 'include' });
        const data = await response.json();

        if (data.authenticated) {
            // Если пользователь авторизован, показываем чат
            loginContainer.style.display = 'none';
            registerContainer.style.display = 'none';
            chatContainer.style.display = 'block';

            // Инициализируем сокет только если он ещё не создан
            if (!socket) {
                socket = io({ withCredentials: true }); // Добавляем параметр для передачи cookies
                setupSocketListeners(socket); // Настройка слушателей событий
            }

            // Устанавливаем имя пользователя для сокета
            socket.emit('setUsername', data.username);
        } else {
            // Если пользователь не авторизован, показываем форму входа
            loginContainer.style.display = 'flex';
            registerContainer.style.display = 'none';
            chatContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка при проверке авторизации:', error);
        // По умолчанию показываем форму входа
        loginContainer.style.display = 'flex';
        registerContainer.style.display = 'none';
        chatContainer.style.display = 'none';
    }
}

// Вызываем функцию проверки авторизации при загрузке страницы
checkAuth();

// Функция для добавления сообщения в чат
function addMessage(message) {
    // Проверяем, не было ли это сообщение уже добавлено
    if (displayedMessages.has(message.id)) {
        console.warn(`Сообщение с ID ${message.id} уже отображено`);
        return;
    }

    // Добавляем ID сообщения в множество отображённых
    displayedMessages.add(message.id);

    // Обновляем временную метку последнего сообщения
    lastReceivedTimestamp = new Date(message.createdAt).getTime();

    const messageElement = document.createElement('div');
    messageElement.textContent = `${message.username}: ${message.text}`;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Функция для добавления системного сообщения
function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.style.color = 'gray';
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Настройка слушателей событий для сокета
function setupSocketListeners(socket) {
    // Получение предыдущих сообщений
    socket.on('previousMessages', (messages) => {
        console.log('Получены старые сообщения:', messages); // Логируем старые сообщения
        displayedMessages.clear();

        messages.forEach(addMessage);

        // Устанавливаем временную метку последнего сообщения из истории
        if (messages.length > 0) {
            lastReceivedTimestamp = new Date(messages[messages.length - 1].createdAt).getTime();
        } else {
            lastReceivedTimestamp = null; // Если сообщений нет
        }
    });

    // Получение нового сообщения
    socket.on('receiveMessage', (message) => {
        console.log('Получено новое сообщение:', message); // Логируем новое сообщение
        const messageTimestamp = new Date(message.createdAt).getTime();

        if (lastReceivedTimestamp === null || messageTimestamp > lastReceivedTimestamp) {
            addMessage(message);
        } else {
            console.warn('Игнорируем дублирующееся сообщение:', message); // Логируем игнорируемые сообщения
        }
    });

    // Обработка входа нового пользователя
    socket.on('userJoined', (data) => {
        addSystemMessage(data.message); // Добавляем только системное сообщение
    });

    // Обработка выхода пользователя
    socket.on('userLeft', (data) => {
        addSystemMessage(data.message); // Добавляем только системное сообщение
    });
}

// Регистрация пользователя
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();

    // Проверяем, что поля не пустые
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

        if (response.ok) {
            registerContainer.style.display = 'none';
            loginContainer.style.display = 'flex';
            chatContainer.style.display = 'none';
        }
    } catch (error) {
        alert(`Ошибка регистрации: ${error.message}`);
    }
});

// Вход пользователя
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

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

        if (response.ok) {
            // Показываем чат
            loginContainer.style.display = 'none';
            registerContainer.style.display = 'none';
            chatContainer.style.display = 'block';

            // Если сокет ещё не создан, создаём его
            if (!socket) {
                socket = io({ withCredentials: true }); // Добавляем параметр для передачи cookies
                setupSocketListeners(socket); // Настройка слушателей событий
            }

            // Устанавливаем имя пользователя для сокета
            socket.emit('setUsername', username);

            // Перезагружаем страницу после входа
            setTimeout(() => {
                location.reload(); // Автоматическая перезагрузка страницы
            }, 500); // Задержка в 500 мс для завершения запросов
        }
    } catch (error) {
        alert(`Ошибка входа: ${error.message}`);
    }
});

// Выход из учётной записи
logoutButton.addEventListener('click', async () => {
    const response = await fetch('/logout', { method: 'POST', credentials: 'include' });
    const result = await response.text();
    alert(result);

    chatContainer.style.display = 'none';
    loginContainer.style.display = 'flex';
    registerContainer.style.display = 'none';

    // Очищаем состояние при выходе
    if (socket) {
        socket.disconnect(); // Отключаем сокет
        socket = null; // Сбрасываем глобальную переменную
    }

    displayedMessages.clear();
    lastReceivedTimestamp = null;
});

// Отправка сообщения
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value;
    if (message.trim() !== '') {
        socket.emit('sendMessage', message);
        messageInput.value = '';
    }
});