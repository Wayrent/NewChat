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
const io = socketIo(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

// Middleware для CORS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Настройка сессий
const sessionMiddleware = session({
    store: new ConnectPgSimple({ pool, tableName: 'sessions' }),
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000  // 24 hours
    }
});

// Применяем middleware сессий к Express
app.use(sessionMiddleware);

// Настройка Express для обслуживания статических файлов
app.use(express.static('public'));

// Функция для получения публичных сообщений
async function getPublicMessages() {
    const result = await pool.query('SELECT * FROM messages ORDER BY created_at ASC');
    return result.rows.map(row => ({
        id: row.id,
        username: row.user_id,
        text: row.text,
        createdAt: row.created_at.toISOString()
    }));
}

// Функция для получения личных сообщений
async function getPrivateMessages(user1, user2) {
    const result = await pool.query(`
        SELECT * FROM private_messages
        WHERE (sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1)
        ORDER BY created_at ASC
    `, [user1, user2]);
    return result.rows.map(row => ({
        id: row.id,
        sender: row.sender,
        recipient: row.recipient,
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
        req.session.save(err => {
            if (err) {
                console.error("Ошибка сохранения сессии:", err);
                return res.status(500).send('Ошибка сервера при сохранении сессии');
            }
            res.send('Вход выполнен успешно');
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// Выход из системы
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Ошибка сервера');
        }
        res.send('Выход выполнен успешно');
    });
});

// Поиск пользователя
app.post('/search-user', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).send('Никнейм должен быть указан');
    }

    try {
        const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (user.rows.length === 0) {
            return res.status(404).send('Пользователь не найден');
        }

        console.log(`Пользователь ${username} найден`);
        res.json({ user: user.rows[0].username });
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// Получение списка собеседников
app.get('/get-conversations', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('Неавторизованный пользователь');
    }

    const currentUser = req.session.user.username;

    try {
        const result = await pool.query(`
            SELECT DISTINCT recipient AS username
            FROM private_messages
            WHERE sender = $1
            UNION
            SELECT DISTINCT sender AS username
            FROM private_messages
            WHERE recipient = $1
        `, [currentUser]);

        console.log(`Список собеседников для пользователя ${currentUser}:`, result.rows.map(row => row.username));
        res.json(result.rows.map(row => row.username));
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// Получение истории личных сообщений
app.post('/get-private-messages', async (req, res) => {
    const { sender, recipient } = req.body;

    if (!sender || !recipient) {
        return res.status(400).send('Отправитель и получатель должны быть указаны');
    }

    try {
        const result = await pool.query(`
            SELECT * FROM private_messages
            WHERE (sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1)
            ORDER BY created_at ASC
        `, [sender, recipient]);

        console.log(`Запрошена история личных сообщений между ${sender} и ${recipient}:`, result.rows);
        res.json({ messages: result.rows.map(row => ({
            id: row.id,
            sender: row.sender,
            recipient: row.recipient,
            text: row.text,
            createdAt: row.created_at.toISOString()
        })) });
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// Middleware для восстановления сессии по cookie
io.use((socket, next) => {
    const handshakeData = socket.handshake;

    if (handshakeData.headers.cookie) {
        cookieParser()(handshakeData, null, () => {
            sessionMiddleware(handshakeData, {}, () => {
                if (handshakeData.session && handshakeData.session.user) {
                    socket.request.session = handshakeData.session;
                    socket.username = handshakeData.session.user.username;
                    return next();
                } else {
                    console.log('Сессия не найдена или пользователь не авторизован.');
                    return next(new Error('Неавторизованный'));
                }
            });
        });
    } else {
        console.log('Cookies отсутствуют.');
        return next(new Error('Cookies отсутствуют.'));
    }
});

// Обработка подключения клиентов
io.on('connection', async (socket) => {
    const username = socket.username;

    console.log(`Пользователь ${username} подключился к чату через WebSocket`);

    // Рассылка публичных сообщений
    const publicMessages = await getPublicMessages();
    socket.emit('previousMessages', publicMessages);

    socket.broadcast.emit('userJoined', { username, message: `${username} присоединился к чату` });

    // Обработка отправки публичных сообщений
    socket.on('sendMessage', async (data) => {
        const message = { username: username, text: data };

        if (!message.username) {
            console.error('Имя пользователя отсутствует при отправке публичного сообщения');
            return;
        }

        const result = await pool.query('INSERT INTO messages (user_id, text) VALUES ($1, $2) RETURNING id, created_at', [message.username, message.text]);
        const messageId = result.rows[0].id;
        const createdAt = result.rows[0].created_at.toISOString();

        console.log(`Пользователь ${username} отправил публичное сообщение: "${data}"`);
        io.emit('receiveMessage', { id: messageId, username: message.username, text: message.text, createdAt });
    });

    // Обработка отправки личных сообщений
    socket.on('sendPrivateMessage', async ({ recipient, text }) => {
        const sender = username;

        if (!sender || !recipient || !text) {
            console.error('Некорректные данные для личного сообщения:', { sender, recipient, text });
            return;
        }

        const result = await pool.query('INSERT INTO private_messages (sender, recipient, text) VALUES ($1, $2, $3) RETURNING id, created_at', [sender, recipient, text]);
        const messageId = result.rows[0].id;
        const createdAt = result.rows[0].created_at.toISOString();

        console.log(`Пользователь ${sender} отправил личное сообщение пользователю ${recipient}: "${text}"`);
        io.emit('receivePrivateMessage', { id: messageId, sender, recipient, text, createdAt });
    });

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