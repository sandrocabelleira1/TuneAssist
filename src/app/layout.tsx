
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { FirebaseClientProvider } from '@/firebase';

export const metadata: Metadata = {
  title: 'TuneAssist AI',
  description: 'Assistente de Afinação de ECU Potenciado por IA',
  icons: {
    icon: 'https://firebasestorage.googleapis.com/v0/b/tuneassist-pronto-337764-396c8.firebasestorage.app/o/favicon.ico%20(2).png?alt=media&token=e0ce39f4-0452-47d0-b193-c34b49fd9c02',
    apple: 'https://firebasestorage.googleapis.com/v0/b/tuneassist-pronto-337764-396c8.firebasestorage.app/o/favicon.ico%20(2).png?alt=media&token=e0ce39f4-0452-47d0-b193-c34b49fd9c02',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" className="dark h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="icon" href="https://firebasestorage.googleapis.com/v0/b/tuneassist-pronto-337764-396c8.firebasestorage.app/o/favicon.ico%20(2).png?alt=media&token=e0ce39f4-0452-47d0-b193-c34b49fd9c02" type="image/png" sizes="any" />
      </head>
      <body className="h-full font-sans antialiased">
        <FirebaseClientProvider>
          <div className="relative flex min-h-screen flex-col h-full">
              {children}
          </div>
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
