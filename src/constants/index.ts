/**
 * General application constants
 */

export const DEFAULT_PORT = 3000;
export const DEFAULT_WEBSITE_NAME = 'AnshulTheGreat.com';
export const DEFAULT_THEME = 'dark';
export const DEFAULT_LANDING_PAGE_URL = 'http://localhost:3001';
export const SUPPORTED_THEMES = ['dark', 'light'] as const;

export type SupportedTheme = typeof SUPPORTED_THEMES[number];
