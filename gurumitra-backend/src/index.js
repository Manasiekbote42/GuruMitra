import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { testConnection } from './config/db.js';
import authRoutes from './routes/auth.js';
import teacherRoutes from './routes/teacher.js';
import managementRoutes from './routes/management.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS - allow Lovable frontend
const allowedOrigins = [
  'https://mitra-vision-lab.lovable.app',
  'http://localhost:5173',
  'http://localhost:3000',
];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(null, true); // allow all in dev; tighten in production
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  const dbOk = await testConnection();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'disconnected',
  });
});

// Serve uploaded session video (no auth - AI service fetches by session id)
app.get('/api/teacher/session-file/:id', (req, res) => {
  const id = req.params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    return res.status(404).json({ error: 'File not found' });
  }
  const files = fs.readdirSync(UPLOADS_DIR).filter((f) => f.startsWith(id));
  if (files.length === 0) {
    return res.status(404).json({ error: 'File not found' });
  }
  const filePath = path.join(UPLOADS_DIR, files[0]);
  res.sendFile(filePath, (err) => {
    if (err) res.status(500).json({ error: 'Error sending file' });
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/management', managementRoutes);
app.use('/api/admin', adminRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`GuruMitra backend running at http://localhost:${PORT}`);
  console.log('Health: http://localhost:' + PORT + '/health');
});
