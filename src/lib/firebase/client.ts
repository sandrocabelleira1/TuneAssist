// IMPORTANT: Add your Firebase project's configuration to a new .env.local file
// See https://firebase.google.com/docs/web/setup#add-sdks-initialize

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from '@/firebase/config';
import { getAuth } from 'firebase/auth';


// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };
