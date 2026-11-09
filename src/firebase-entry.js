// Firebase for Watch List, bundled into fb.js (see build.sh).
// Uses the modular SDK so only what the app needs is shipped, and starts sign-in
// WITHOUT the redirect helper: that helper loads a hidden page from firebaseapp.com
// on every open, which is slow on iPhones. It's passed only when signing in with Google.
import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, GoogleAuthProvider, connectAuthEmulator
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, deleteField
} from "firebase/firestore";

function start(config, opts) {
  opts = opts || {};
  const app = initializeApp(config);
  const a = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  let db;
  try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { db = initializeFirestore(app, {}); }
  if (opts.emulator) { connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(db, "127.0.0.1", 8089); }

  const wrapDoc = s => ({ id: s.id, exists: s.exists(), data: () => s.data() });
  const docRef = path => {
    const r = doc(db, path);
    return {
      onSnapshot: (fn, err, o) => onSnapshot(r, o || {}, s => fn(wrapDoc(s)), err),
      set: (data, o) => setDoc(r, data, o || {}),
      update: data => updateDoc(r, data),
      delete: () => deleteDoc(r)
    };
  };
  const colRef = path => {
    const r = collection(db, path);
    return {
      doc: id => docRef(path + "/" + id),
      onSnapshot: (fn, err, o) => onSnapshot(r, o || {}, fn, err)
    };
  };
  const fs = { doc: docRef, collection: colRef };
  const auth = {
    onAuthStateChanged: fn => onAuthStateChanged(a, fn),
    signInWithPopup: p => signInWithPopup(a, p, browserPopupRedirectResolver),
    signInWithRedirect: p => signInWithRedirect(a, p, browserPopupRedirectResolver),
    getRedirectResult: () => getRedirectResult(a, browserPopupRedirectResolver),
    createUserWithEmailAndPassword: (e, p) => createUserWithEmailAndPassword(a, e, p),
    signInWithEmailAndPassword: (e, p) => signInWithEmailAndPassword(a, e, p),
    signOut: () => signOut(a)
  };
  return { fs, auth, GoogleAuthProvider, FieldValue: { arrayUnion, arrayRemove, delete: deleteField } };
}
window.WLFB = { start };
