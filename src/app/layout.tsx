import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import Header from '@/components/header';

export const metadata: Metadata = {
  title: 'TuneAssist AI',
  description: 'Assistente de Afinação de ECU Potenciado por IA',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The main layout doesn't include the header.
  // The header is now part of the (app) layout for authenticated users.
  // The (auth) layout for the login page is separate and has no header.
  return (
    <html lang="en" className="dark h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground h-full">
         <div className="relative flex min-h-full flex-col">
          <Header />
          <main className="flex-1 flex flex-col">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
