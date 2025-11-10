
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase/client'; // Assuming you have a client-initialized db export

const getPayerEmail = async (userId?: string): Promise<string | undefined> => {
    if (!userId) return undefined;
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            return userDoc.data().email;
        }
    } catch (error) {
        console.error("Error fetching user email:", error);
    }
    return undefined;
};


export async function POST(req: NextRequest) {
  const { type, title, unit_price, quantity, userId, payerEmail: providedPayerEmail } = await req.json();

  if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Mercado Pago access token is not configured.' }, { status: 500 });
  }
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  const client = new MercadoPagoConfig({ accessToken });
  const preference = new Preference(client);

  let back_urls;
  let metadata: any = {};
  let finalPayerEmail = providedPayerEmail;
  if (!finalPayerEmail && userId) {
    finalPayerEmail = await getPayerEmail(userId);
  }

  if (type === 'license') {
    back_urls = {
        success: `${req.nextUrl.origin}/payment/register-success`,
        failure: `${req.nextUrl.origin}/payment/failure`,
        pending: `${req.nextUrl.origin}/payment/failure`,
    };
    metadata = { type: 'license' };
  } else if (type === 'renewal') {
     back_urls = {
        success: `${req.nextUrl.origin}/payment/success?type=renewal&userId=${userId}`,
        failure: `${req.nextUrl.origin}/payment/failure`,
        pending: `${req.nextUrl.origin}/payment/failure`,
    };
    metadata = { user_id: userId, type: 'renewal' };
  } else if (type === 'credits') {
    back_urls = {
        success: `${req.nextUrl.origin}/payment/success?type=credits&userId=${userId}`,
        failure: `${req.nextUrl.origin}/payment/failure`,
        pending: `${req.nextUrl.origin}/payment/failure`,
    };
    metadata = { user_id: userId, type: 'credits', quantity: 10 };
  } else { // 'download'
    back_urls = {
        success: `${req.nextUrl.origin}/payment/success?type=download`,
        failure: `${req.nextUrl.origin}/payment/failure`,
        pending: `${req.nextUrl.origin}/payment/pending`,
    };
    metadata = { user_id: userId, type: 'download' };
  }


  try {
    const body: any = {
        items: [
          {
            title: title,
            quantity: quantity,
            unit_price: unit_price,
            currency_id: 'BRL',
          },
        ],
        back_urls: back_urls,
        auto_return: 'approved',
        metadata: metadata
      };

    if (finalPayerEmail) {
        body.payer = { email: finalPayerEmail };
    }

    const result = await preference.create({ body });

    return NextResponse.json({ id: result.id, init_point: result.init_point });

  } catch (error) {
    console.error('Mercado Pago Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create payment preference';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
