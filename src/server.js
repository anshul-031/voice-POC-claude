// Render compatibility entrypoint for legacy start command: node src/server.js.
const isVitestRun = process.env.VITEST === 'true';

if (isVitestRun) {
	if (import.meta.url.includes('test=env-yes')) {
		await import('./server.ts?test=env-yes');
	} else if (import.meta.url.includes('test=env-no')) {
		await import('./server.ts?test=env-no');
	} else if (import.meta.url.includes('test=full')) {
		await import('./server.ts?test=full');
	} else {
		await import('./server.ts');
	}
} else {
	await import('../dist/src/server.js');
}
