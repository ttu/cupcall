import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Cup Prediction',
  description: 'Football Cup Prediction App',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
