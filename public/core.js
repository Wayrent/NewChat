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
    DOM.registerContainer.style.display = 'none';
    DOM.loginContainer.style.display = 'none';
    DOM.chatContainer.style.display = 'none';
    DOM.privateChatContainer.style.display = 'none';

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
        case 'privateChat':
            DOM.privateChatContainer.style.display = 'block';
            break;
    }
}

// Функция для проверки авторизации
async function checkAuth() {
    try {
        const response = await fetch('/check-auth', { credentials: 'include' });
        const data = await response.json();

        if (data.authenticated) {
            username = data.username;
            initChat();
            showPage('chat');
        } else {
            showPage('login');
        }
    } catch (error) {
        console.error('Ошибка при проверке авторизации:', error);
        showPage('login');
    }
}

// Функция для инициализации чата
function initChat() {
    if (!socket) {
        socket = io({ withCredentials: true });

        socket.on('connect', () => {
            console.log('WebSocket connected');
        });

        socket.on('previousMessages', (messages) => {
            displayedPublicMessages.clear();
            messages.forEach(message => addPublicMessage(message));
        });

        socket.on('receiveMessage', (message) => {
            addPublicMessage(message);
        });

        socket.on('receivePrivateMessage', (message) => {
            if (currentRecipient && (currentRecipient === message.sender || currentRecipient === message.recipient)) {
                addPrivateMessage(message);
            }
        });

        socket.on('userJoined', (data) => addSystemMessage(data.message));
        socket.on('userLeft', (data) => addSystemMessage(data.message));
    }
    loadConversations();
}

// ===========================================================================
// Функции для работы с сообщениями (можно переместить в handlers.js при необходимости)
// ===========================================================================

function addPublicMessage(message) {
    if (displayedPublicMessages.has(message.id)) return;

    displayedPublicMessages.add(message.id);

    const messageElement = document.createElement('div');
    messageElement.textContent = `${message.username}: ${message.text}`;
    DOM.messagesContainer.appendChild(messageElement);
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.style.color = 'gray';
    DOM.messagesContainer.appendChild(messageElement);
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
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
    DOM.privateMessages.appendChild(messageElement);
    DOM.privateMessages.scrollTop = DOM.privateMessages.scrollHeight;
}

// ===========================================================================
// Функции для работы с чатами (можно переместить в handlers.js при необходимости)
// ===========================================================================

async function loadConversations() {
    if (conversationsLoaded || !username) return;

    try {
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
    currentChatType = chatType;
    currentRecipient = null;

    DOM.messagesContainer.innerHTML = '';

    showPage('chat');
}

function openPrivateChat(recipient) {
    currentChatType = 'private';
    currentRecipient = recipient;

    DOM.privateMessages.innerHTML = '';
    DOM.recipientName.textContent = `Собеседник: ${recipient}`;

    showPage('privateChat');
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
    openPrivateChat,
    addPublicMessage,
    addSystemMessage,
    addPrivateMessage
};