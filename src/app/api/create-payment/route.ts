
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

  let back_urls: any;
  let metadata: any = {};
  let finalPayerEmail = providedPayerEmail;
  if (!finalPayerEmail && userId) {
    finalPayerEmail = await getPayerEmail(userId);
  }

  const baseSuccessUrl = `${req.nextUrl.origin}/payment/success`;
  const baseFailureUrl = `${req.nextUrl.origin}/payment/failure`;

  switch (type) {
    case 'license':
      back_urls = {
        success: `${req.nextUrl.origin}/payment/register-success`,
        failure: baseFailureUrl,
        pending: baseFailureUrl,
      };
      metadata = { type: 'license' };
      break;
    case 'renewal':
      back_urls = {
        success: `${baseSuccessUrl}?type=renewal&userId=${userId}`,
        failure: baseFailureUrl,
        pending: baseFailureUrl,
      };
      metadata = { user_id: userId, type: 'renewal' };
      break;
    case 'credits':
      back_urls = {
        success: `${baseSuccessUrl}?type=credits&userId=${userId}`,
        failure: baseFailureUrl,
        pending: baseFailureUrl,
      };
      metadata = { user_id: userId, type: 'credits', quantity: 10 };
      break;
    case 'download':
       back_urls = {
        success: `${baseSuccessUrl}?type=download`,
        failure: baseFailureUrl,
        pending: baseFailureUrl,
      };
      metadata = { user_id: userId, type: 'download' };
      break;
    default:
        return NextResponse.json({ error: 'Invalid payment type provided.' }, { status: 400 });
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
        metadata: metadata,
        payment_methods: {
            excluded_payment_methods: [],
            excluded_payment_types: [],
            installments: 1, // Number of installments
        },
      };

    if (finalPayerEmail) {
        body.payer = { email: finalPayerEmail };
    }

    const result = await preference.create({ body });

    return NextResponse.json({ id: result.id, init_point: result.init_point });

  } catch (error: any) {
    console.error('Mercado Pago Error:', error);
    let errorMessage = 'Failed to create payment preference';
    if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = error.message as string;
    } else if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
