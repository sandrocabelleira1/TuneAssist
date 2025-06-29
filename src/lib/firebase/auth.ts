'use server';

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { app } from './client';

// This is a server-side file, but auth operations can be called from the client
// thanks to Server Actions.

const auth = getAuth(app);

export async function signUp(email: string, password: string) {
    return createUserWithEmailAndPassword(auth, email, password);
}

export async function signIn(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
}

export async function signOut() {
    return firebaseSignOut(auth);
}
