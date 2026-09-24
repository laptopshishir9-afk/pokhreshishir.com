// Photo and College Logo manager integrated with Firebase Firestore.
// Ensures that whenever Shishir updates his photo or college logo in Seat Admin,
// it instantly synchronizes across ALL devices (Mobile phones, tablets, laptops) in real-time.

import { db, doc, getDoc, setDoc, onSnapshot } from './firebase';

const STORAGE_KEY = 'shishir_real_profile_photo';
const EVENT_NAME = 'shishir_photo_updated';

const SCHOOL_LOGO_KEY = 'shishir_school_logo_data';
const SCHOOL_LOGO_EVENT = 'shishir_school_logo_updated';

// Universal relative paths that work on GitHub Pages, preview and production
const baseUrl =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
    ? import.meta.env.BASE_URL
    : './';
const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

export const DEFAULT_PHOTO_PATHS = [
  `${prefix}assets/shishir-photo.jpg`,
  `${prefix}assets/shishir-photo.png`,
  `${prefix}assets/shishir-avatar.svg`,
  `${prefix}assets/profile.jpg`,
  './assets/shishir-photo.jpg',
  './assets/shishir-avatar.svg',
  'assets/shishir-photo.jpg',
];

export const DEFAULT_COLLEGE_LOGO_PATHS = [
  `${prefix}assets/college-logo.png`,
  `${prefix}assets/college-logo.jpg`,
  `${prefix}assets/everest-logo.svg`,
  `${prefix}assets/school-logo.png`,
  './assets/college-logo.png',
  './assets/everest-logo.svg',
  'assets/college-logo.png',
];

// In-memory caches for fast, zero-latency synchronous access
let cachedProfilePhoto: string | null = null;
let cachedSchoolLogo: string | null = null;

// Populate initial cache from localStorage if available
if (typeof window !== 'undefined') {
  try {
    cachedProfilePhoto = localStorage.getItem(STORAGE_KEY);
    cachedSchoolLogo = localStorage.getItem(SCHOOL_LOGO_KEY);
  } catch {
    // Ignore storage issues
  }
}

// Active subscribers
const photoSubscribers = new Set<(url: string | null) => void>();
const logoSubscribers = new Set<(url: string | null) => void>();

function notifyPhotoSubscribers(url: string | null) {
  cachedProfilePhoto = url;
  photoSubscribers.forEach((cb) => {
    try {
      cb(url);
    } catch (e) {
      console.error('Error notifying photo subscriber', e);
    }
  });
}

function notifyLogoSubscribers(url: string | null) {
  cachedSchoolLogo = url;
  logoSubscribers.forEach((cb) => {
    try {
      cb(url);
    } catch (e) {
      console.error('Error notifying logo subscriber', e);
    }
  });
}

let firestoreInitialized = false;

// Initialize real-time cross-device sync via Firestore
function initFirestoreSync() {
  if (firestoreInitialized || typeof window === 'undefined') return;
  firestoreInitialized = true;

  try {
    // 1. Real-time listener on site_media/default (canonical collection document)
    const defaultDocRef = doc(db, 'site_media', 'default');
    onSnapshot(
      defaultDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data) {
            // Profile photo from cloud
            const cloudPhoto = data.ownerPhoto || data.photoUrl;
            if (cloudPhoto && cloudPhoto !== cachedProfilePhoto) {
              try {
                localStorage.setItem(STORAGE_KEY, cloudPhoto);
              } catch {
                // Ignore quota
              }
              notifyPhotoSubscribers(cloudPhoto);
              window.dispatchEvent(
                new CustomEvent(EVENT_NAME, { detail: cloudPhoto })
              );
            }

            // College logo from cloud
            const cloudLogo = data.collegeLogo || data.logoUrl;
            if (cloudLogo && cloudLogo !== cachedSchoolLogo) {
              try {
                localStorage.setItem(SCHOOL_LOGO_KEY, cloudLogo);
              } catch {
                // Ignore quota
              }
              notifyLogoSubscribers(cloudLogo);
              window.dispatchEvent(
                new CustomEvent(SCHOOL_LOGO_EVENT, { detail: cloudLogo })
              );
            }
          }
        }
      },
      (err) => {
        console.warn('Firestore real-time default media listener note:', err);
      }
    );

    // 2. Real-time listener on site_media/profile_photo for backward compatibility
    const photoDocRef = doc(db, 'site_media', 'profile_photo');
    onSnapshot(
      photoDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const cloudPhoto = data?.photoUrl || data?.ownerPhoto;
          if (cloudPhoto && cloudPhoto !== cachedProfilePhoto) {
            try {
              localStorage.setItem(STORAGE_KEY, cloudPhoto);
            } catch {
              // Ignore quota
            }
            notifyPhotoSubscribers(cloudPhoto);
            window.dispatchEvent(
              new CustomEvent(EVENT_NAME, { detail: cloudPhoto })
            );
          }
        }
      },
      (err) => {
        console.warn('Firestore real-time profile_photo listener note:', err);
      }
    );

    // 3. Fast initial fetch directly on launch so other devices get it immediately
    getDoc(defaultDocRef)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const cloudPhoto = data?.ownerPhoto || data?.photoUrl;
          if (cloudPhoto) {
            try {
              localStorage.setItem(STORAGE_KEY, cloudPhoto);
            } catch {
              // Ignore
            }
            notifyPhotoSubscribers(cloudPhoto);
          }
          const cloudLogo = data?.collegeLogo || data?.logoUrl;
          if (cloudLogo) {
            try {
              localStorage.setItem(SCHOOL_LOGO_KEY, cloudLogo);
            } catch {
              // Ignore
            }
            notifyLogoSubscribers(cloudLogo);
          }
        }
      })
      .catch((err) => {
        console.warn('Initial Firestore media fetch note:', err);
      });
  } catch (err) {
    console.error('Failed to initialize Firestore sync listeners', err);
  }
}

// Auto-run listener in browser
if (typeof window !== 'undefined') {
  initFirestoreSync();
}

// ---------------------------------------------------------------------------
// PROFILE PHOTO METHODS
// ---------------------------------------------------------------------------

export function getStoredProfilePhoto(): string | null {
  if (cachedProfilePhoto) return cachedProfilePhoto;
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function saveStoredProfilePhoto(
  dataUrl: string
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Browser environment required.' };
  }

  // 1. Immediately update local state for 0ms lag
  try {
    localStorage.setItem(STORAGE_KEY, dataUrl);
  } catch (err) {
    console.warn('Local storage write warning', err);
  }
  notifyPhotoSubscribers(dataUrl);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: dataUrl }));

  // 2. Persist to Firebase Firestore so all other devices (phone, laptop, visitors) update
  try {
    const defaultDocRef = doc(db, 'site_media', 'default');
    const photoDocRef = doc(db, 'site_media', 'profile_photo');

    await Promise.all([
      setDoc(
        defaultDocRef,
        {
          ownerPhoto: dataUrl,
          lastUpdated: Date.now(),
          updatedBy: 'laptopshishir9@gmail.com',
        },
        { merge: true }
      ),
      setDoc(
        photoDocRef,
        {
          photoUrl: dataUrl,
          updatedAt: Date.now(),
          author: 'Shishir Pokhrel',
        },
        { merge: true }
      ),
    ]);

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to sync profile photo to Firestore cloud', err);
    return { success: false, error: message };
  }
}

export async function removeStoredProfilePhoto(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
  notifyPhotoSubscribers(null);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: null }));

  try {
    const defaultDocRef = doc(db, 'site_media', 'default');
    const photoDocRef = doc(db, 'site_media', 'profile_photo');
    await Promise.all([
      setDoc(defaultDocRef, { ownerPhoto: '', lastUpdated: Date.now() }, { merge: true }),
      setDoc(photoDocRef, { photoUrl: '', updatedAt: Date.now() }, { merge: true }),
    ]);
    return true;
  } catch (err) {
    console.error('Failed to clear photo in Firestore', err);
    return false;
  }
}

export function subscribeProfilePhoto(
  callback: (photoUrl: string | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  photoSubscribers.add(callback);

  // Trigger once immediately with current value (memory cache or localStorage)
  const initial = getStoredProfilePhoto();
  if (initial) {
    callback(initial);
  }

  // Also query Firestore once to ensure this device hasn't missed any cloud update
  const defaultDocRef = doc(db, 'site_media', 'default');
  getDoc(defaultDocRef)
    .then((snap) => {
      if (snap.exists()) {
        const cloudData = snap.data();
        const cloudPhoto = cloudData?.ownerPhoto || cloudData?.photoUrl;
        if (cloudPhoto) {
          callback(cloudPhoto);
          try {
            localStorage.setItem(STORAGE_KEY, cloudPhoto);
          } catch {
            // Ignore
          }
        }
      }
    })
    .catch(() => {});

  const handleUpdate = (e: Event) => {
    const customEvent = e as CustomEvent<string>;
    callback(customEvent.detail || null);
  };

  window.addEventListener(EVENT_NAME, handleUpdate);

  return () => {
    photoSubscribers.delete(callback);
    window.removeEventListener(EVENT_NAME, handleUpdate);
  };
}

// ---------------------------------------------------------------------------
// COLLEGE / SCHOOL LOGO METHODS
// ---------------------------------------------------------------------------

export function getStoredSchoolLogo(): string | null {
  if (cachedSchoolLogo) return cachedSchoolLogo;
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(SCHOOL_LOGO_KEY);
  } catch {
    return null;
  }
}

export async function saveStoredSchoolLogo(
  dataUrl: string
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Browser environment required.' };
  }

  try {
    localStorage.setItem(SCHOOL_LOGO_KEY, dataUrl);
  } catch (err) {
    console.warn('Local storage write warning', err);
  }
  notifyLogoSubscribers(dataUrl);
  window.dispatchEvent(new CustomEvent(SCHOOL_LOGO_EVENT, { detail: dataUrl }));

  try {
    const defaultDocRef = doc(db, 'site_media', 'default');
    const logoDocRef = doc(db, 'site_media', 'college_logo');

    await Promise.all([
      setDoc(
        defaultDocRef,
        {
          collegeLogo: dataUrl,
          logoUpdatedAt: Date.now(),
        },
        { merge: true }
      ),
      setDoc(
        logoDocRef,
        {
          logoUrl: dataUrl,
          updatedAt: Date.now(),
          school: 'Everest English Boarding Secondary School',
        },
        { merge: true }
      ),
    ]);

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to sync college logo to Firestore cloud', err);
    return { success: false, error: message };
  }
}

export async function removeStoredSchoolLogo(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    localStorage.removeItem(SCHOOL_LOGO_KEY);
  } catch {
    // Ignore
  }
  notifyLogoSubscribers(null);
  window.dispatchEvent(new CustomEvent(SCHOOL_LOGO_EVENT, { detail: null }));

  try {
    const defaultDocRef = doc(db, 'site_media', 'default');
    const logoDocRef = doc(db, 'site_media', 'college_logo');
    await Promise.all([
      setDoc(defaultDocRef, { collegeLogo: '', logoUpdatedAt: Date.now() }, { merge: true }),
      setDoc(logoDocRef, { logoUrl: '', updatedAt: Date.now() }, { merge: true }),
    ]);
    return true;
  } catch (err) {
    console.error('Failed to remove college logo in Firestore', err);
    return false;
  }
}

export function subscribeSchoolLogo(
  callback: (logoUrl: string | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  logoSubscribers.add(callback);

  const initial = getStoredSchoolLogo();
  if (initial) {
    callback(initial);
  }

  // Check Firestore
  const defaultDocRef = doc(db, 'site_media', 'default');
  getDoc(defaultDocRef)
    .then((snap) => {
      if (snap.exists()) {
        const cloudData = snap.data();
        const cloudLogo = cloudData?.collegeLogo || cloudData?.logoUrl;
        if (cloudLogo) {
          callback(cloudLogo);
          try {
            localStorage.setItem(SCHOOL_LOGO_KEY, cloudLogo);
          } catch {
            // Ignore
          }
        }
      }
    })
    .catch(() => {});

  const handleUpdate = (e: Event) => {
    const customEvent = e as CustomEvent<string>;
    callback(customEvent.detail || null);
  };

  window.addEventListener(SCHOOL_LOGO_EVENT, handleUpdate);

  return () => {
    logoSubscribers.delete(callback);
    window.removeEventListener(SCHOOL_LOGO_EVENT, handleUpdate);
  };
}

export function downloadDataUrlFile(dataUrl: string, fileName: string): void {
  if (typeof window === 'undefined') return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export { optimizeImageForUpload as compressImage } from './imageOptimizer';
