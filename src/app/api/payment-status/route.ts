import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json({ available: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN && process.env.NEXT_PUBLIC_SITE_URL) }, { headers: { 'Cache-Control': 'no-store' } });
}
