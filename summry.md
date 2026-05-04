# Project Summary — Voice Agent Platform

## Overview
This repository implements an AI voice agent creation and testing platform. It provides:
- A backend API for authentication, agent management, and configuration.
- A browser-based dashboard for creating and testing voice agents.
- A standalone marketing/landing site built with Next.js.
- Real‑time voice calls and transcription via the Gemini Live API.

## Problem It Solves
Teams need a fast way to define, test, and operate AI voice agents without building custom telephony or audio pipelines. This platform centralizes agent configuration (persona, model, voice), supports browser-based testing, and streams audio in real time to an LLM that returns audio + transcripts.

## High‑Level Architecture

### 1) Backend (Node.js + Express)
- Entry: [src/server.ts](src/server.ts)
- Responsibilities:
  - Serves API routes for auth and agent CRUD.
  - Hosts static dashboard pages from public/.
  - Exposes runtime UI configuration and UI strings.
  - Redirects landing routes to the external Next.js site.
  - Hosts a WebSocket endpoint for real‑time audio streaming.

### 2) WebSocket + Gemini Live
- Core service: [src/services/geminiLive.ts](src/services/geminiLive.ts)
- Responsibilities:
  - Connects to Gemini Live and manages sessions.
  - Streams audio to Gemini and emits audio + transcripts back.
  - Applies voice and VAD (voice activity detection) tuning.

### 3) Database (PostgreSQL + Prisma)
- Schema: [prisma/schema.prisma](prisma/schema.prisma)
- Entities:
  - User: login, reset, profile.
  - VoiceAgent: name, system prompt, voice, model, public preview.

### 4) Dashboard Frontend (Static HTML/CSS/JS)
- Entry HTML: [public/index.html](public/index.html)
- Scripts: [public/js](public/js)
- Responsibilities:
  - Auth flows (login/signup/reset).
  - Agent creation and editing.
  - Live call preview in browser.
  - Live transcription UI.

### 5) Landing Site (Next.js)
- App root: [landing/src/app](landing/src/app)
- Runs separately on its own port (default 3001).
- Provides marketing pages, CTA links to login/signup.

## Key Flows
- Agent creation:
  - UI submits JSON -> API validates with schemas -> Prisma persists.
- Agent test call:
  - Frontend opens WebSocket -> audio streamed to backend -> Gemini Live -> audio + transcript streamed back -> UI renders transcript and playback.
- Public preview:
  - Public preview URL maps to a static preview page with agent ID.

## Tech Stack
- Backend: Node.js, Express, TypeScript, Prisma, PostgreSQL.
- Realtime: WebSocket server + Gemini Live API.
- Frontend (dashboard): HTML/CSS/Vanilla JS modules.
- Landing: Next.js (React), TypeScript, CSS.
- Tooling: ESLint, TypeScript, Vitest, Prisma CLI.

## Scope (Current Capabilities)
- Auth endpoints and UI pages (login, signup, reset).
- CRUD for voice agents with voice/model selection.
- Public preview links for agents.
- Browser-based audio calling with live transcription.
- Separate landing site for marketing and acquisition.

## Deployment/Run Summary
- Backend runs from the repo root and serves the dashboard and API.
- Landing app runs from landing/ on its own port.
- Environment variables configure database, Gemini key, UI branding, and landing URL.

## Future Work Ideas
- Add a hot‑reload dev script for backend (tsx/ts-node).
- Add admin roles, team workspaces, and org‑level sharing.
- Add call analytics dashboards (sentiment, topic extraction, QA).
- Add fine‑grained permissions for public previews.
- Add rate‑limits and usage metering for production.
- Add CI pipelines for DB migrations and deployments.

## Notable Files
- [src/server.ts](src/server.ts) — server setup, routes, static assets
- [src/routes/agents.ts](src/routes/agents.ts) — agent CRUD and models/voices endpoints
- [src/services/geminiLive.ts](src/services/geminiLive.ts) — Gemini Live sessions
- [prisma/schema.prisma](prisma/schema.prisma) — database schema
- [public/index.html](public/index.html) — dashboard entry
- [landing/src/app/page.tsx](landing/src/app/page.tsx) — landing page UI
