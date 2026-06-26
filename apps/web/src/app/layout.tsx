import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Anton, Archivo } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});

const DESCRIPTION =
  'Predict scores, build your bracket, pick the specials. Compete in private pools with friends — one winner when the final whistle blows.';

export const metadata: Metadata = {
  metadataBase: new URL('https://cupcall.app'),
  title: {
    default: 'CupCall — Football Cup Prediction',
    template: '%s | CupCall',
  },
  description: DESCRIPTION,
  applicationName: 'CupCall',
  keywords: ['football', 'cup prediction', 'World Cup 2026', 'bracket', 'pool', 'score prediction'],
  authors: [{ name: 'CupCall' }],
  creator: 'CupCall',
  openGraph: {
    type: 'website',
    url: 'https://cupcall.app',
    siteName: 'CupCall',
    title: 'CupCall — Football Cup Prediction',
    description: DESCRIPTION,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'CupCall' }],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@cupcall',
    title: 'CupCall — Football Cup Prediction',
    description: DESCRIPTION,
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: {
    icon: [
      { url: '/icon', type: 'image/png' },
      { url: '/icon?size=32', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" className={`${anton.variable} ${archivo.variable}`}>
      <body className="font-cup-ui">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
