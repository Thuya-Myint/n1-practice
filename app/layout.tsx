import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'N1 Field Notes',
  description: 'A focused Japanese vocabulary practice space.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
