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
    //DOM.privateChatContainer.style.display = 'none'; // УДАЛИТЕ ЭТУ СТРОКУ

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
        //case 'privateChat': // УДАЛИТЕ ЭТОТ CASE
        //    DOM.privateChatContainer.style.display = 'block';
        //    break;
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
// Функции для работы с сообщениями
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
    DOM.messagesContainer.appendChild(messageElement); //  Отображаем в основном контейнере
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

// ===========================================================================
// Функции для работы с чатами
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
    // Загружаем публичные сообщения
    socket.emit('getPreviousMessages');
    showPage('chat');
}

async function openPrivateChat(recipient) {
    currentChatType = 'private';
    currentRecipient = recipient;

    DOM.messagesContainer.innerHTML = '';
    //DOM.recipientName.textContent = `Собеседник: ${recipient}`; //  Удаляем, т.к. нет отд. окна

    //showPage('chat');
    // Загружаем личные сообщения
    await fetchPrivateMessages(username, recipient);
}

async function fetchPrivateMessages(sender, recipient) {
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