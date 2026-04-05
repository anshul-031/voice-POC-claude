import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import agentRoutes from './routes/agents.js';
import authRoutes from './routes/auth.js';
import signalingServer from './services/signalingServer.js';
import logger from './utils/logger.js';
import { UI_STRINGS } from './constants/uiStrings.js';
import { DEFAULT_PORT } from './constants/index.js';
import { ROUTES } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(process.cwd(), 'public');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || DEFAULT_PORT;

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use(ROUTES.API_PREFIX, agentRoutes);

const sendPublicPage = (res: Response, pageFile: string): void => {
  res.sendFile(join(PUBLIC_DIR, pageFile));
};

const redirectTo = (res: Response, path: string): void => {
  res.redirect(301, path);
};

// Static Constants for Frontend
app.get(ROUTES.CONSTANTS_UI_STRINGS, (req: Request, res: Response) => {
  res.sendFile(join(__dirname, 'constants', 'uiStrings.ts'));
});

app.get(ROUTES.CONSTANTS_CONFIG, (req: Request, res: Response) => {
  res.sendFile(join(__dirname, 'constants', 'index.ts'));
});

// Health check
app.get(ROUTES.HEALTH_CHECK, (req: Request, res: Response) => {
  logger.debug('Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Canonical page routes
app.get(ROUTES.LANDING_PAGE, (req: Request, res: Response) => {
  sendPublicPage(res, 'landing.html');
});

app.get(ROUTES.LANDING_ALIAS_PAGE, (req: Request, res: Response) => {
  redirectTo(res, ROUTES.LANDING_PAGE);
});

app.get(ROUTES.DASHBOARD_PAGE, (req: Request, res: Response) => {
  sendPublicPage(res, 'index.html');
});

app.get(ROUTES.LOGIN_PAGE, (req: Request, res: Response) => {
  sendPublicPage(res, 'login.html');
});

app.get(ROUTES.SIGNUP_PAGE, (req: Request, res: Response) => {
  sendPublicPage(res, 'signup.html');
});

app.get(ROUTES.FORGOT_PASSWORD_PAGE, (req: Request, res: Response) => {
  sendPublicPage(res, 'forgot-password.html');
});

app.get(ROUTES.RESET_PASSWORD_PAGE, (req: Request, res: Response) => {
  sendPublicPage(res, 'reset-password.html');
});

// Legacy page URLs
app.get(ROUTES.LEGACY_LANDING_PAGE, (req: Request, res: Response) => {
  redirectTo(res, ROUTES.LANDING_PAGE);
});

app.get(ROUTES.LEGACY_DASHBOARD_PAGE, (req: Request, res: Response) => {
  redirectTo(res, ROUTES.DASHBOARD_PAGE);
});

app.get(ROUTES.LEGACY_LOGIN_PAGE, (req: Request, res: Response) => {
  redirectTo(res, ROUTES.LOGIN_PAGE);
});

app.get(ROUTES.LEGACY_SIGNUP_PAGE, (req: Request, res: Response) => {
  redirectTo(res, ROUTES.SIGNUP_PAGE);
});

app.get(ROUTES.LEGACY_FORGOT_PASSWORD_PAGE, (req: Request, res: Response) => {
  redirectTo(res, ROUTES.FORGOT_PASSWORD_PAGE);
});

app.get(ROUTES.LEGACY_RESET_PASSWORD_PAGE, (req: Request, res: Response) => {
  redirectTo(res, ROUTES.RESET_PASSWORD_PAGE);
});

// Public preview page with agent id path parameter
app.get(`${ROUTES.PREVIEW_PAGE}/:agentId`, (req: Request, res: Response) => {
  sendPublicPage(res, 'preview.html');
});

// Serve static frontend assets
app.use(express.static(PUBLIC_DIR));

// Fallback to SPA (dashboard)
app.get('*', (req: Request, res: Response) => {
  sendPublicPage(res, 'index.html');
});

// Attach WebSocket signaling server
signalingServer.attach(server);

// Start server
server.listen(PORT, () => {
  const startupMsg = `
${'━'.repeat(56)}
🎙️  ${UI_STRINGS.header.title} — AI Voice Agent Platform
${'━'.repeat(56)}
  🌐  Server:     http://localhost:${PORT}
  📡  WebSocket:  ws://localhost:${PORT}${ROUTES.WS_PATH}
  📊  API:        http://localhost:${PORT}${ROUTES.API_PREFIX}
  🔒  Auth:       http://localhost:${PORT}/api/auth
${'─'.repeat(56)}
  🔑  API Key:    ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ MISSING'}
  🗄️   Database:   ${process.env.DATABASE_URL ? '✅ Configured' : '❌ MISSING'}
  🖥️   Node:       ${process.version}
  📅  Started:    ${new Date().toLocaleString()}
${'━'.repeat(56)}
`;
  logger.info('Server started', {
    port: PORT,
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development',
  });
   
  console.log(startupMsg);
});
