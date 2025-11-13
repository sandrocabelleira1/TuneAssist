
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { FirebaseClientProvider } from '@/firebase';

export const metadata: Metadata = {
  title: 'TuneAssist AI',
  description: 'Assistente de Afinação de ECU Potenciado por IA',
  icons: {
    icon: 'https://firebasestorage.googleapis.com/v0/b/tuneassist-pronto-337764-396c8.firebasestorage.app/o/logo%20tune%20(1).png?alt=media&token=6f3185ef-72f4-43e8-b0c6-75eb8aaafe03',
    apple: 'https://firebasestorage.googleapis.com/v0/b/tuneassist-pronto-337764-396c8.firebasestorage.app/o/logo%20tune%20(1).png?alt=media&token=6f3185ef-72f4-43e8-b0c6-75eb8aaafe03',
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
