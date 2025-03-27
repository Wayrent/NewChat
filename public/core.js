// core.js

import * as DOM from './dom.js';
import * as Handlers from './handlers.js';

let username = null;
let socket = null;
let currentRecipient = null;
let currentChatType = 'public';
let displayedPublicMessages = new Set();
let displayedPrivateMessages = new Map();
let conversationsLoaded = false;

// Функция для отображения страницы
function showPage(page) {
    console.log('[showPage] Вызвана с page:', page);
    DOM.registerContainer.style.display = 'none';
    DOM.loginContainer.style.display = 'none';
    DOM.chatContainer.style.display = 'none';

    switch (page) {
        case 'register':
            DOM.registerContainer.style.display = 'flex';
            break;
        case 'login':
            DOM.loginContainer.style.display = 'flex';
            break;
        case 'chat':
            DOM.chatContainer.style.display = 'block';
            break;
    }
}

// Функция для проверки авторизации
async function checkAuth() {
    console.log('[checkAuth] Вызвана');
    try {
        const response = await fetch('/check-auth', { credentials: 'include' });
        const data = await response.json();

        if (data.authenticated) {
            console.log('[checkAuth] Пользователь авторизован, username:', data.username);
            username = data.username;
            initChat();
            showPage('chat');
        } else {
            console.log('[checkAuth] Пользователь не авторизован');
            showPage('login');
        }
    } catch (error) {
        console.error('[checkAuth] Ошибка:', error);
        showPage('login');
    }
}

// Функция для инициализации чата
function initChat() {
    console.log('[initChat] Вызвана');
    if (!socket) {
        console.log('[initChat] Создаем новый сокет');
        socket = io({ withCredentials: true });

        socket.on('connect', () => {
            console.log('[socket.on:connect] WebSocket connected');
        });

        socket.on('previousMessages', (messages) => {
            console.log('[socket.on:previousMessages] Получено сообщений:', messages);
            displayedPublicMessages.clear();
            messages.forEach(message => addPublicMessage(message));
        });

        socket.on('receiveMessage', (message) => {
            console.log('[socket.on:receiveMessage] Получено сообщение:', message);
            addPublicMessage(message);
        });

        socket.on('receivePrivateMessage', (message) => {
            console.log('[socket.on:receivePrivateMessage] Получено личное сообщение:', message);
            if (currentRecipient && (currentRecipient === message.sender || currentRecipient === message.recipient)) {
                console.log('[socket.on:receivePrivateMessage] Отображаем личное сообщение');
                addPrivateMessage(message);
            }
        });

        socket.on('userJoined', (data) => addSystemMessage(data.message));
        socket.on('userLeft', (data) => addSystemMessage(data.message));
    }
    loadConversations();
}

// ===========================================================================
// Функции для работы с сообщениями
// ===========================================================================

function addPublicMessage(message) {
    console.log('[addPublicMessage] Добавляем публичное сообщение:', message);
    if (displayedPublicMessages.has(message.id)) {
        console.log('[addPublicMessage] Сообщение уже отображено, пропускаем');
        return;
    }

    displayedPublicMessages.add(message.id);

    const messageElement = document.createElement('div');
    messageElement.textContent = `${message.username}: ${message.text}`;
    DOM.messagesContainer.appendChild(messageElement);
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

function addSystemMessage(message) {
    console.log('[addSystemMessage] Добавляем системное сообщение:', message);
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.style.color = 'gray';
    DOM.messagesContainer.appendChildmessageElement;
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

function addPrivateMessage(message) {
    console.log('[addPrivateMessage] Добавляем личное сообщение:', message);
    if (!displayedPrivateMessages.has(message.recipient)) {
        console.log('[addPrivateMessage] Создаем новый Set для получателя:', message.recipient);
        displayedPrivateMessages.set(message.recipient, new Set());
    }

    const recipientSet = displayedPrivateMessages.get(message.recipient);
    console.log('[addPrivateMessage] Получаем Set для получателя:', message.recipient, 'Set:', recipientSet);
    if (recipientSet.has(message.id)) {
        console.log('[addPrivateMessage] Сообщение уже отображено, пропускаем');
        return;
    }

    recipientSet.add(message.id);

    const messageElement = document.createElement('div');
    messageElement.textContent = `${message.sender}: ${message.text}`;
    DOM.messagesContainer.appendChild(messageElement);
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

// ===========================================================================
// Функции для работы с чатами
// ===========================================================================

async function loadConversations() {
    console.log('[loadConversations] Вызвана');
    if (conversationsLoaded || !username) {
        console.log('[loadConversations] Условия не выполнены, выходим');
        return;
    }

    try {
        console.log('[loadConversations] Запрашиваем список собеседников');
        const response = await fetch('/get-conversations', { credentials: 'include' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const data = await response.json();

        DOM.conversationsList.innerHTML = '';

        const publicChatItem = document.createElement('li');
        publicChatItem.textContent = 'Общий чат';
        publicChatItem.dataset.recipient = 'public';
        publicChatItem.addEventListener('click', () => openChat('public'));
        DOM.conversationsList.appendChild(publicChatItem);

        data.forEach((user) => {
            const listItem = document.createElement('li');
            listItem.textContent = user;
            listItem.addEventListener('click', () => openPrivateChat(user));
            DOM.conversationsList.appendChild(listItem);
        });

        conversationsLoaded = true;
    } catch (error) {
        console.error('Ошибка при загрузке списка собеседников:', error);
    }
}

function openChat(chatType) {
    console.log('[openChat] Вызвана с chatType:', chatType);
    currentChatType = chatType;
    currentRecipient = null;

    DOM.messagesContainer.innerHTML = '';
    // Очищаем displayedPrivateMessages
    displayedPrivateMessages.clear(); //  <--- ОЧИСТКА

    // Загружаем публичные сообщения
    console.log('[openChat] Запрашиваем предыдущие публичные сообщения');
    socket.emit('requestPublicMessages'); //  <--- ОТПРАВЛЯЕМ СОБЫТИЕ  <----- ADDED
    socket.emit('getPreviousMessages');
    showPage('chat');
}

async function openPrivateChat(recipient) {
    console.log('[openPrivateChat] Вызвана с recipient:', recipient);
    currentChatType = 'private';
    currentRecipient = recipient;

    DOM.messagesContainer.innerHTML = '';
    displayedPrivateMessages.clear();  //  <--- ОЧИСТКА ПРИ ПЕРЕКЛЮЧЕНИИ ЛИЧНЫХ ЧАТОВ

    // Загружаем личные сообщения
    await fetchPrivateMessages(username, recipient);
}

async function fetchPrivateMessages(sender, recipient) {
    console.log('[fetchPrivateMessages] Вызвана с sender:', sender, 'recipient:', recipient);
    try {
        const response = await fetch('/get-private-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender, recipient }),
            credentials: 'include'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const data = await response.json();
        // Отображаем личные сообщения
        DOM.messagesContainer.innerHTML = ''; // Очищаем контейнер
        data.messages.forEach(message => addPrivateMessage(message));

    } catch (error) {
        console.error('Ошибка при загрузке личных сообщений:', error);
    }
}

// ===========================================================================
// Экспорты
// ===========================================================================

export {
    checkAuth,
    showPage,
    initChat,
    username,
    socket,
    currentRecipient,
    currentChatType,
    displayedPublicMessages,
    displayedPrivateMessages,
    conversationsLoaded,
    loadConversations,
    openChat,
    openPrivateChat
};