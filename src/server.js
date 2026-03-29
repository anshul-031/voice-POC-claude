import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import agentRoutes from './routes/agents.js';
import signalingServer from './services/signalingServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(join(__dirname, '..', 'public')));

// API Routes
app.use('/api', agentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback to SPA
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// Attach WebSocket signaling server
signalingServer.attach(server);

// Start server
server.listen(PORT, () => {
  console.log(`\n${'━'.repeat(56)}`);
  console.log(`🎙️  VoiceForge — AI Voice Agent Platform`);
  console.log(`${'━'.repeat(56)}`);
  console.log(`  🌐  Server:     http://localhost:${PORT}`);
  console.log(`  📡  WebSocket:  ws://localhost:${PORT}/ws`);
  console.log(`  📊  API:        http://localhost:${PORT}/api`);
  console.log(`${'─'.repeat(56)}`);
  console.log(`  🔑  API Key:    ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ MISSING'}`);
  console.log(`  🗄️   Database:   ${process.env.DATABASE_URL ? '✅ Configured' : '❌ MISSING'}`);
  console.log(`  🖥️   Node:       ${process.version}`);
  console.log(`  📅  Started:    ${new Date().toLocaleString()}`);
  console.log(`${'━'.repeat(56)}\n`);
});
