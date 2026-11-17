import express from 'express';
import cookieParser from 'cookie-parser';
import { attachUser } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'doubt-solving-portal' });
  });

  app.use('/api/auth', authRouter);

  // JSON error handler - no stack traces leak to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal server error' });
  });

  return app;
}
