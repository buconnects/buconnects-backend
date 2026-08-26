import dotenv from 'dotenv';
dotenv.config();

import crypto from 'node:crypto';
import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { Server } from 'socket.io';
import webpush from 'web-push';
import userRoutes from './routes/user.routes.js';
import db from './config/db.js';
import authRoutes from './modules/auth/auth.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import announcementRoutes from './modules/announcements/announcement.routes.js';
import eventRoutes from './modules/events/events.routes.js';
import marketplaceRoutes from './modules/marketplace/marketplace.routes.js';
import postRouter from './routes/posts.js';
import hostelRoutes from './modules/hostels/hostels.routes.js';

const app = express();
const server = http.createServer(app);

// 1. Defined Allowed Origins
const allowedOrigins = [
  'https://buconnects-frontend-one.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  process.env.APP_URL
].filter(Boolean);

// 2. Initialize Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// 3. Configure Express CORS Middleware
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback to allow connection
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Mount API Routes
app.use('/api', userRoutes);
app.use('/api/posts', postRouter);
app.use('/api/users', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/v1/marketplace', marketplaceRoutes);
app.use('/api/hostels', hostelRoutes);
app.use('/api/updates', announcementRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/chat', userRoutes);

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// 5. Global Error Handler
app.use((err, req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// 6. Web Push Configuration
webpush.setVapidDetails(
  'mailto:support@buconnects.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// 7. Health & Basic Routes
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    res.status(200).json({
      status: 'UP',
      message: 'buconnects backend server and MySQL database are healthy.',
      dbTest: rows[0].result === 2
    });
  } catch (error) {
    res.status(500).json({ status: 'DOWN', error: error.message });
  }
});

app.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    res.status(200).json({
      status: 'UP',
      message: 'buconnects backend server and MySQL database are healthy.',
      dbTest: rows[0].result === 2
    });
  } catch (error) {
    res.status(500).json({ status: 'DOWN', error: error.message });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    const [posts] = await db.query(
      `SELECT id, author_id, author_name, campus, content, media_urls, created_at 
       FROM posts ORDER BY created_at DESC LIMIT 50`
    );
    res.json(posts);
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).json({ error: 'Failed to fetch social feed.' });
  }
});

app.post('/api/posts', async (req, res) => {
  const { authorId, authorName, campus, content, mediaUrls } = req.body;

  if (!content || !authorId) {
    return res.status(400).json({ error: 'Author ID and content are required.' });
  }

  const postId = crypto.randomUUID();
  const mediaJson = mediaUrls ? JSON.stringify(mediaUrls) : null;

  try {
    await db.query(
      `INSERT INTO posts (id, author_id, author_name, campus, content, media_urls) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [postId, authorId, authorName, campus, content, mediaJson]
    );

    const newPost = {
      id: postId,
      author_id: authorId,
      author_name: authorName,
      campus: campus,
      content: content,
      media_urls: mediaUrls || null,
      created_at: new Date()
    };

    io.emit('new_post', newPost);

    const [subscriptions] = await db.query('SELECT subscription_json FROM push_subscriptions');
    
    const payload = JSON.stringify({
      title: `${authorName} (${campus})`,
      body: content.length > 90 ? content.substring(0, 90) + '...' : content,
      icon: '/logo192.png'
    });

    subscriptions.forEach((sub) => {
      try {
        const pushConfig = JSON.parse(sub.subscription_json);
        webpush.sendNotification(pushConfig, payload).catch((err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            db.query('DELETE FROM push_subscriptions WHERE subscription_json = ?', [sub.subscription_json]);
          }
        });
      } catch (e) {
        console.error('Error parsing subscription:', e);
      }
    });

    res.status(201).json(newPost);
  } catch (err) {
    console.error('Error inserting post:', err);
    res.status(500).json({ error: 'Server failed to save post.' });
  }
});

// 8. Socket.io Event Handlers
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('⚡ Connected client:', socket.id);

  socket.on('register_user', (userId) => {
    onlineUsers.set(String(userId), socket.id);
  });

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
  });

  socket.on('typing', ({ roomId, userId }) => {
    socket.to(roomId).emit('user_typing', { userId });
  });

  socket.on('stop_typing', ({ roomId, userId }) => {
    socket.to(roomId).emit('user_stop_typing', { userId });
  });

  socket.on('send_message', async (data) => {
    const roomId = data.roomId || data.room_id || null;
    const senderId = data.sender_id || data.senderId || null;
    const receiverId = data.receiver_id || data.receiverId || null;
    const messageText = data.message || data.content || '';
    const senderName = data.senderName || data.sender_name || 'New Message';
    const messageType = data.message_type || data.messageType || 'text';
    const fileUrl = data.file_url || data.fileUrl || null;
    const fileName = data.file_name || data.fileName || null;

    if (!roomId || !senderId || !receiverId || (!messageText && !fileUrl)) {
      console.error('Missing required fields in send_message payload:', { roomId, senderId, receiverId });
      return;
    }

    try {
      const sql = `
        INSERT INTO messages (room_id, sender_id, receiver_id, message, message_type, file_url, file_name, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, NOW())
      `;

      const [result] = await db.execute(sql, [
        roomId,
        senderId,
        receiverId,
        messageText,
        messageType,
        fileUrl,
        fileName
      ]);

      const fullMessagePayload = {
        id: result.insertId,
        room_id: roomId,
        sender_id: senderId,
        receiver_id: receiverId,
        message: messageText,
        message_type: messageType,
        file_url: fileUrl,
        file_name: fileName,
        is_read: false,
        created_at: new Date().toISOString()
      };

      io.to(roomId).emit('receive_message', fullMessagePayload);

      await db.execute(
        `INSERT INTO notifications (user_id, title, message, is_read, created_at)
         VALUES (?, ?, ?, FALSE, NOW())`,
        [receiverId, 'New message', `${senderName} sent you a message.`]
      );

      const receiverSocketId = onlineUsers.get(String(receiverId));
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('new_notification', {
          title: 'New message',
          message: `${senderName} sent you a message.`,
          type: 'message',
          roomId,
          senderId,
          createdAt: new Date().toISOString(),
        });
      }

      let pushBody = messageText;
      if (!pushBody && fileUrl) {
        pushBody = messageType === 'image' ? '📷 Sent an image' : '📁 Sent an attachment';
      }

      const [rows] = await db.execute(
        'SELECT subscription_json FROM push_subscriptions WHERE user_id = ?',
        [receiverId]
      );

      if (rows.length > 0 && rows[0].subscription_json) {
        const subscription = typeof rows[0].subscription_json === 'string'
          ? JSON.parse(rows[0].subscription_json)
          : rows[0].subscription_json;

        const payload = JSON.stringify({
          title: senderName,
          body: pushBody,
          icon: '/icon.png',
          data: { url: `/chat?room=${roomId}` }
        });

        webpush.sendNotification(subscription, payload).catch((err) => {
          console.error('Push error:', err.message);
        });
      }
    } catch (err) {
      console.error('DB/Push error:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
  });
});

app.post('/api/notifications/subscribe', async (req, res) => {
  const { userId, subscription } = req.body;

  if (!userId || !subscription) {
    return res.status(400).json({ error: 'Missing userId or subscription payload.' });
  }

  try {
    await db.query(
      `INSERT INTO push_subscriptions (user_id, subscription_json) VALUES (?, ?)`,
      [userId, JSON.stringify(subscription)]
    );
    res.status(201).json({ message: 'Push subscription saved successfully.' });
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ error: 'Failed to save subscription.' });
  }
});

// 9. Start Server
const PORT = Number(process.env.PORT) || 5000;

server.listen(PORT, async () => {
  console.log(`==================================================`);
  console.log(`🚀 buconnects Server running on http://localhost:${PORT}`);
  
  try {
    const connection = await db.getConnection();
    console.log(` Connected to MySQL Database [${process.env.DB_NAME || 'buconnects_db'}]`);
    connection.release();
  } catch (err) {
    console.error(`❌ MySQL Connection Error:`, err.message);
  }
  console.log(`==================================================`);
});