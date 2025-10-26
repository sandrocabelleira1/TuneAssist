
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/firebase/client';
import { ref, listAll, getDownloadURL, getMetadata, deleteObject, StorageReference } from 'firebase/storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Trash2, Download, RefreshCw, AlertCircle, Inbox } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';

interface BackupFile {
  ref: StorageReference;
  name: string;
  fullPath: string;
  size: number;
  createdAt: Date;
}

interface BackupLibraryProps {
  addLog: (message: string, type?: 'info' | 'success' | 'error' | 'debug') => void;
}

export default function BackupLibrary({ addLog }: BackupLibraryProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<StorageReference | null>(null);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    addLog('A procurar backups na nuvem...', 'info');

    try {
      const backupsRef = ref(storage, 'backups/');
      const res = await listAll(backupsRef);
      
      const filePromises = res.items.map(async (itemRef) => {
        const metadata = await getMetadata(itemRef);
        return {
          ref: itemRef,
          name: metadata.name,
          fullPath: metadata.fullPath,
          size: metadata.size,
          createdAt: new Date(metadata.timeCreated),
        };
      });

      const fetchedFiles = await Promise.all(filePromises);
      fetchedFiles.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      setFiles(fetchedFiles);
      addLog(`Encontrados ${fetchedFiles.length} backups.`, 'success');
    } catch (err: any) {
      const errorMessage = `Erro ao obter backups: ${err.message}`;
      setError(errorMessage);
      addLog(errorMessage, 'error');
      toast({ title: 'Erro de Biblioteca', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [addLog, toast]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleDownload = async (fileRef: StorageReference, fileName: string) => {
    addLog(`A iniciar descarregamento de ${fileName}...`, 'info');
    try {
      const url = await getDownloadURL(fileRef);
      const a = document.createElement('a');
      a.href = url;
      a.target = "_blank"; // Open in a new tab to trigger download
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: 'A Descarregar', description: `${fileName} está a ser descarregado.` });
    } catch (err: any) {
      const errorMessage = `Falha ao descarregar ${fileName}: ${err.message}`;
      addLog(errorMessage, 'error');
      toast({ title: 'Erro de Descarregamento', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!isDeleting) return;
    const fileToDelete = isDeleting;
    addLog(`A apagar o backup ${fileToDelete.name}...`, 'info');

    try {
      await deleteObject(fileToDelete);
      toast({ title: 'Backup Apagado', description: `${fileToDelete.name} foi apagado com sucesso.` });
      addLog(`Backup ${fileToDelete.name} apagado com sucesso.`, 'success');
      // Refresh the list
      setFiles(files.filter(f => f.ref.fullPath !== fileToDelete.fullPath));
    } catch (err: any) {
      const errorMessage = `Falha ao apagar ${fileToDelete.name}: ${err.message}`;
      addLog(errorMessage, 'error');
      toast({ title: 'Erro ao Apagar', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsDeleting(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-center">
            <div>
                <CardTitle>Biblioteca de Backups</CardTitle>
                <CardDescription>Veja e gira todos os seus ficheiros .bin modificados salvos na nuvem.</CardDescription>
            </div>
            <Button variant="outline" size="icon" onClick={fetchFiles} disabled={isLoading}>
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4" />
              <p>A carregar backups...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-destructive">
              <AlertCircle className="h-8 w-8 mb-4" />
              <p className="font-semibold">Não foi possível carregar os backups</p>
              <p className="text-sm">{error}</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Inbox className="h-8 w-8 mb-4" />
              <p className="font-semibold">Nenhum backup encontrado</p>
              <p className="text-sm">Os seus ficheiros .bin modificados aparecerão aqui quando os salvar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome do Ficheiro</TableHead>
                  <TableHead>Data de Criação</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.fullPath}>
                    <TableCell className="font-medium">{file.name}</TableCell>
                    <TableCell>{format(file.createdAt, "dd/MM/yyyy HH:mm:ss")}</TableCell>
                    <TableCell>{formatFileSize(file.size)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDownload(file.ref, file.name)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setIsDeleting(file.ref)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </CardContent>

      <AlertDialog open={isDeleting !== null} onOpenChange={(open) => !open && setIsDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem a certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isto irá apagar permanentemente o backup do ficheiro "{isDeleting?.name}" da nuvem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleting(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
