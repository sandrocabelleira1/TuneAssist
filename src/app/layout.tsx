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
  return (
    <html lang="en" className="dark h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground h-full flex flex-col">
         <Header />
         <main className="flex-1 flex flex-col min-h-0">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}