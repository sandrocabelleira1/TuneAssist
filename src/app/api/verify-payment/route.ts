import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { authenticatedUser, adminDb } from '@/lib/firebase/admin';
import { paymentProducts, PaymentType } from '@/lib/payment-products';
import { addMonths } from 'date-fns';
export async function POST(req: NextRequest) {
  try {
    const user = await authenticatedUser(req);
    const { paymentId } = await req.json();
    if (!/^\d{1,30}$/.test(String(paymentId))) return NextResponse.json({ error: 'Pagamento inválido.' }, { status: 400 });
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) return NextResponse.json({ error: 'Verificação indisponível.' }, { status: 503 });
    const payment = await new Payment(new MercadoPagoConfig({ accessToken })).get({ id: String(paymentId) });
    const type = payment.metadata?.type as PaymentType;
    if (!Object.prototype.hasOwnProperty.call(paymentProducts, type ?? '') || payment.metadata?.user_id !== user.uid || payment.external_reference !== user.uid || payment.status !== 'approved' || payment.currency_id !== 'BRL' || payment.transaction_amount !== paymentProducts[type].price || (payment.transaction_amount_refunded ?? 0) !== 0) {
      return NextResponse.json({ error: 'Pagamento ainda não confirmado para esta conta.' }, { status: 409 });
    }
    const receipt = adminDb.doc('paymentReceipts/' + payment.id);
    const profile = adminDb.doc('users/' + user.uid);
    await adminDb.runTransaction(async transaction => {
      const [existing, account] = await Promise.all([transaction.get(receipt), transaction.get(profile)]);
      if (existing.exists) {
        if (existing.data()?.userId !== user.uid) throw new Error('Receipt ownership mismatch');
        return;
      }
      const data = account.data() ?? {};
      const changes: Record<string, unknown> = { id: user.uid, email: user.email ?? null };
      if (type === 'credits') changes.credits = (data.credits ?? 0) + 10;
      else {
        const expiry = new Date(data.licenseExpiryDate ?? 0);
        changes.licenseExpiryDate = addMonths(expiry > new Date() ? expiry : new Date(), 6).toISOString();
      }
      transaction.set(profile, changes, { merge: true });
      transaction.create(receipt, { userId: user.uid, type, amount: payment.transaction_amount, processedAt: new Date().toISOString() });
    });
    return NextResponse.json({ verified: true });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED';
    return NextResponse.json({ error: unauthorized ? 'Entre na conta usada no pagamento.' : 'Não foi possível confirmar. Tente novamente ou contacte o suporte com o comprovante.' }, { status: unauthorized ? 401 : 500 });
  }
}

