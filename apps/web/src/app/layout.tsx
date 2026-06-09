import type { ReactNode } from 'react';
import { Anton, Archivo } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
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

export const metadata = {
  title: 'CupCall — Football Cup Prediction',
  description: 'Predict every score, build your bracket, and find out who knows football.',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" className={`${anton.variable} ${archivo.variable}`}>
      <body style={{ fontFamily: 'var(--font-ui, system-ui, sans-serif)' }}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
