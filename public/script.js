let socket = null; // Объект WebSocket
const displayedPublicMessages = new Set(); // Set для хранения ID отображенных публичных сообщений
const displayedPrivateMessages = new Map(); // Map для хранения множества ID личных сообщений для каждого собеседника
let lastReceivedPublicTimestamp = null; // Время последнего полученного публичного сообщения
let currentRecipient = null; // Текущий получатель личных сообщений
let conversationsLoaded = false; // Флаг, указывающий, загружен ли список собеседников
let username = null; // Имя текущего пользователя
let currentChatType = 'public'; // Тип текущего чата (public или private)

// Получаем элементы DOM
const registerContainer = document.getElementById('register-container');
const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const messagesContainer = document.getElementById('messages');
const conversationsListContainer = document.getElementById('conversations-list');
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const logoutButton = document.getElementById('logout-button');
const backToPublicChatButton = document.getElementById('back-to-public-chat');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const conversationsList = document.getElementById('conversations');
const clearMessagesButton = document.getElementById('clear-messages-button');
const clearPrivateMessagesButton = document.getElementById('clear-private-messages-button');

// Проверка авторизации при загрузке страницы
async function checkAuth() {
    try {
        const response = await fetch('/check-auth', { credentials: 'include' });
        const data = await response.json();

        if (data.authenticated) {
            username = data.username; // Сохраняем имя пользователя
            loginContainer.style.display = 'none';
            registerContainer.style.display = 'none';
            chatContainer.style.display = 'block';

            if (!socket) {
                socket = io({ withCredentials: true }); // Инициализация сокета
                setupSocketListeners(socket); // Настройка обработчиков событий сокета
            }

            setTimeout(() => loadConversations(), 500); // Загрузка списка собеседников
        } else {
            loginContainer.style.display = 'flex';
            registerContainer.style.display = 'none';
            chatContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка при проверке авторизации:', error);
        loginContainer.style.display = 'flex';
        registerContainer.style.display = 'none';
        chatContainer.style.display = 'none';
    }
}

checkAuth(); // Вызов функции проверки авторизации

// Настройка обработчиков событий сокета
function setupSocketListeners(socket) {
    socket.on('connect', () => {
        console.log('WebSocket connected');
    });

    socket.on('previousMessages', (messages) => {
        displayedPublicMessages.clear(); // Очистка Set перед добавлением старых сообщений
        messages.forEach(addPublicMessage); // Добавление старых сообщений на страницу

        if (messages.length > 0) {
            lastReceivedPublicTimestamp = new Date(messages[messages.length - 1].createdAt).getTime(); // Установка времени последнего сообщения
        } else {
            lastReceivedPublicTimestamp = null;
        }
    });

    socket.on('receiveMessage', (message) => {
        const messageTimestamp = new Date(message.createdAt).getTime(); // Время полученного сообщения
        if (lastReceivedPublicTimestamp === null || messageTimestamp > lastReceivedPublicTimestamp) {
            addPublicMessage(message); // Добавление нового публичного сообщения
        }
    });

    socket.on('receivePrivateMessage', (message) => {
        if (currentRecipient && (currentRecipient === message.sender || currentRecipient === message.recipient)) {
            addPrivateMessage(message); // Добавление нового личного сообщения
        }
    });

    socket.on('userJoined', (data) => addSystemMessage(data.message)); // Обработка события присоединения пользователя
    socket.on('userLeft', (data) => addSystemMessage(data.message)); // Обработка события выхода пользователя
}

// Добавление публичного сообщения на страницу
function addPublicMessage(message) {
    if (displayedPublicMessages.has(message.id)) return; // Проверка, не отображено ли сообщение уже

    displayedPublicMessages.add(message.id); // Добавление ID сообщения в Set
    lastReceivedPublicTimestamp = new Date(message.createdAt).getTime(); // Обновление времени последнего полученного сообщения

    const messageElement = document.createElement('div'); // Создание элемента сообщения
    messageElement.textContent = `${message.username}: ${message.text}`; // Установка текста сообщения
    messagesContainer.appendChild(messageElement); // Добавление элемента сообщения в контейнер
    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Прокрутка контейнера вниз
}

// Добавление системного сообщения на страницу
function addSystemMessage(message) {
    const messageElement = document.createElement('div'); // Создание элемента сообщения
    messageElement.textContent = message; // Установка текста сообщения
    messageElement.style.color = 'gray'; // Установка цвета текста
    messagesContainer.appendChild(messageElement); // Добавление элемента сообщения в контейнер
    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Прокрутка контейнера вниз
}

// Добавление личного сообщения на страницу
function addPrivateMessage(message) {
    if (!displayedPrivateMessages.has(message.recipient)) {
        displayedPrivateMessages.set(message.recipient, new Set()); // Создание Set для хранения ID сообщений, если его еще нет
    }

    const recipientSet = displayedPrivateMessages.get(message.recipient); // Получение Set для текущего получателя
    if (recipientSet.has(message.id)) return; // Проверка, не отображено ли сообщение уже

    recipientSet.add(message.id); // Добавление ID сообщения в Set

    const messageElement = document.createElement('div'); // Создание элемента сообщения
    messageElement.textContent = `${message.sender}: ${message.text}`; // Установка текста сообщения
    messagesContainer.appendChild(messageElement); // Добавление элемента сообщения в контейнер
    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Прокрутка контейнера вниз
}

// Обработчики переключения между формами регистрации и входа
document.getElementById('switch-to-login').addEventListener('click', () => {
    registerContainer.style.display = 'none';
    loginContainer.style.display = 'flex';
    chatContainer.style.display = 'none';
});

document.getElementById('switch-to-register').addEventListener('click', () => {
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'flex';
    chatContainer.style.display = 'none';
});

// Обработчик отправки формы регистрации
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Предотвращение отправки формы по умолчанию
    const username = document.getElementById('register-username').value.trim(); // Получение и очистка имени пользователя
    const password = document.getElementById('register-password').value.trim(); // Получение и очистка пароля

    if (!username || !password) {
        alert('Имя пользователя и пароль должны быть указаны');
        return;
    }

    try {
        const response = await fetch('/register', { // Отправка запроса на сервер
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }) // Отправка данных в формате JSON
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const result = await response.text();
        alert(result); // Отображение сообщения от сервера

        if (response.ok) {
            registerContainer.style.display = 'none';
            loginContainer.style.display = 'flex';
            chatContainer.style.display = 'none';
        }
    } catch (error) {
        alert(`Ошибка регистрации: ${error.message}`); // Отображение сообщения об ошибке
    }
});

// Обработчик отправки формы входа
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Предотвращение отправки формы по умолчанию
    const username = document.getElementById('login-username').value.trim(); // Получение и очистка имени пользователя
    const password = document.getElementById('login-password').value.trim(); // Получение и очистка пароля

    if (!username || !password) {
        alert('Имя пользователя и пароль должны быть указаны');
        return;
    }

    try {
        const response = await fetch('/login', { // Отправка запроса на сервер
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }) // Отправка данных в формате JSON
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const result = await response.text();
        alert(result); // Отображение сообщения от сервера

        if (response.ok) {
            setTimeout(() => location.reload(), 500); // Перезагрузка страницы после входа
        }
    } catch (error) {
        alert(`Ошибка входа: ${error.message}`); // Отображение сообщения об ошибке
    }
});

// Обработчик нажатия кнопки выхода
logoutButton.addEventListener('click', async () => {
    const response = await fetch('/logout', { method: 'POST', credentials: 'include' }); // Отправка запроса на сервер
    const result = await response.text();
    alert(result); // Отображение сообщения от сервера

    if (socket) {
        socket.disconnect(); // Отключение сокета
        socket = null;
    }

    displayedPublicMessages.clear(); // Очистка Set публичных сообщений
    displayedPrivateMessages.clear(); // Очистка Map личных сообщений
    currentRecipient = null; // Сброс текущего получателя
    conversationsLoaded = false; // Сброс флага загрузки списка собеседников

    loginContainer.style.display = 'flex'; // Отображение формы входа
    registerContainer.style.display = 'none'; // Скрытие формы регистрации
    chatContainer.style.display = 'none'; // Скрытие контейнера чата
});

// Обработчик отправки формы сообщения
messageForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Предотвращение отправки формы по умолчанию
    const message = messageInput.value.trim(); // Получение и очистка текста сообщения
    if (message !== '') {
        if (!socket || !username) {
            alert('Вы не авторизованы');
            return;
        }

        if (currentChatType === 'public') {
            socket.emit('sendMessage', message); // Отправка публичного сообщения
        } else {
            socket.emit('sendPrivateMessage', { recipient: currentRecipient, text: message }); // Отправка личного сообщения
        }

        messageInput.value = ''; // Очистка поля ввода сообщения
    }
});

// Загрузка списка собеседников
async function loadConversations() {
    if (conversationsLoaded || !username) return; // Проверка, загружен ли список уже и авторизован ли пользователь

    try {
        const response = await fetch('/get-conversations', { credentials: 'include' }); // Отправка запроса на сервер
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const data = await response.json(); // Получение данных из ответа

        conversationsList.innerHTML = ''; // Очистка списка

        // Создание элемента "Общий чат"
        const publicChatItem = document.createElement('li');
        publicChatItem.textContent = 'Общий чат';
        publicChatItem.dataset.recipient = 'public';
        publicChatItem.addEventListener('click', () => openChat('public')); // Установка обработчика клика
        conversationsList.appendChild(publicChatItem); // Добавление элемента в список

        // Добавление пользователей в список
        data.forEach((username) => {
            const listItem = document.createElement('li');
            listItem.textContent = username;
            listItem.style.cursor = 'pointer';
            listItem.style.padding = '5px';
            listItem.addEventListener('click', () => openPrivateChat(username)); // Установка обработчика клика

            // Добавляем значок удаления
            const deleteIcon = document.createElement('span');
            deleteIcon.innerHTML = '&times;'; // Значок крестика
            deleteIcon.style.marginLeft = '5px';
            deleteIcon.style.color = 'gray';
            deleteIcon.style.cursor = 'pointer';
            deleteIcon.addEventListener('click', (event) => {
                event.stopPropagation(); // Предотвращаем открытие чата при клике на значок удаления
                deleteConversation(username); // Вызов функции удаления переписки
            });
            listItem.appendChild(deleteIcon);

            conversationsList.appendChild(listItem); // Добавление элемента в список
        });

        conversationsListContainer.style.display = 'block'; // Отображение списка
        conversationsLoaded = true; // Установка флага загрузки
    } catch (error) {
        console.error('Ошибка при загрузке списка собеседников:', error);
    }
}

// Функция для удаления переписки
async function deleteConversation(recipient) {
    if (confirm(`Вы уверены, что хотите удалить чат с ${recipient}?`)) {
        try {
            const response = await fetch('/delete-conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipient }),
                credentials: 'include'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText);
            }

            alert('Чат успешно удален.');
            removeConversationFromList(recipient);
        } catch (error) {
            console.error('Ошибка при удалении чата:', error);
            alert(`Ошибка при удалении чата: ${error.message}`);
        }
    }
}

// Функция для удаления контакта из списка
function removeConversationFromList(recipient) {
    const listItems = conversationsList.querySelectorAll('li');
    listItems.forEach(item => {
        if (item.textContent.startsWith(recipient)) {
            item.remove(); // Удаляем элемент из списка
        }
    });
}

// Открытие чата (публичного или личного)
function openChat(chatType) {
    if (chatType === 'public') {
        currentChatType = 'public'; // Установка типа чата
        currentRecipient = null; // Сброс текущего получателя

        messagesContainer.innerHTML = ''; // Очистка контейнера сообщений
        fetchPublicMessages().then((messages) => {
            messages.forEach(addPublicMessage); // Добавление публичных сообщений на страницу
        });

        chatContainer.style.display = 'block'; // Отображение контейнера чата
    }
}

// Получение публичных сообщений с сервера
async function fetchPublicMessages() {
    try {
        const response = await fetch('/get-public-messages', { credentials: 'include' }); // Отправка запроса на сервер
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const data = await response.json(); // Получение данных из ответа
        displayedPublicMessages.clear(); // Очистка Set публичных сообщений
        return data.messages; // Возвращение массива сообщений
    } catch (error) {
        console.error('Ошибка при получении публичных сообщений:', error);
        return [];
    }
}

// Открытие личного чата с пользователем
function openPrivateChat(recipient) {
    if (!username) {
        alert('Вы не авторизованы');
        return;
    }

    currentChatType = 'private'; // Установка типа чата
    currentRecipient = recipient; // Установка текущего получателя

    chatContainer.style.display = 'block'; // Отображение контейнера чата

    messagesContainer.innerHTML = ''; // Очистка контейнера сообщений
    displayedPrivateMessages.clear(); // Очистка Map личных сообщений

    fetchPrivateMessages(username, recipient).then((messages) => {
        messages.forEach(message => addPrivateMessage(message)); // Добавление личных сообщений на страницу
    });
}

// Получение личных сообщений с сервера
async function fetchPrivateMessages(sender, recipient) {
    if (!sender || !recipient) {
        console.error('Отправитель или получатель не указаны');
        return [];
    }

    try {
        const response = await fetch('/get-private-messages', { // Отправка запроса на сервер
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender, recipient }) // Отправка данных в формате JSON
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const data = await response.json(); // Получение данных из ответа
        return data.messages; // Возвращение массива сообщений
    } catch (error) {
        console.error('Ошибка при получении личных сообщений:', error);
        return [];
    }
}

// Поиск пользователя
searchInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const username = searchInput.value.trim(); // Получение и очистка имени пользователя
        if (!username) return;

        try {
            const response = await fetch('/search-user', { // Отправка запроса на сервер
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }) // Отправка данных в формате JSON
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText);
            }

            const data = await response.json(); // Получение данных из ответа
            alert(`Найден пользователь: ${data.user}`); // Отображение сообщения

            // Добавляем пользователя в список контактов (если его там нет)
            addConversationToList(data.user);

            openPrivateChat(data.user); // Открытие личного чата
        } catch (error) {
            alert(`Ошибка поиска: ${error.message}`); // Отображение сообщения об ошибке
        }
    }
});

// Поиск пользователя
searchButton.addEventListener('click', async () => {
    const username = searchInput.value.trim(); // Получение и очистка имени пользователя
    if (!username) return;

    try {
        const response = await fetch('/search-user', { // Отправка запроса на сервер
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }) // Отправка данных в формате JSON
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const data = await response.json(); // Получение данных из ответа
        alert(`Найден пользователь: ${data.user}`); // Отображение сообщения

        // Добавляем пользователя в список контактов (если его там нет)
        addConversationToList(data.user);

        openPrivateChat(data.user); // Открытие личного чата
    } catch (error) {
        alert(`Ошибка поиска: ${error.message}`); // Отображение сообщения об ошибке
    }
});

// Функция для добавления контакта в список (если его там нет)
function addConversationToList(recipient) {
    const listItems = conversationsList.querySelectorAll('li');
    let exists = false;
    listItems.forEach(item => {
        if (item.textContent.startsWith(recipient)) {
            exists = true; // Проверяем, существует ли контакт уже в списке
        }
    });

    if (!exists) {
        const listItem = document.createElement('li');
        listItem.textContent = recipient;
        listItem.style.cursor = 'pointer';
        listItem.style.padding = '5px';
        listItem.addEventListener('click', () => openPrivateChat(recipient));

        // Добавляем значок удаления
        const deleteIcon = document.createElement('span');
        deleteIcon.innerHTML = '&times;'; // Значок крестика
        deleteIcon.style.marginLeft = '5px';
        deleteIcon.style.color = 'gray';
        deleteIcon.style.cursor = 'pointer';
        deleteIcon.addEventListener('click', (event) => {
            event.stopPropagation(); // Предотвращаем открытие чата при клике на значок удаления
            deleteConversation(recipient); // Вызов функции удаления переписки
        });
        listItem.appendChild(deleteIcon);

        conversationsList.appendChild(listItem); // Добавляем элемент в список
    }
}

// Обработчик нажатия кнопки "Назад в общий чат"
backToPublicChatButton.addEventListener('click', () => {
    if (!username) return;

    currentRecipient = null; // Сброс текущего получателя
});

// Очистка истории публичного чата
clearMessagesButton.addEventListener('click', async () => {
    if (confirm('Вы уверены, что хотите очистить историю чата?')) {
        try {
            const response = await fetch('/clear-public-messages', { // Отправка запроса на сервер
                method: 'POST',
                credentials: 'include',
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText);
            }

            messagesContainer.innerHTML = ''; // Очистка контейнера сообщений
            displayedPublicMessages.clear(); // Очистка Set публичных сообщений

            alert('История чата успешно очищена'); // Отображение сообщения
        } catch (error) {
            console.error('Ошибка при очистке истории чата:', error);
            alert(`Ошибка при очистке истории чата: ${error.message}`); // Отображение сообщения об ошибке
        }
    }
});

// Очистка истории личного чата
if (clearPrivateMessagesButton) {
    clearPrivateMessagesButton.addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите очистить историю личного чата?')) {
            messagesContainer.innerHTML = ''; // Очистка контейнера сообщений
            displayedPrivateMessages.clear(); // Очистка Map личных сообщений
        }
    });
}

// При загрузке страницы открываем общий чат по умолчанию
window.onload = () => {
    if (chatContainer.style.display === 'block') {
        openChat('public'); // Открытие общего чата
    }
};