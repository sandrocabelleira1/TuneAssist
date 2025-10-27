
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function PaymentSuccessPage() {
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        const triggerDownload = () => {
            setIsDownloading(true);
            const pendingFileString = localStorage.getItem('pendingBinFile');
            const pendingFileName = localStorage.getItem('pendingBinFileName');

            if (pendingFileString && pendingFileName) {
                try {
                    const bufferArray = JSON.parse(pendingFileString);
                    const newBinBuffer = new Uint8Array(bufferArray).buffer;
                    
                    const blob = new Blob([newBinBuffer], { type: 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = pendingFileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    // Clean up localStorage
                    localStorage.removeItem('pendingBinFile');
                    localStorage.removeItem('pendingBinFileName');
                } catch (e) {
                    console.error("Error processing file from localStorage", e);
                } finally {
                    setIsDownloading(false);
                }
            } else {
                 setIsDownloading(false);
            }
        };

        triggerDownload();
    }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="mt-4 text-2xl font-bold">Pagamento Aprovado!</CardTitle>
          <CardDescription>O seu pagamento foi processado com sucesso. O download começará em breve.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            {isDownloading && (
                <div className="flex items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    A preparar o seu ficheiro...
                </div>
            )}
            <p className="text-xs text-muted-foreground">
                Se o download não começar automaticamente, verifique se os pop-ups estão bloqueados.
            </p>
          <Button asChild className="w-full">
            <Link href="/">Voltar à Página Principal</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
