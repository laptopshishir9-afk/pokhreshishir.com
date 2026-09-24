import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import config from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(config) : getApp();

export const db = getFirestore(app, config.firestoreDatabaseId || '(default)');

export {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  getDocs,
  Timestamp,
};
