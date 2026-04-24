import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title:
    'AnshulTheGreat.com — Enterprise Voice AI Agents & Speech Analytics',
  description:
    'AnshulTheGreat.com — Enterprise Voice AI agents and advanced speech analytics for B2B businesses. Automate conversations, unlock insights, and scale customer engagement across any industry.',
  openGraph: {
    title:
      'AnshulTheGreat.com — Enterprise Voice AI Agents & Speech Analytics',
    description:
      'Deploy AI-powered voice agents and advanced speech analytics for B2B businesses.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
