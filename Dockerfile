# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install ALL deps (dev included for build)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source files needed for TypeScript compilation
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
COPY prisma/ ./prisma/
COPY patch.js ./

# Generate Prisma client and compile TypeScript
RUN npx prisma generate
RUN npm run build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy package files and install ONLY production deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output, public assets, and prisma schema
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY public/ ./public/
COPY prisma/ ./prisma/

# Cloud Run uses port 8080 by default
EXPOSE 8080

# Run the compiled server
CMD ["node", "dist/src/server.js"]
