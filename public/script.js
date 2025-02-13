// Глобальная переменная для WebSocket-соединения
let socket = null;
// Получаем элементы DOM
const registerContainer = document.getElementById('register-container'); // Форма регистрации
const loginContainer = document.getElementById('login-container'); // Форма входа
const chatContainer = document.getElementById('chat-container'); // Окно чата
const messagesContainer = document.getElementById('messages'); // Контейнер для отображения сообщений
const registerForm = document.getElementById('register-form'); // Форма регистрации
const loginForm = document.getElementById('login-form'); // Форма входа
const messageForm = document.getElementById('message-form'); // Форма отправки сообщений
const messageInput = document.getElementById('message-input'); // Поле ввода
const logoutButton = document.getElementById('logout-button');

// Устанавливаем начальное состояние элементов интерфейса
registerContainer.style.display = 'none'; // Скрываем форму регистрации
loginContainer.style.display = 'flex'; // Показываем форму входа
chatContainer.style.display = 'none'; // Скрываем чат

const displayedMessages = new Set(); // Множество для хранения ID уже отображённых сообщений

let lastReceivedTimestamp = null; // Временная метка последнего полученного сообщения

// Функция для проверки авторизации пользователя при загрузке страницы
async function checkAuth() {
    try {
        const response = await fetch('/check-auth', { credentials: 'include' }); // Отправляем запрос на сервер для проверки состояния сессии
        const data = await response.json();

        // Если пользователь авторизован, показываем чат
        if (data.authenticated) {
            loginContainer.style.display = 'none';
            registerContainer.style.display = 'none'; 
            chatContainer.style.display = 'block'; // Показываем чат

            // Если сокет ещё не создан, инициализируем его
            if (!socket) {
                socket = io({ withCredentials: true }); // Создаём WebSocket-соединение
                setupSocketListeners(socket); // Настройка слушателей событий для сокета
            }   
            socket.emit('setUsername', data.username); // Устанавливаем имя пользователя для сокета
        } 
        // Если пользователь не авторизован, показываем форму входа
        else {
            loginContainer.style.display = 'flex';
            registerContainer.style.display = 'none';
            chatContainer.style.display = 'none';
        }
    } catch (error) {
        // При ошибке показываем форму входа
        loginContainer.style.display = 'flex';
        registerContainer.style.display = 'none';
        chatContainer.style.display = 'none';
    }
}

checkAuth(); // Вызываем функцию проверки авторизации при загрузке страницы

// Функция для добавления обычного сообщения в чат
function addMessage(message) {
    
    if (displayedMessages.has(message.id)) return; // Проверяем, не было ли это сообщение уже добавлено

    displayedMessages.add(message.id); // Добавляем ID сообщения в множество отображённых
   
    lastReceivedTimestamp = new Date(message.createdAt).getTime(); // Обновляем временную метку последнего сообщения

    // Создаём элемент для отображения сообщения
    const messageElement = document.createElement('div');
    messageElement.textContent = `${message.username}: ${message.text}`;
    messagesContainer.appendChild(messageElement); // Добавляем сообщение в контейнер
    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Прокручиваем чат вниз
}

// Функция для добавления системного сообщения (например, о входе/выходе пользователя)
function addSystemMessage(message) { 
    const messageElement = document.createElement('div'); // Создаём элемент для отображения системного сообщения
    messageElement.textContent = message;
    messageElement.style.color = 'gray'; // Устанавливаем серый цвет для системных сообщений
    messagesContainer.appendChild(messageElement); // Добавляем сообщение в контейнер
    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Прокручиваем чат вниз
}

// Функция для настройки слушателей событий WebSocket
function setupSocketListeners(socket) {
    
    socket.on('previousMessages', (messages) => { // Обработка получения старых сообщений
        
        displayedMessages.clear(); // Очищаем множество отображённых сообщений перед добавлением старых

        
        messages.forEach(addMessage); // Добавляем каждое сообщение из истории

        // Обновляем временную метку последнего сообщения
        if (messages.length > 0) {
            lastReceivedTimestamp = new Date(messages[messages.length - 1].createdAt).getTime();
        } else {
            lastReceivedTimestamp = null; // Если сообщений нет
        }
    });

    // Обработка получения нового сообщения
    socket.on('receiveMessage', (message) => {
        
        const messageTimestamp = new Date(message.createdAt).getTime(); // Преобразуем временную метку сообщения в миллисекунды

        
        if (lastReceivedTimestamp === null || messageTimestamp > lastReceivedTimestamp) { // Добавляем сообщение только если оно новее последнего обработанного
            addMessage(message);
        }
    });

    // Обработка входа нового пользователя
    socket.on('userJoined', (data) => {
        addSystemMessage(data.message); // Добавляем системное сообщение о входе
    });

    // Обработка выхода пользователя
    socket.on('userLeft', (data) => {
        addSystemMessage(data.message); // Добавляем системное сообщение о выходе
    });
}

// Обработчик переключения между формами входа и регистрации
document.getElementById('switch-to-login').addEventListener('click', () => {
    registerContainer.style.display = 'none'; // Скрываем форму регистрации
    loginContainer.style.display = 'flex'; // Показываем форму входа
    chatContainer.style.display = 'none'; // Скрываем чат
});

document.getElementById('switch-to-register').addEventListener('click', () => {
    loginContainer.style.display = 'none'; // Скрываем форму входа
    registerContainer.style.display = 'flex'; // Показываем форму регистрации
    chatContainer.style.display = 'none'; // Скрываем чат
});

// Обработчик формы регистрации
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Предотвращаем стандартную отправку формы

    const username = document.getElementById('register-username').value.trim(); // Получаем имя пользователя
    const password = document.getElementById('register-password').value.trim(); // Получаем пароль

    // Проверяем, что поля не пустые
    if (!username || !password) {
        alert('Имя пользователя и пароль должны быть указаны');
        return;
    }

    try {
        // Отправляем данные для регистрации на сервер
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        // Проверяем ответ сервера
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const result = await response.text();
        alert(result); // Отображаем результат регистрации

        // После успешной регистрации показываем форму входа
        if (response.ok) {
            registerContainer.style.display = 'none';
            loginContainer.style.display = 'flex';
            chatContainer.style.display = 'none';
        }
    } catch (error) {
        alert(`Ошибка регистрации: ${error.message}`); // Отображаем ошибку регистрации
    }
});

// Обработчик формы входа
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Предотвращаем стандартную отправку формы

    const username = document.getElementById('login-username').value.trim(); // Получаем имя пользователя
    const password = document.getElementById('login-password').value.trim(); // Получаем пароль

    if (!username || !password) { // Проверяем, что поля не пустые
        alert('Имя пользователя и пароль должны быть указаны');
        return;
    }

    try {
        // Отправляем данные для входа на сервер
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        // Проверяем ответ сервера
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const result = await response.text();
        alert(result); // Отображаем результат входа

        // После успешного входа перезагружаем страницу через небольшую задержку
        if (response.ok) {
            setTimeout(() => location.reload(), 500); // Перезагрузка страницы для обновления состояния
        }
    } catch (error) {
        alert(`Ошибка входа: ${error.message}`); // Отображаем ошибку входа
    }
});

// Обработчик кнопки выхода
logoutButton.addEventListener('click', async () => {
    try {     
        const response = await fetch('/logout', { method: 'POST', credentials: 'include' });  // Отправляем запрос на выход на сервер
        const result = await response.text();
        alert(result); // Отображаем результат выхода

        
        if (socket) { // Сбрасываем состояние после выхода
            socket.disconnect(); // Отключаем WebSocket-соединение
            socket = null; // Сбрасываем глобальную переменную сокета
        }

        displayedMessages.clear(); // Очищаем множество отображённых сообщений
        lastReceivedTimestamp = null; // Сбрасываем временную метку

        // Показываем форму входа и скрываем чат
        loginContainer.style.display = 'flex';
        registerContainer.style.display = 'none';
        chatContainer.style.display = 'none';
    } catch (error) {
        alert(`Ошибка выхода: ${error.message}`); // Отображаем ошибку выхода
    }
});

// Обработчик формы отправки сообщений
messageForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Предотвращаем стандартную отправку формы

    const message = messageInput.value.trim(); // Получаем текст сообщения

    
    if (message !== '') { // Если сообщение не пустое, отправляем его на сервер
        socket.emit('sendMessage', message);
        messageInput.value = ''; // Очищаем поле ввода
    }
});