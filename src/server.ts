import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import agentRoutes from './routes/agents.js';
import authRoutes from './routes/auth.js';
import telephonyRoutes from './routes/telephony.js';
import outboundCallRoutes from './routes/outboundCall.js';
import campaignRoutes from './routes/campaigns.js';
import callHistoryRoutes from './routes/callHistory.js';
import vobizWebhookRoutes from './routes/vobizWebhooks.js';
import integrationRoutes from './routes/integration.js';
import signalingServer from './services/signalingServer.js';
import { startCampaignScheduler, stopCampaignScheduler } from './services/campaignSchedulerLoop.js';
import { disconnectPrisma } from './lib/prisma.js';
import { clearUserCache } from './lib/userCache.js';
import logger from './utils/logger.js';
import { renderSsrPage } from './utils/ssr.js';
import { RUNTIME_UI_CONFIG } from './constants/config.js';
import { DEFAULT_PORT, DEFAULT_LANDING_PAGE_URL } from './constants/index.js';
import { ROUTES } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(process.cwd(), 'public');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || DEFAULT_PORT;
const LANDING_PAGE_URL = process.env.LANDING_PAGE_URL || DEFAULT_LANDING_PAGE_URL;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
app.use('/api/telephony', telephonyRoutes);
app.use('/api/outbound-call', outboundCallRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/call-history', callHistoryRoutes);
app.use('/api/webhooks/vobiz', vobizWebhookRoutes);
app.use('/api/integration', integrationRoutes);

const sendPublicPage = (res: Response, pageFile: string): void => {
  try {
    const html = renderSsrPage(PUBLIC_DIR, pageFile, RUNTIME_UI_CONFIG);
    res.type('html').send(html);
  } catch (error: unknown) {
    logger.error('SSR render failed', {
      pageFile,
      error: String(error),
    });
    res.sendFile(join(PUBLIC_DIR, pageFile));
  }
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

app.get(ROUTES.RUNTIME_CONFIG, (_req: Request, res: Response) => {
  res.json(RUNTIME_UI_CONFIG);
});

// Landing page routes — redirect to external landing application
app.get(ROUTES.LANDING_PAGE, (req: Request, res: Response) => {
  res.redirect(302, LANDING_PAGE_URL);
});

app.get(ROUTES.LANDING_ALIAS_PAGE, (req: Request, res: Response) => {
  res.redirect(302, LANDING_PAGE_URL);
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
  res.redirect(302, LANDING_PAGE_URL);
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

// Start the background campaign scheduler (scheduled + windowed campaigns)
startCampaignScheduler();

// Start server
server.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development',
    websiteName: RUNTIME_UI_CONFIG.websiteName,
    websocketPath: ROUTES.WS_PATH,
    apiPrefix: ROUTES.API_PREFIX,
    geminiApiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    databaseConfigured: Boolean(process.env.DATABASE_URL),
  });
});

let shuttingDown = false;

/**
 * Releases the database pool before the process exits.
 *
 * Without this a redeploy left its connections for the database to reap on its
 * own timeout, so a restarting service could sit above its connection limit.
 * A second signal is ignored so an impatient supervisor cannot interleave two
 * shutdowns.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down', { signal });

  stopCampaignScheduler();
  clearUserCache();
  server.close();

  try {
    await disconnectPrisma();
  } catch (error: unknown) {
    logger.error('Failed to close database connections', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

(['SIGTERM', 'SIGINT'] as const).forEach((signal) => {
  process.once(signal, () => {
    void shutdown(signal);
  });
});
