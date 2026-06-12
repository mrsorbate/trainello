import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import helmet from 'helmet';
import db from './database/init';
import { createRateLimiter } from './middleware/rateLimit';
import authRoutes from './routes/auth';
import teamsRoutes from './routes/teams';
import eventsRoutes from './routes/events';
import statsRoutes from './routes/stats';
import invitesRoutes from './routes/invites';
import adminRoutes from './routes/admin';
import profileRoutes from './routes/profile';
import settingsRoutes from './routes/settings';
import notificationsRoutes from './routes/notifications';
import postsRoutes from './routes/posts';
import { startAutoGameImportJob } from './services/autoGameImport';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const apiRateLimitWindowMs = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const apiRateLimitMax = Number(process.env.API_RATE_LIMIT_MAX || 300);
const authRateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX || 20);
const corsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const apiLimiter = createRateLimiter({
  windowMs: Number.isFinite(apiRateLimitWindowMs) && apiRateLimitWindowMs > 0
    ? apiRateLimitWindowMs
    : 15 * 60 * 1000,
  max: Number.isFinite(apiRateLimitMax) && apiRateLimitMax > 0 ? apiRateLimitMax : 300,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = createRateLimiter({
  windowMs: Number.isFinite(apiRateLimitWindowMs) && apiRateLimitWindowMs > 0
    ? apiRateLimitWindowMs
    : 15 * 60 * 1000,
  max: Number.isFinite(authRateLimitMax) && authRateLimitMax > 0 ? authRateLimitMax : 20,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins }));
} else {
  app.use(cors());
}

app.use(express.json());
app.use('/api', apiLimiter);

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'teamvote+ API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me'
      },
      teams: {
        list: 'GET /api/teams',
        create: 'POST /api/teams',
        details: 'GET /api/teams/:id',
        members: 'GET /api/teams/:id/members'
      },
      events: {
        list: 'GET /api/events?team_id=:id',
        create: 'POST /api/events',
        details: 'GET /api/events/:id',
        respond: 'POST /api/events/:id/response'
      },
      stats: {
        team: 'GET /api/stats/team/:id',
        player: 'GET /api/stats/player/:id'
      }
    },
    documentation: 'See README.md for complete API documentation'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1 as ok').get();
    return res.json({
      status: 'ok',
      db: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Health DB check failed:', error);
    return res.status(503).json({
      status: 'degraded',
      db: 'error',
      error: 'database_unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api', postsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api', invitesRoutes);
app.use('/api', invitesRoutes);

// Image proxy for fussball.de team badges (CORS workaround)
app.get('/api/badge-proxy', async (req, res) => {
  const url = String(req.query.url || '');
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).end();
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isFussballDomain = hostname === 'fussball.de' || hostname.endsWith('.fussball.de');
  if ((parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') || !isFussballDomain) {
    return res.status(400).end();
  }

  try {
    const axios = require('axios');
    const response = await axios.get(parsedUrl.toString(), {
      responseType: 'arraybuffer',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.fussball.de/',
      },
    });
    const contentType = response.headers['content-type'] || 'image/png';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(response.data);
  } catch {
    res.status(502).end();
  }
});

// File upload endpoint
app.post('/api/admin/upload/logo', upload.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    const logoPath = `/uploads/${req.file.filename}`;
    const db = require('./database/init').default;
    db.prepare(`
      UPDATE organizations 
      SET logo = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(logoPath);

    const org = db.prepare('SELECT * FROM organizations WHERE id = 1').get();
    res.json(org);
  } catch (error) {
    console.error('Logo upload error:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  startAutoGameImportJob();
});
