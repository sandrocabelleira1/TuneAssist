import { NextRequest, NextResponse } from 'next/server';
import { authenticatedUser, adminDb } from '@/lib/firebase/admin';
export async function POST(req: NextRequest) {
  try {
    const user = await authenticatedUser(req);
    await adminDb.runTransaction(async transaction => {
      const ref = adminDb.doc('users/' + user.uid);
      const profile = await transaction.get(ref);
      const data = profile.data();
      const expiry = new Date(data?.licenseExpiryDate ?? 0).getTime();
      if (!data || !Number.isFinite(expiry) || expiry <= Date.now() || !Number.isSafeInteger(data.credits) || data.credits < 3) throw new Error('FORBIDDEN');
      transaction.update(ref, { credits: data.credits - 3 });
    });
    return NextResponse.json({ consumed: 3 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: 'Não foi possível autorizar o download.' }, { status: message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500 });
  }
}
