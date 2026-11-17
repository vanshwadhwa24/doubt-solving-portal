import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { attachUser } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { coursesRouter } from './routes/courses.js';
import { doubtsRouter } from './routes/doubts.js';
import { attachmentsRouter } from './routes/attachments.js';
import { messagesRouter } from './routes/messages.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'doubt-solving-portal' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/doubts', doubtsRouter);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api/doubts/:doubtId/messages', messagesRouter);

  // Serve the built client (production mode: npm run build && npm start).
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.get(/^(?!\/api).*/, (req, res) => {
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  // JSON error handler - no stack traces leak to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal server error' });
  });

  return app;
}
