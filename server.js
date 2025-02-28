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

// Middleware
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
        maxAge: 24 * 60 * 60 * 1000
    }
});

app.use(sessionMiddleware);
app.use(express.static('public'));

// Функции для запросов в БД
async function getPublicMessages() {
    try {
        const query = `
            SELECT messages.id, messages.text, messages.created_at, users.username
            FROM messages
            LEFT JOIN users ON messages.user_id = users.id
            ORDER BY created_at ASC
        `;
        console.log("SQL запрос getPublicMessages:", query);
        const result = await pool.query(query);
        console.log("Результат запроса getPublicMessages:", result.rows);

        const messages = result.rows.map(row => {
            const createdAt = row.created_at ? new Date(row.created_at).toISOString() : null;
            return {
                id: row.id,
                username: row.username,
                text: row.text,
                createdAt: createdAt
            };
        });

        return messages;
    } catch (error) {
        console.error('Ошибка при получении публичных сообщений:', error);
        return [];
    }
}

async function getPrivateMessages(user1, user2) {
    try {
        const query = `
            SELECT * FROM private_messages
            WHERE (sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1)
            ORDER BY created_at ASC
        `;

        console.log("SQL запрос getPrivateMessages:", query, user1, user2);
        const result = await pool.query(query, [user1, user2]);
        console.log("Результат запроса getPrivateMessages:", result.rows);

        return result.rows.map(row => ({
            id: row.id,
            sender: row.sender,
            recipient: row.recipient,
            text: row.text,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
        }));
    } catch (error) {
        console.error('Ошибка при получении личных сообщений:', error);
        return [];
    }
}

async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// Маршруты
app.get('/check-auth', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, username: req.session.user.username });
    } else {
        res.json({ authenticated: false });
    }
});

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

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Ошибка сервера');
        }
        res.send('Выход выполнен успешно');
    });
});

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

        res.json({ user: user.rows[0].username });
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

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

        res.json(result.rows.map(row => row.username));
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

app.post('/get-private-messages', async (req, res) => {
    const { sender, recipient } = req.body;

    if (!sender || !recipient) {
        return res.status(400).send('Отправитель и получатель должны быть указаны');
    }

    try {
        const query = `
            SELECT * FROM private_messages
            WHERE (sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1)
            ORDER BY created_at ASC
        `;
        console.log("SQL запрос getPrivateMessages:", query, sender, recipient);
        const result = await pool.query(query, [sender, recipient]);
        console.log("Результат запроса getPrivateMessages:", result.rows);
        return res.json({ messages: result.rows.map(row => ({
            id: row.id,
            sender: row.sender,
            recipient: row.recipient,
            text: row.text,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
        })) });
    } catch (err) {
        console.error('Ошибка при получении личных сообщений:', err);
        return res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/get-public-messages', async (req, res) => {
    try {
        const query = `
            SELECT messages.id, messages.text, messages.created_at, users.username
            FROM messages
            LEFT JOIN users ON messages.user_id = users.id
            ORDER BY created_at ASC
        `;
        console.log("SQL запрос getPublicMessages:", query);
        const result = await pool.query(query);
        console.log("Результат запроса getPublicMessages:", result.rows);
        const messages = result.rows.map(row => {
            const createdAt = row.created_at ? new Date(row.created_at).toISOString() : null;
            return {
                id: row.id,
                username: row.username,
                text: row.text,
                createdAt: createdAt
            };
        });
        return res.json({ messages: messages });
    } catch (err) {
        console.error('Ошибка при получении публичных сообщений:', err);
        return res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/clear-public-messages', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('Неавторизованный пользователь');
    }

    try {
        await pool.query('DELETE FROM messages');
        res.send('История публичных сообщений успешно очищена');
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера при очистке истории сообщений');
    }
});

// Удаление переписки с пользователем
app.post('/delete-conversation', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('Неавторизованный пользователь');
    }

    const currentUser = req.session.user.username;
    const recipient = req.body.recipient;

    if (!recipient) {
        return res.status(400).send('Получатель должен быть указан');
    }

    try {
        // Удаляем все сообщения между текущим пользователем и выбранным собеседником
        await pool.query(`
            DELETE FROM private_messages
            WHERE (sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1)
        `, [currentUser, recipient]);

        console.log(`Удалена переписка между ${currentUser} и ${recipient}`);
        res.send('Переписка успешно удалена');
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера при удалении переписки');
    }
});

// WebSocket обработчики
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
        return next(new Error('Неавторизованный'));
    }
});

io.on('connection', async (socket) => {
    const username = socket.username;
    const userId = socket.request.session.user.id;

    console.log(`Пользователь ${username} (ID: ${userId}) подключился к чату через WebSocket`);

    const publicMessages = await getPublicMessages();
    socket.emit('previousMessages', publicMessages); // Исправлено

    socket.broadcast.emit('userJoined', { username, message: `${username} присоединился к чату` });

    socket.on('sendMessage', async (data) => {
        const message = { username: username, text: data };

        if (!message.username) {
            console.error('Имя пользователя отсутствует при отправке публичного сообщения');
            return;
        }

        try {
            const result = await pool.query(
                'INSERT INTO messages (user_id, text) VALUES ($1, $2) RETURNING id, created_at',
                [userId, message.text]
            );

            if (result.rows.length > 0) {
                const messageId = result.rows[0].id;
                const createdAt = result.rows[0].created_at.toISOString();

                io.emit('receiveMessage', { id: messageId, username: username, text: data, createdAt });
            } else {
                console.error('Сообщение не было добавлено в базу данных');
            }
        } catch (error) {
            console.error('Ошибка при добавлении публичного сообщения:', error);
        }
    });

    socket.on('sendPrivateMessage', async ({ recipient, text }) => {
        const sender = socket.username;

        if (!sender || !recipient || !text) {
            console.error('Некорректные данные для личного сообщения:', { sender, recipient, text });
            return;
        }

        try {
            const result = await pool.query(
                'INSERT INTO private_messages (sender, recipient, text) VALUES ($1, $2, $3) RETURNING id, created_at',
                [sender, recipient, text]
            );

            if (result.rows.length > 0) {
                const messageId = result.rows[0].id;
                const createdAt = result.rows[0].created_at.toISOString();

                io.emit('receivePrivateMessage', { id: messageId, sender: sender, recipient, text, createdAt });
            } else {
                console.error('Сообщение не было добавлено в базу данных');
            }
        } catch (error) {
            console.error('Ошибка при добавлении личного сообщения:', error);
        }
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