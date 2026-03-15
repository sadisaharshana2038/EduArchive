/* =====================================================
   EduArchive Portal — Firebase Configuration
   Project: eduarchive-portal
   ===================================================== */

// Import Firebase SDKs (compat version for CDN use)
// These are loaded via <script> tags in HTML, so we just configure here.

const firebaseConfig = {
  apiKey: "AIzaSyCdpTfqVvmiqkEKnanEtFjUZRjBiCf9tA0",
  authDomain: "vihaga-69969.firebaseapp.com",
  projectId: "vihaga-69969",
  storageBucket: "vihaga-69969.firebasestorage.app",
  messagingSenderId: "1055387328576",
  appId: "1:1055387328576:web:954931db47c2173051ffa5",
  measurementId: "G-H1EXN5KWY8"
};

// Initialize Firebase (compat SDK — globally available after CDN scripts)
firebase.initializeApp(firebaseConfig);

// Export service handles to global scope for use by all page scripts
window.fbAuth    = firebase.auth();
window.fbDb      = firebase.firestore();

// Enable Firestore offline persistence (not supported on file://)
if (window.location.protocol !== 'file:') {
  window.fbDb.enablePersistence({ synchronizeTabs: true })
    .catch(err => {
      if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence: multiple tabs open.');
      } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence: not supported in this browser.');
      }
    });
} else {
  console.info('Firestore persistence disabled for local file view.');
}

console.log('%c🔥 Firebase connected — vihaga-69969', 'color:#6c63ff;font-weight:bold');
