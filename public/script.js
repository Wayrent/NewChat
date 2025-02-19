let socket = null;
const displayedPublicMessages = new Set();
const displayedPrivateMessages = new Map(); // Map для хранения множества по каждому собеседнику
let lastReceivedPublicTimestamp = null;
let currentRecipient = null;
let conversationsLoaded = false;
let username = null;

// Получаем элементы DOM
const registerContainer = document.getElementById('register-container');
const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const privateChatContainer = document.getElementById('private-chat-container');
const searchContainer = document.getElementById('search-container');
const messagesContainer = document.getElementById('messages');
const privateMessagesContainer = document.getElementById('private-messages');
const conversationsListContainer = document.getElementById('conversations-list');
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const messageForm = document.getElementById('message-form');
const privateMessageForm = document.getElementById('private-message-form');
const messageInput = document.getElementById('message-input');
const privateMessageInput = document.getElementById('private-message-input');
const logoutButton = document.getElementById('logout-button');
const backToPublicChatButton = document.getElementById('back-to-public-chat');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const recipientNameElement = document.getElementById('recipient-name');
const conversationsList = document.getElementById('conversations');

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
                socket = io({ withCredentials: true });
                setupSocketListeners(socket);
            }

            //  socket.emit('setUsername', data.username); // Больше не нужно
            setTimeout(() => loadConversations(), 500); // Загружаем список собеседников после установки сокета
        } else {
            loginContainer.style.display = 'flex';
            registerContainer.style.display = 'none';
            chatContainer.style.display = 'none';
            privateChatContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка при проверке авторизации:', error);
        loginContainer.style.display = 'flex';
        registerContainer.style.display = 'none';
        chatContainer.style.display = 'none';
        privateChatContainer.style.display = 'none';
    }
}

checkAuth();

function setupSocketListeners(socket) {
    socket.on('connect', () => {
        console.log('WebSocket connected');
    });

    socket.on('previousMessages', (messages) => {
        console.log('Получены старые публичные сообщения:', messages);
        displayedPublicMessages.clear();
        messages.forEach(addPublicMessage);

        if (messages.length > 0) {
            lastReceivedPublicTimestamp = new Date(messages[messages.length - 1].createdAt).getTime();
        } else {
            lastReceivedPublicTimestamp = null;
        }
    });

    socket.on('receiveMessage', (message) => {
        console.log('Получено новое публичное сообщение:', message);
        const messageTimestamp = new Date(message.createdAt).getTime();
        if (lastReceivedPublicTimestamp === null || messageTimestamp > lastReceivedPublicTimestamp) {
            addPublicMessage(message);
        }
    });

    socket.on('receivePrivateMessage', (message) => {
        console.log('Получено новое личное сообщение:', message);
        // Измененная логика проверки:
        if (currentRecipient && (currentRecipient === message.sender || currentRecipient === message.recipient)) {
            addPrivateMessage(message);
        }
    });

    socket.on('userJoined', (data) => addSystemMessage(data.message));
    socket.on('userLeft', (data) => addSystemMessage(data.message));
}

function addPublicMessage(message) {
    if (displayedPublicMessages.has(message.id)) return;

    displayedPublicMessages.add(message.id);
    lastReceivedPublicTimestamp = new Date(message.createdAt).getTime();

    const messageElement = document.createElement('div');
    messageElement.textContent = `${message.username}: ${message.text}`;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.style.color = 'gray';
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addPrivateMessage(message) {
    if (!displayedPrivateMessages.has(message.recipient)) {
        displayedPrivateMessages.set(message.recipient, new Set());
    }

    const recipientSet = displayedPrivateMessages.get(message.recipient);
    if (recipientSet.has(message.id)) return;

    recipientSet.add(message.id);

    const messageElement = document.createElement('div');
    messageElement.textContent = `${message.sender}: ${message.text}`;
    privateMessagesContainer.appendChild(messageElement);
    privateMessagesContainer.scrollTop = privateMessagesContainer.scrollHeight;
}

document.getElementById('switch-to-login').addEventListener('click', () => {
    registerContainer.style.display = 'none';
    loginContainer.style.display = 'flex';
    chatContainer.style.display = 'none';
    privateChatContainer.style.display = 'none';
});

document.getElementById('switch-to-register').addEventListener('click', () => {
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'flex';
    chatContainer.style.display = 'none';
    privateChatContainer.style.display = 'none';
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();

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
            privateChatContainer.style.display = 'none';
        }
    } catch (error) {
        alert(`Ошибка регистрации: ${error.message}`);
    }
});

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
            setTimeout(() => location.reload(), 500); // Перезагрузка страницы после входа
        }
    } catch (error) {
        alert(`Ошибка входа: ${error.message}`);
    }
});

logoutButton.addEventListener('click', async () => {
    const response = await fetch('/logout', { method: 'POST', credentials: 'include' });
    const result = await response.text();
    alert(result);

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    displayedPublicMessages.clear();
    displayedPrivateMessages.clear();
    currentRecipient = null;
    conversationsLoaded = false;

    loginContainer.style.display = 'flex';
    registerContainer.style.display = 'none';
    chatContainer.style.display = 'none';
    privateChatContainer.style.display = 'none';
});

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message !== '') {
        if (!socket || !username) { // Используем username, установленный при аутентификации
            alert('Вы не авторизованы');
            return;
        }
        socket.emit('sendMessage', message);
        messageInput.value = '';
    }
});

privateMessageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = privateMessageInput.value.trim();

    if (message !== '' && currentRecipient && socket && username) { // Используем username
        socket.emit('sendPrivateMessage', { recipient: currentRecipient, text: message });
        privateMessageInput.value = '';
    } else {
        alert('Собеседник не выбран или вы не авторизованы');
    }
});

async function loadConversations() {
    if (conversationsLoaded || !username) return; // Используем username

    try {
        const response = await fetch('/get-conversations', { credentials: 'include' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const data = await response.json();
        conversationsList.innerHTML = '';

        data.forEach((username) => {
            const listItem = document.createElement('li');
            listItem.textContent = username;
            listItem.style.cursor = 'pointer';
            listItem.style.padding = '5px';
            listItem.addEventListener('click', () => openPrivateChat(username));
            conversationsList.appendChild(listItem);
        });

        conversationsListContainer.style.display = 'block';
        conversationsLoaded = true;
    } catch (error) {
        console.error('Ошибка при загрузке списка собеседников:', error);
    }
}

function openPrivateChat(recipient) {
    if (!username) { // Используем username
        alert('Вы не авторизованы');
        return;
    }

    currentRecipient = recipient;
    chatContainer.style.display = 'none';
    privateChatContainer.style.display = 'block';
    recipientNameElement.textContent = `Собеседник: ${recipient}`;

    fetchPrivateMessages(username, recipient).then((messages) => { // Используем username
        privateMessagesContainer.innerHTML = '';
        messages.forEach(addPrivateMessage);
    });
}

async function fetchPrivateMessages(sender, recipient) {
    if (!sender || !recipient) {
        console.error('Отправитель или получатель не указаны');
        return [];
    }

    try {
        const response = await fetch('/get-private-messages', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender, recipient })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const data = await response.json();
        console.log(`Загружена история личных сообщений между ${sender} и ${recipient}:`, data.messages);
        return data.messages;
    } catch (error) {
        console.error('Ошибка при получении личных сообщений:', error);
        return [];
    }
}

searchInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const username = searchInput.value.trim();
        if (!username) return;

        try {
            const response = await fetch('/search-user', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText);
            }

            const data = await response.json();
            console.log(`Найден пользователь: ${data.user}`);
            alert(`Найден пользователь: ${data.user}`);
            openPrivateChat(data.user);
        } catch (error) {
            alert(`Ошибка поиска: ${error.message}`);
        }
    }
});

searchButton.addEventListener('click', async () => {
    const username = searchInput.value.trim();
    if (!username) return;

    try {
        const response = await fetch('/search-user', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const data = await response.json();
        console.log(`Найден пользователь: ${data.user}`);
        alert(`Найден пользователь: ${data.user}`);
        openPrivateChat(data.user);
    } catch (error) {
        alert(`Ошибка поиска: ${error.message}`);
    }
});

backToPublicChatButton.addEventListener('click', () => {
    if (!username) return;

    privateChatContainer.style.display = 'none';
    chatContainer.style.display = 'block';
    currentRecipient = null;
    privateMessagesContainer.innerHTML = ''; // Очищаем контейнер личных сообщений
});