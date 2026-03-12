import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { Server as SocketServer } from 'socket.io';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import authRouter from './routes/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { registerSocketServer } from './services/socket-events.js';
import { startMaxTcpServer } from './services/max-tcp-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);

// Socket.IO
const io = new SocketServer(server, {
  cors: { origin: config.corsOrigin === '*' ? true : config.corsOrigin, credentials: true },
});

// Make io available to routes
app.set('io', io);
registerSocketServer(io);

app.set('trust proxy', true);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use((req, _res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({ method: req.method, path: req.path, status: res.statusCode, duration: Date.now() - start, requestId: req.headers['x-request-id'] });
  });
  next();
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api', routes);

// Serve static files from client build
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handling
app.use('/api', notFoundHandler);
app.use(errorHandler);

// Socket.IO events
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

server.listen(config.port, () => {
  logger.info(`Brum Flow server running on http://localhost:${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  startMaxTcpServer();
});
