
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';

export async function POST(req: NextRequest) {
  const { title, unit_price, quantity, userId } = await req.json();

  if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Mercado Pago access token is not configured.' }, { status: 500 });
  }

  const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
  const preference = new Preference(client);

  try {
    const result = await preference.create({
      body: {
        items: [
          {
            title: title,
            quantity: quantity,
            unit_price: unit_price,
            currency_id: 'BRL',
          },
        ],
        payer: {
            // Eventually you might pass user email here
        },
        back_urls: {
          success: `${req.nextUrl.origin}/payment/success`,
          failure: `${req.nextUrl.origin}/payment/failure`,
          pending: `${req.nextUrl.origin}/payment/pending`,
        },
        auto_return: 'approved',
        metadata: {
            user_id: userId
        }
      },
    });

    return NextResponse.json({ id: result.id, init_point: result.init_point });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create payment preference' }, { status: 500 });
  }
}
