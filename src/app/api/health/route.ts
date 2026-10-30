import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json({ status: 'ok', release: 'security-2026-10-30-01' }, { headers: { 'Cache-Control': 'no-store' } });
}
