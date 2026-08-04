// =====================================================================
// firebase.js — Firebase initialization (Auth + Firestore)
// =====================================================================
// 1. Go to https://console.firebase.google.com → create a project.
// 2. Enable "Email/Password" under Authentication → Sign-in method.
// 3. Create a Firestore database (Production mode) and apply the rules
//    found in firestore.rules.
// 4. Copy your web app config from Project Settings → General → "Your apps"
//    and paste it below.
// =====================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  runTransaction,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------------------------------------------------------------------
// 🔧 REPLACE WITH YOUR OWN FIREBASE PROJECT CONFIG
// ---------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBlNqJzt_1xY_v1z171xyy8DCoYL-UMUlU",
  authDomain: "link-locker-51809.firebaseapp.com",
  projectId: "link-locker-51809",
  storageBucket: "link-locker-51809.firebasestorage.app",
  messagingSenderId: "902805318013",
  appId: "1:902805318013:web:079aa3061b93e167698414",
  measurementId: "G-ZVZQ1DD596"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Re-export Firestore/Auth helpers so other files only import from here
export {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  runTransaction,
  Timestamp,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
};
