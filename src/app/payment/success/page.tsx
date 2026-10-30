'use client';
import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import Link from 'next/link';
export default function PaymentSuccessPage() {
  const { user, isUserLoading } = useUser();
  const [message, setMessage] = useState('A verificar o pagamento...');
  useEffect(() => {
    if (isUserLoading) return;
    if (!user) { setMessage('Entre na conta usada no pagamento e volte a esta página para confirmar.'); return; }
    let active = true;
    async function verify() {
      try {
        const paymentId = new URLSearchParams(window.location.search).get('payment_id');
        const token = await user!.getIdToken();
        const response = await fetch('/api/verify-payment', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ paymentId }) });
        const data = await response.json();
        if (active) setMessage(response.ok ? 'Pagamento confirmado. Sua conta foi atualizada.' : data.error);
      } catch { if (active) setMessage('Verificação indisponível. Recarregue esta página para tentar novamente.'); }
    }
    void verify();
    return () => { active = false; };
  }, [user, isUserLoading]);
  return <main className="min-h-screen grid place-content-center gap-6 p-6 text-center"><h1 className="text-2xl">Confirmação de pagamento</h1><p>{message}</p><Link href="/tuner">Voltar para a ferramenta</Link></main>;
}

