let socket = null;

const registerContainer = document.getElementById('register-container');
const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const messagesContainer = document.getElementById('messages');
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const logoutButton = document.getElementById('logout-button');

registerContainer.style.display = 'none';
loginContainer.style.display = 'flex';
chatContainer.style.display = 'none';

const displayedMessages = new Set();
let lastReceivedTimestamp = null;

async function checkAuth() {
    try {
        const response = await fetch('/check-auth', { credentials: 'include' });
        const data = await response.json();

        if (data.authenticated) {
            loginContainer.style.display = 'none';
            registerContainer.style.display = 'none';
            chatContainer.style.display = 'block';

            if (!socket) {
                socket = io({ withCredentials: true });
                setupSocketListeners(socket);
            }

            socket.emit('setUsername', data.username);
        } else {
            loginContainer.style.display = 'flex';
            registerContainer.style.display = 'none';
            chatContainer.style.display = 'none';
        }
    } catch (error) {
        loginContainer.style.display = 'flex';
        registerContainer.style.display = 'none';
        chatContainer.style.display = 'none';
    }
}

checkAuth();

function addMessage(message) {
    if (displayedMessages.has(message.id)) return;

    displayedMessages.add(message.id);
    lastReceivedTimestamp = new Date(message.createdAt).getTime();

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

function setupSocketListeners(socket) {
    socket.on('previousMessages', (messages) => {
        displayedMessages.clear();
        messages.forEach(addMessage);

        if (messages.length > 0) {
            lastReceivedTimestamp = new Date(messages[messages.length - 1].createdAt).getTime();
        } else {
            lastReceivedTimestamp = null;
        }
    });

    socket.on('receiveMessage', (message) => {
        const messageTimestamp = new Date(message.createdAt).getTime();
        if (lastReceivedTimestamp === null || messageTimestamp > lastReceivedTimestamp) {
            addMessage(message);
        }
    });

    socket.on('userJoined', (data) => addSystemMessage(data.message));
    socket.on('userLeft', (data) => addSystemMessage(data.message));
}

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

    displayedMessages.clear();
    lastReceivedTimestamp = null;

    loginContainer.style.display = 'flex';
    registerContainer.style.display = 'none';
    chatContainer.style.display = 'none';
});

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message !== '') {
        socket.emit('sendMessage', message);
        messageInput.value = '';
    }
});