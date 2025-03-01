const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid'); // Import uuidv4
const { Store } = session; // Import Store from express-session

// Настройка подключения к PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'chat_db',
    password: 'root',
    port: 5432
});

// Класс для хранения сессий в PostgreSQL
class PGStore extends Store {
    constructor(options) {
        super(options);
        this.pool = options.pool; // Получаем пул подключений к базе данных
    }

    async get(sid, cb) {
        try {
            const result = await this.pool.query('SELECT user_id, expire FROM sessions WHERE sid = $1', [sid]);
            if (result.rows.length > 0) {
                // Создаем объект сессии, как того требует express-session
                const sessionData = {
                    userId: result.rows[0].user_id,
                    cookie: {
                        expires: result.rows[0].expire
                    }
                };
                cb(null, sessionData);
            } else {
                cb(null, null);
            }
        } catch (error) {
            console.error('Ошибка при получении сессии из базы данных:', error);
            cb(error);
        }
    }

    async set(sid, session, cb) {
        try {
            if (session && session.userId) {
                const expire = new Date(Date.now() + 24 * 60 * 60 * 1000);
                await this.pool.query(
                    'INSERT INTO sessions (sid, user_id, expire) VALUES ($1, $2, $3) ON CONFLICT (sid) DO UPDATE SET user_id = $2, expire = $3',
                    [sid, session.userId, expire]
                );
            }
            cb();
        } catch (error) {
            console.error('Ошибка при сохранении сессии в базу данных:', error);
            cb(error);
        }
    }

    async destroy(sid, cb) {
        try {
            await this.pool.query('DELETE FROM sessions WHERE sid = $1', [sid]);
            cb();
        } catch (error) {
            console.error('Ошибка при удалении сессии из базы данных:', error);
            cb(error);
        }
    }
}

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
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 часа
    },
    store: new PGStore({ // Создаем экземпляр класса PGStore
        pool: pool // Передаем пул подключений к базе данных
    }),
    genid: (req) => { // Генерация SID
        return uuidv4();
    }
});

app.use(sessionMiddleware);
app.use(express.static('public'));

// Функции для запросов в БД
async function getPublicMessages() {
    try {
        const result = await pool.query(`
            SELECT m.id, u.username, m.text, m.created_at
            FROM messages m
            JOIN users u ON m.user_id = u.id
            ORDER BY m.created_at ASC
        `);

        return result.rows.map(row => ({
            id: row.id,
            username: row.username,
            text: row.text,
            createdAt: row.created_at.toISOString()
        }));
    } catch (error) {
        console.error("Ошибка при получении публичных сообщений:", error);
        throw error; // Пробрасываем ошибку для обработки выше
    }
}

async function getPrivateMessages(senderUsername, recipientUsername) {
    try {
        // Получаем ID пользователей по их именам
        const senderResult = await pool.query('SELECT id FROM users WHERE username = $1', [senderUsername]);
        const recipientResult = await pool.query('SELECT id FROM users WHERE username = $1', [recipientUsername]);

        if (senderResult.rows.length === 0 || recipientResult.rows.length === 0) {
            console.log("Один из пользователей не найден");
            return []; // Один из пользователей не найден
        }

        const senderId = senderResult.rows[0].id;
        const recipientId = recipientResult.rows[0].id;

        const result = await pool.query(`
            SELECT pm.id, u_sender.username AS sender, u_recipient.username AS recipient, pm.text, pm.created_at
            FROM private_messages pm
            JOIN users u_sender ON pm.sender = u_sender.id
            JOIN users u_recipient ON pm.recipient = u_recipient.id
            WHERE (pm.sender = $1 AND pm.recipient = $2) OR (pm.sender = $2 AND pm.recipient = $1)
            ORDER BY pm.created_at ASC
        `, [senderId, recipientId]);

        return result.rows.map(row => ({
            id: row.id,
            sender: row.sender,
            recipient: row.recipient,
            text: row.text,
            createdAt: row.created_at.toISOString()
        }));

    } catch (err) {
        console.error("Ошибка при получении личных сообщений:", err);
        throw err;
    }
}

async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// Маршруты
app.get('/check-auth', async (req, res) => {
    if (req.session.userId) {
        // Теперь мы храним только ID пользователя в сессии
        try {
            const user = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
            if (user.rows.length === 0) {
                res.json({ authenticated: false });
                return;
            }
            res.json({ authenticated: true, username: user.rows[0].username });

        } catch (e) {
            console.error(e);
            res.status(500).send('Ошибка сервера');
        }
    } else {
        res.json({ authenticated: false });
    }
});

app.post('/register', async (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password) {
        return res.status(400).send('Имя пользователя и пароль должны быть указаны');
    }

    try {
        const existingUser = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);

        if (existingUser.rows.length > 0) {
            return res.status(400).send('Пользователь с таким именем пользователя или адресом электронной почты уже существует');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3)', [username, hashedPassword, email]);

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

        // Теперь сохраняем только ID пользователя в сессии
        req.session.userId = user.rows[0].id;

        // Сохраняем сессию
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
    if (!req.session.userId) {
        return res.status(401).send('Неавторизованный пользователь');
    }

    try {
        const user = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
        if (user.rows.length === 0) {
            return res.status(404).send('Пользователь не найден');
        }
        const currentUser = user.rows[0].username;

        const result = await pool.query(`
            SELECT DISTINCT u.username AS username
            FROM private_messages pm
            JOIN users u ON pm.recipient = u.id
            WHERE pm.sender = (SELECT id FROM users WHERE username = $1)
            UNION
            SELECT DISTINCT u.username AS username
            FROM private_messages pm
            JOIN users u ON pm.sender = u.id
            WHERE pm.recipient = (SELECT id FROM users WHERE username = $1)
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
         // Получаем ID пользователей по их именам
        const senderResult = await pool.query('SELECT id FROM users WHERE username = $1', [sender]);
        const recipientResult = await pool.query('SELECT id FROM users WHERE username = $1', [recipient]);

        if (senderResult.rows.length === 0 || recipientResult.rows.length === 0) {
            return res.status(404).send('Один из пользователей не найден');
        }

        const senderId = senderResult.rows[0].id;
        const recipientId = recipientResult.rows[0].id;

        const result = await pool.query(`
            SELECT pm.id, u_sender.username AS sender, u_recipient.username AS recipient, pm.text, pm.created_at
            FROM private_messages pm
            JOIN users u_sender ON pm.sender = u_sender.id
            JOIN users u_recipient ON pm.recipient = u_recipient.id
            WHERE (pm.sender = $1 AND pm.recipient = $2) OR (pm.sender = $2 AND pm.recipient = $1)
            ORDER BY pm.created_at ASC
        `, [senderId, recipientId]);

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

app.get('/get-public-messages', async (req, res) => {
    try {
        const result = await getPublicMessages();
        res.json({ messages: result });
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

app.post('/clear-public-messages', async (req, res) => {
    if (!req.session.userId) {
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
    if (!req.session.userId) {
        return res.status(401).send('Неавторизованный пользователь');
    }

    try {
        const user = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
        if (user.rows.length === 0) {
            return res.status(404).send('Пользователь не найден');
        }
        const currentUser = user.rows[0].username;

        const recipient = req.body.recipient;

        if (!recipient) {
            return res.status(400).send('Получатель должен быть указан');
        }

        // Получаем ID текущего пользователя и получателя
        const currentUserResult = await pool.query('SELECT id FROM users WHERE username = $1', [currentUser]);
        const recipientResult = await pool.query('SELECT id FROM users WHERE username = $1', [recipient]);

        if (currentUserResult.rows.length === 0 || recipientResult.rows.length === 0) {
            return res.status(404).send('Один из пользователей не найден');
        }

        const currentUserId = currentUserResult.rows[0].id;
        const recipientId = recipientResult.rows[0].id;

        // Удаляем все сообщения между текущим пользователем и выбранным собеседником
        await pool.query(`
            DELETE FROM private_messages
            WHERE (sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1)
        `, [currentUserId, recipientId]);

        console.log(`Удалена переписка между ${currentUser} и ${recipient}`);
        res.send('Переписка успешно удалена');
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера при удалении переписки');
    }
});

// WebSocket обработчики
io.use(async (socket, next) => {
    if (socket.handshake.headers.cookie) {
        cookieParser()(socket.handshake, null, async (err) => {
            if (err) {
                console.error("Ошибка при разборе cookie:", err);
                return next(new Error('Ошибка сервера'));
            }

            sessionMiddleware(socket.handshake, {}, async (err) => {
                if (err) {
                    console.error("Ошибка при применении middleware сессии:", err);
                    return next(new Error('Ошибка сервера'));
                }

                if (socket.handshake.session && socket.handshake.session.userId) {
                    try {
                        const user = await pool.query('SELECT username FROM users WHERE id = $1', [socket.handshake.session.userId]);
                        if (user.rows.length === 0) {
                            console.log('Пользователь не найден по ID в сессии.');
                            return next(new Error('Неавторизованный'));
                        }

                        socket.username = user.rows[0].username;  // Сохраняем имя пользователя в сокете
                        socket.userId = socket.handshake.session.userId; // Сохраняем ID пользователя в сокете
                        return next();
                    } catch (error) {
                        console.error('Ошибка при загрузке имени пользователя:', error);
                        return next(new Error('Ошибка сервера'));
                    }
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
    const userId = socket.userId;

    console.log(`Пользователь ${username} (ID: ${userId}) подключился к чату через WebSocket`);

    try {
        const publicMessages = await getPublicMessages();
        socket.emit('previousMessages', publicMessages);
    } catch (error) {
        console.error("Ошибка при получении предыдущих сообщений:", error);
    }

    socket.broadcast.emit('userJoined', { username, message: `${username} присоединился к чату` });

    socket.on('sendMessage', async (data) => {
        if (!username) {
            console.error('Имя пользователя отсутствует при отправке публичного сообщения');
            return;
        }

        try {
            const result = await pool.query(
                'INSERT INTO messages (user_id, text) VALUES ($1, $2) RETURNING id, created_at',
                [userId, data]
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
        const senderUsername = socket.username;
        const senderId = socket.userId; // Получаем senderId из socket

        if (!senderUsername || !recipient || !text) {
            console.error('Некорректные данные для личного сообщения:', { senderUsername, recipient, text });
            return;
        }

        try {
            // Получаем id получателя
            const recipientResult = await pool.query('SELECT id FROM users WHERE username = $1', [recipient]);

            if (recipientResult.rows.length === 0) {
                console.error('Получатель не найден');
                return; // Прерываем выполнение, если получатель не найден
            }
            const recipientId = recipientResult.rows[0].id;

            const result = await pool.query(
                'INSERT INTO private_messages (sender, recipient, text) VALUES ($1, $2, $3) RETURNING id, created_at',
                [senderId, recipientId, text]
            );

            if (result.rows.length > 0) {
                const messageId = result.rows[0].id;
                const createdAt = result.rows[0].created_at.toISOString();

                // Отправляем сообщение обоим пользователям (отправителю и получателю)
                io.to(socket.id).emit('receivePrivateMessage', { id: messageId, sender: senderUsername, recipient, text, createdAt }); // Отправляем отправителю
                //Надо будет отправлять всем пользователям, находящимся онлайн (сейчас только себе сообщение отправляет)
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