const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const session = require('express-session');
const ConnectPgSimple = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Настройка подключения к PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'chat_db',
    password: 'root',
    port: 5432
});

// Инициализация Express приложения
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware для CORS
app.use(cors({
    credentials: true, // Разрешаем передачу cookies
    origin: 'http://localhost:3000' // Укажите ваш домен
}));

// Middleware для обработки JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware для обработки cookies
app.use(cookieParser());

// Настройка сессий
const sessionMiddleware = session({
    store: new ConnectPgSimple({
        pool: pool, // Используем существующий пул соединений
        tableName: 'sessions' // Название таблицы для хранения сессий
    }),
    secret: 'your_secret_key', // Секретный ключ для подписи сессии
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Отключаем HTTPS для локального тестирования
});

// Применяем middleware сессий к Express
app.use(sessionMiddleware);

// Настройка Express для обслуживания статических файлов
app.use(express.static('public'));

// Функция для получения всех сообщений из базы данных
async function getMessages() {
    const result = await pool.query('SELECT * FROM messages ORDER BY created_at ASC');
    return result.rows.map(row => ({
        id: row.id, // Уникальный ID сообщения
        username: row.user_id,
        text: row.text,
        createdAt: row.created_at.toISOString() // Временная метка в формате ISO
    }));
}

// Функция для проверки пароля
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// Проверка авторизации пользователя
app.get('/check-auth', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, username: req.session.user.username });
    } else {
        res.json({ authenticated: false });
    }
});

// Регистрация пользователя
app.post('/register', async (req, res) => {
    console.log('Полученные данные для регистрации:', req.body);

    const { username, password } = req.body;

    // Проверяем, что имя пользователя и пароль указаны
    if (!username || !password) {
        return res.status(400).send('Имя пользователя и пароль должны быть указаны');
    }

    try {
        // Проверяем, существует ли уже такой пользователь
        const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (existingUser.rows.length > 0) {
            return res.status(400).send('Пользователь с таким именем уже существует');
        }

        // Хешируем пароль
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создаём нового пользователя
        await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hashedPassword]);

        res.send('Регистрация успешно завершена');
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// Авторизация пользователя
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Проверяем, что имя пользователя и пароль указаны
    if (!username || !password) {
        return res.status(400).send('Имя пользователя и пароль должны быть указаны');
    }

    try {
        // Проверяем, существует ли пользователь
        const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (user.rows.length === 0) {
            return res.status(400).send('Неверное имя пользователя или пароль');
        }

        // Проверяем пароль
        const isPasswordValid = await verifyPassword(password, user.rows[0].password_hash);
        if (!isPasswordValid) {
            return res.status(400).send('Неверное имя пользователя или пароль');
        }

        // Сохраняем пользователя в сессии
        req.session.user = { id: user.rows[0].id, username: user.rows[0].username };
        req.session.save(); // Гарантируем сохранение сессии

        console.log(`Пользователь ${username} вошёл в систему`);
        res.send('Вход выполнен успешно');
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// Выход из учётной записи
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Ошибка сервера');
        }
        res.send('Выход выполнен успешно');
    });
});

// Middleware для восстановления сессии по cookie
io.use((socket, next) => {
    const handshakeData = socket.handshake;
    const cookieHeader = handshakeData.headers.cookie;

    if (!cookieHeader) {
        return next(new Error('No cookie provided'));
    }

    // Парсим cookie
    const cookies = cookieParser.signedCookies(cookieHeader, sessionMiddleware.secret);

    // Восстанавливаем сессию
    sessionMiddleware(handshakeData, {}, (err) => {
        if (err) {
            return next(new Error('Failed to restore session'));
        }

        // Проверяем, есть ли пользователь в сессии
        if (!handshakeData.session || !handshakeData.session.user) {
            return next(new Error('User not authenticated'));
        }

        next();
    });
});

// Обработка подключения клиентов
io.on('connection', async (socket) => {
    console.log('Пользователь подключился:', socket.id);

    // Получаем имя пользователя из сессии
    const session = socket.handshake.session;
    if (!session || !session.user) {
        console.warn('Пользователь не авторизован');
        return socket.disconnect(true); // Отключаем незарегистрированного пользователя
    }

    const username = session.user.username;

    if (!username) {
        console.error('Имя пользователя не найдено в сессии');
        return socket.disconnect(true);
    }

    // Устанавливаем имя пользователя для сокета
    socket.username = username;

    console.log(`Пользователь ${username} вошёл в чат`);

    // Логирование сессии
    console.log(`Сессия:`, session);
    console.log(`Имя пользователя: ${username}`);

    // Получаем все сообщения из базы данных и отправляем их клиенту
    const messages = await getMessages();
    socket.emit('previousMessages', messages); // Отправляем только новому клиенту

    // Уведомляем других пользователей о входе нового участника
    socket.broadcast.emit('userJoined', { username, message: `${username} присоединился к чату` });

    // Обработка новых сообщений от клиента
    socket.on('sendMessage', async (data) => {
        const message = { username: socket.username, text: data };

        if (!message.username) {
            console.error('Имя пользователя отсутствует при отправке сообщения');
            return;
        }

        console.log(`Сохраняем сообщение: ${message.username}: ${message.text}`); // Логируем сохраняемое сообщение

        // Сохраняем сообщение в базе данных
        const result = await pool.query('INSERT INTO messages (user_id, text) VALUES ($1, $2) RETURNING id, created_at', [message.username, message.text]);
        const messageId = result.rows[0].id; // Получаем ID сохранённого сообщения
        const createdAt = result.rows[0].created_at.toISOString(); // Временная метка

        // Рассылаем сообщение всем подключенным клиентам
        io.emit('receiveMessage', { id: messageId, username: message.username, text: message.text, createdAt });
        console.log('Рассылаем сообщение:', { id: messageId, username: message.username, text: message.text, createdAt }); // Логируем отправляемое сообщение
    });

    // Обработка отключения клиента
    socket.on('disconnect', () => {
        if (socket.username) {
            console.log(`Пользователь ${socket.username} покинул чат`);
            io.emit('userLeft', { username: socket.username, message: `${socket.username} покинул чат` });
        }
    });
});

// Запуск сервера
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});