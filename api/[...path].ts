import type { Request, Response } from 'express';

type ExpressHandler = (req: Request, res: Response) => void;

let cachedApp: ExpressHandler | null = null;

async function loadApp(): Promise<ExpressHandler> {
	if (cachedApp) {
		return cachedApp;
	}

	// Force serverless mode before loading server module.
	process.env.VERCEL = process.env.VERCEL || '1';

	const mod = await import('../src/server.js');
	cachedApp = mod.default as unknown as ExpressHandler;
	return cachedApp;
}

export default async function handler(req: Request, res: Response): Promise<void> {
	const app = await loadApp();
	app(req, res);
}
