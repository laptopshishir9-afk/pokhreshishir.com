// Centralized visitor message storage and owner single-seat access manager.
// Integrated with Firebase Firestore so messages submitted from any visitor anywhere in the world
// are synced in real time to Shishir's Seat Admin across all devices (Mobile & Laptop).

import {
  db,
  doc,
  setDoc,
  collection,
  onSnapshot,
  deleteDoc,
  updateDoc,
} from './firebase';

export interface VisitorMessage {
  id: string;
  name: string;
  email: string;
  subject?: string;
  message: string;
  timestamp: number;
  read: boolean;
  replied?: boolean;
}

const STORAGE_KEY = 'shishir_portfolio_visitor_messages';
const ADMIN_PASSWORD_KEY = 'shishir_secret_admin_password';
const AUTH_SESSION_KEY = 'shishir_admin_authenticated';
const DEVICE_OWNER_TOKEN_KEY = 'shishir_device_owner_token';
const FAILED_ATTEMPTS_KEY = 'shishir_seat_failed_attempts';
const DEVICE_BLOCKED_KEY = 'shishir_seat_device_blocked';

// Listeners for real-time reactivity
type Listener = (messages: VisitorMessage[]) => void;
const listeners: Listener[] = [];
let firestoreMessagesInitialized = false;

function getStoredMessages(): VisitorMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse visitor messages from localStorage', err);
    return [];
  }
}

function setStoredMessages(messages: VisitorMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    notifyListeners(messages);
  } catch (err) {
    console.error('Failed to save visitor messages to localStorage', err);
  }
}

function notifyListeners(messages: VisitorMessage[]): void {
  listeners.forEach((listener) => {
    try {
      listener(messages);
    } catch (e) {
      console.error('Error notifying message listener', e);
    }
  });
}

function initFirestoreMessagesSync() {
  if (firestoreMessagesInitialized || typeof window === 'undefined') return;
  firestoreMessagesInitialized = true;

  try {
    const messagesCol = collection(db, 'visitor_messages');
    onSnapshot(
      messagesCol,
      (snapshot) => {
        const cloudMessages: VisitorMessage[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as VisitorMessage;
          if (data && data.name) {
            cloudMessages.push({
              ...data,
              id: docSnap.id,
            });
          }
        });

        if (cloudMessages.length > 0) {
          // Sort newest first
          cloudMessages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          setStoredMessages(cloudMessages);
        }
      },
      (err) => {
        console.warn('Firestore messages listener note:', err);
      }
    );
  } catch (err) {
    console.error('Failed to initialize Firestore message sync', err);
  }
}

if (typeof window !== 'undefined') {
  initFirestoreMessagesSync();
}

export function subscribeVisitorMessages(listener: Listener): () => void {
  listeners.push(listener);
  listener(getStoredMessages());
  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
}

export async function saveVisitorMessage(msg: {
  name: string;
  email: string;
  subject?: string;
  message: string;
}): Promise<{ success: boolean; messageId: string }> {
  const current = getStoredMessages();
  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newMessage: VisitorMessage = {
    id,
    name: msg.name.trim(),
    email: msg.email.trim(),
    subject: msg.subject?.trim() || 'General Inquiry',
    message: msg.message.trim(),
    timestamp: Date.now(),
    read: false,
    replied: false,
  };

  setStoredMessages([newMessage, ...current]);

  // Sync to Firestore
  try {
    const msgDocRef = doc(db, 'visitor_messages', id);
    await setDoc(msgDocRef, newMessage);
  } catch (err) {
    console.warn('Saved locally, Firestore sync queued', err);
  }

  return { success: true, messageId: newMessage.id };
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  const current = getStoredMessages();
  const updated = current.map((m) =>
    m.id === messageId ? { ...m, read: true } : m
  );
  setStoredMessages(updated);

  try {
    const msgDocRef = doc(db, 'visitor_messages', messageId);
    await updateDoc(msgDocRef, { read: true });
  } catch {
    // Ignore
  }
}

export async function markMessageAsReplied(messageId: string): Promise<void> {
  const current = getStoredMessages();
  const updated = current.map((m) =>
    m.id === messageId ? { ...m, replied: true, read: true } : m
  );
  setStoredMessages(updated);

  try {
    const msgDocRef = doc(db, 'visitor_messages', messageId);
    await updateDoc(msgDocRef, { replied: true, read: true });
  } catch {
    // Ignore
  }
}

export async function deleteVisitorMessage(messageId: string): Promise<void> {
  const current = getStoredMessages();
  const updated = current.filter((m) => m.id !== messageId);
  setStoredMessages(updated);

  try {
    const msgDocRef = doc(db, 'visitor_messages', messageId);
    await deleteDoc(msgDocRef);
  } catch {
    // Ignore
  }
}

export function clearAllMessages(): void {
  setStoredMessages([]);
}

export function getUnreadMessagesCount(): number {
  return getStoredMessages().filter((m) => !m.read).length;
}

export function getAllMessages(): VisitorMessage[] {
  return getStoredMessages();
}

export const getVisitorMessages = getAllMessages;

export function toggleMessageRead(messageId: string): void {
  const current = getStoredMessages();
  const updated = current.map((m) =>
    m.id === messageId ? { ...m, read: !m.read } : m
  );
  setStoredMessages(updated);

  const target = updated.find((m) => m.id === messageId);
  if (target) {
    try {
      const msgDocRef = doc(db, 'visitor_messages', messageId);
      updateDoc(msgDocRef, { read: target.read }).catch(() => {});
    } catch {
      // Ignore
    }
  }
}

export function setupFirstTimeSecretPassword(newPassword: string): boolean {
  if (typeof window === 'undefined') return false;
  const cleanPass = newPassword.trim();
  if (cleanPass.length < 3) return false;

  try {
    localStorage.setItem(ADMIN_PASSWORD_KEY, cleanPass);
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
    return true;
  } catch (err) {
    console.error('Failed to set secret password', err);
    return false;
  }
}

// -------------------------------------------------------------
// SINGLE SEAT AUTHENTICATION (RESTRICTED TO laptopshishir9@gmail.com)
// -------------------------------------------------------------

export const AUTHORIZED_OWNER_EMAIL = 'laptopshishir9@gmail.com';
export const MASTER_SECRET_PASSWORD = 'Shishir@2010';

export function isAuthorizedOwnerEmail(email: string): boolean {
  const clean = email.trim().toLowerCase();
  return (
    clean === 'laptopshishir9@gmail.com' ||
    clean === 'laptopshishir9' ||
    clean === 'laptopshishir' ||
    clean === 'laptopshishir@gmail.com'
  );
}

export function hasAdminPasswordSet(): boolean {
  return true;
}

export function isDeviceBlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DEVICE_BLOCKED_KEY) === 'true';
}

export function checkIsAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  const isSessionAuth = sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';
  const isDeviceAuth =
    localStorage.getItem(DEVICE_OWNER_TOKEN_KEY) === 'authorized_owner_laptopshishir9';
  return isSessionAuth || isDeviceAuth;
}

export function loginSingleSeat(
  enteredPasswordOrEmail: string,
  optionalPassword?: string
): { success: boolean; error?: string } {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Browser environment required.' };
  }

  if (isDeviceBlocked()) {
    return {
      success: false,
      error: 'Access Blocked: Security lockout triggered on this device. Single Owner Seat is protected.',
    };
  }

  let email = '';
  let password = '';

  if (optionalPassword !== undefined) {
    email = enteredPasswordOrEmail.trim();
    password = optionalPassword.trim();
  } else {
    password = enteredPasswordOrEmail.trim();
  }

  if (email && !isAuthorizedOwnerEmail(email)) {
    return {
      success: false,
      error: `Access Denied: Seat admin is strictly reserved for ${AUTHORIZED_OWNER_EMAIL}.`,
    };
  }

  const storedPassword = localStorage.getItem(ADMIN_PASSWORD_KEY);
  const matchesCustom = storedPassword && password === storedPassword.trim();
  const matchesMaster = password === MASTER_SECRET_PASSWORD;

  if (matchesCustom || matchesMaster) {
    localStorage.removeItem(FAILED_ATTEMPTS_KEY);
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
    localStorage.setItem(DEVICE_OWNER_TOKEN_KEY, 'authorized_owner_laptopshishir9');
    return { success: true };
  }

  const currentAttempts =
    parseInt(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '0', 10) + 1;
  localStorage.setItem(FAILED_ATTEMPTS_KEY, currentAttempts.toString());

  if (currentAttempts >= 3) {
    localStorage.setItem(DEVICE_BLOCKED_KEY, 'true');
    return {
      success: false,
      error: 'Too many failed attempts! Access to Single Owner Seat is now locked on this device.',
    };
  }

  return {
    success: false,
    error: `Incorrect credentials. Access denied (${3 - currentAttempts} attempts remaining).`,
  };
}

export function updateSecretPassword(
  oldPassword: string,
  newPassword: string
): { success: boolean; error?: string } {
  const cleanOld = oldPassword.trim();
  const storedPassword = localStorage.getItem(ADMIN_PASSWORD_KEY);

  const isOldValid =
    (storedPassword && cleanOld === storedPassword.trim()) ||
    cleanOld === MASTER_SECRET_PASSWORD;

  if (!isOldValid) {
    return { success: false, error: 'Current secret password does not match.' };
  }

  if (newPassword.trim().length < 3) {
    return { success: false, error: 'New password must be at least 3 characters long.' };
  }

  try {
    localStorage.setItem(ADMIN_PASSWORD_KEY, newPassword.trim());
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to save updated password.' };
  }
}

export function logoutSingleSeat(): void {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(DEVICE_OWNER_TOKEN_KEY);
}
