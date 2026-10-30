import 'server-only';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';
const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: 'tuneassist-pronto-337764-396c8' });
export const adminDb = getFirestore(app);
export async function authenticatedUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error('UNAUTHORIZED');
  try { return await getAuth(app).verifyIdToken(token, true); }
  catch { throw new Error('UNAUTHORIZED'); }
}

