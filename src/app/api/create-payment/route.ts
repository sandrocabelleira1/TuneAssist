import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { authenticatedUser } from '@/lib/firebase/admin';
import { paymentProducts, PaymentType } from '@/lib/payment-products';
export async function POST(req: NextRequest) {
  try {
    const user = await authenticatedUser(req);
    const { type } = await req.json();
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(paymentProducts, type)) {
      return NextResponse.json({ error: 'Produto inválido.' }, { status: 400 });
    }
    const product = paymentProducts[type as PaymentType];
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!accessToken || !siteUrl) return NextResponse.json({ error: 'Pagamentos indisponíveis.' }, { status: 503 });
    const origin = new URL(siteUrl).origin;
    if (!origin.startsWith('https://')) return NextResponse.json({ error: 'Configuração inválida.' }, { status: 503 });
    const result = await new Preference(new MercadoPagoConfig({ accessToken })).create({ body: {
      items: [{ id: type, title: product.title, quantity: 1, unit_price: product.price, currency_id: 'BRL' }],
      external_reference: user.uid,
      metadata: { user_id: user.uid, type },
      payer: user.email ? { email: user.email } : undefined,
      back_urls: { success: origin + '/payment/success', failure: origin + '/payment/failure', pending: origin + '/payment/failure' },
      auto_return: 'approved',
    } });
    return NextResponse.json({ id: result.id, init_point: result.init_point });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED';
    return NextResponse.json({ error: unauthorized ? 'Faça login para pagar.' : 'Não foi possível iniciar o pagamento.' }, { status: unauthorized ? 401 : 500 });
  }
}

