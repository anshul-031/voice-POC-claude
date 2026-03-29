import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import agentRoutes from './routes/agents.js';
import signalingServer from './services/signalingServer.js';
import logger from './utils/logger.js';
import { UI_STRINGS } from './constants/uiStrings.js';
import { DEFAULT_PORT } from './constants/index.js';
import { ROUTES } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || DEFAULT_PORT;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
/* istanbul ignore next */
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Serve static frontend
app.use(express.static(join(__dirname, '..', 'public')));

// API Routes
app.use(ROUTES.API_PREFIX, agentRoutes);

// Static Constants for Frontend
app.get(ROUTES.CONSTANTS_UI_STRINGS, (req, res) => {
  res.sendFile(join(__dirname, 'constants', 'uiStrings.js'));
});

app.get(ROUTES.CONSTANTS_CONFIG, (req, res) => {
  res.sendFile(join(__dirname, 'constants', 'config.js'));
});

// Health check
/* istanbul ignore next */
app.get(ROUTES.HEALTH_CHECK, (req, res) => {
  logger.debug('Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback to SPA
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// Attach WebSocket signaling server
signalingServer.attach(server);

// Start server
server.listen(PORT, /* istanbul ignore next */ () => {
  const startupMsg = `
${'━'.repeat(56)}
🎙️  ${UI_STRINGS.header.title} — AI Voice Agent Platform
${'━'.repeat(56)}
  🌐  Server:     http://localhost:${PORT}
  📡  WebSocket:  ws://localhost:${PORT}${ROUTES.WS_PATH}
  📊  API:        http://localhost:${PORT}${ROUTES.API_PREFIX}
${'─'.repeat(56)}
  🔑  API Key:    ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ MISSING'}
  🗄️   Database:   ${process.env.DATABASE_URL ? '✅ Configured' : '❌ MISSING'}
  🖥️   Node:       ${process.version}
  📅  Started:    ${new Date().toLocaleString()}
${'━'.repeat(56)}
`;
  console.log(startupMsg);
  logger.info('Server started', {
    port: PORT,
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development',
  });
});
