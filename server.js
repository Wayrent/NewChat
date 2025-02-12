const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const session = require('express-session');
const ConnectPgSimple = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Настройка сессий
const sessionMiddleware = session({
    store: new ConnectPgSimple({
        pool: pool,
        tableName: 'sessions'
    }),
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
});

// Применяем middleware сессий к Express
app.use(sessionMiddleware);

// Настройка Express для обслуживания статических файлов
app.use(express.static('public'));

// Функция для получения всех сообщений из базы данных
async function getMessages() {
    const result = await pool.query('SELECT * FROM messages ORDER BY created_at ASC');
    return result.rows.map(row => ({
        id: row.id,
        username: row.user_id,
        text: row.text,
        createdAt: row.created_at.toISOString()
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
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('Имя пользователя и пароль должны быть указаны');
    }

    try {
        const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (existingUser.rows.length > 0) {
            return res.status(400).send('Пользователь с таким именем уже существует');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
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

    if (!username || !password) {
        return res.status(400).send('Имя пользователя и пароль должны быть указаны');
    }

    try {
        const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (user.rows.length === 0) {
            return res.status(400).send('Неверное имя пользователя или пароль');
        }

        const isPasswordValid = await verifyPassword(password, user.rows[0].password_hash);
        if (!isPasswordValid) {
            return res.status(400).send('Неверное имя пользователя или пароль');
        }

        req.session.user = { id: user.rows[0].id, username: user.rows[0].username };
        req.session.save();

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

    const cookies = cookieParser.signedCookies(cookieHeader, sessionMiddleware.secret);
    sessionMiddleware(handshakeData, {}, (err) => {
        if (err || !handshakeData.session || !handshakeData.session.user) {
            return next(new Error('User not authenticated'));
        }
        next();
    });
});

// Обработка подключения клиентов
io.on('connection', async (socket) => {
    const session = socket.handshake.session;
    if (!session || !session.user) {
        return socket.disconnect(true);
    }

    const username = session.user.username;
    socket.username = username;

    const messages = await getMessages();
    socket.emit('previousMessages', messages);

    socket.broadcast.emit('userJoined', { username, message: `${username} присоединился к чату` });

    socket.on('sendMessage', async (data) => {
        const message = { username: socket.username, text: data };

        const result = await pool.query('INSERT INTO messages (user_id, text) VALUES ($1, $2) RETURNING id, created_at', [message.username, message.text]);
        const messageId = result.rows[0].id;
        const createdAt = result.rows[0].created_at.toISOString();

        io.emit('receiveMessage', { id: messageId, username: message.username, text: message.text, createdAt });
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            io.emit('userLeft', { username: socket.username, message: `${socket.username} покинул чат` });
        }
    });
});

// Запуск сервера
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});