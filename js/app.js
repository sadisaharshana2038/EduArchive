/* =====================================================
   EduArchive Portal — Core App (Firebase Version)
   All Auth, DB reads/writes go through Firebase.
   ===================================================== */

// ── Firebase helpers shorthand ──────────────────────
const FieldValue = firebase.firestore.FieldValue;
const Timestamp  = firebase.firestore.Timestamp;

// ── Static bank details (display only) ──────────────
const DB = {
  bankDetails: {
    bankName:      "HNB BANK",
    accountName:   "VT LAKSHAN",
    accountNumber: "010020530179",
    branch:        "Anuradhapura",
    amount:        "LKR 500 per month",
  }
};

// ── Auth Module ──────────────────────────────────────
const Auth = {
  // Convert phone to fake email for Firebase Auth
  _toEmail(phone) {
    return phone.replace(/\s/g, '') + '@eduarchive.app';
  },

  // Login: email/password via Firebase Auth
  async login(phone, password) {
    const email = this._toEmail(phone);
    const cred  = await fbAuth.signInWithEmailAndPassword(email, password);
    return cred.user;
  },

  // Logout
  async logout() {
    await fbAuth.signOut();
    window.location.href = 'index.html';
  },

  // Get currently signed-in Firebase user (sync snapshot)
  getFirebaseUser() {
    return fbAuth.currentUser;
  },

  // Get user profile doc from Firestore
  async getCurrentUser() {
    const fu = fbAuth.currentUser;
    if (!fu) return null;
    const snap = await fbDb.collection('users').doc(fu.uid).get();
    if (!snap.exists) return null;
    return { id: fu.uid, ...snap.data() };
  },

  // Wait for auth state, then get profile
  async requireStudent() {
    return new Promise((resolve) => {
      fbAuth.onAuthStateChanged(async (fu) => {
        if (!fu) { window.location.href = 'index.html'; resolve(null); return; }
        const snap = await fbDb.collection('users').doc(fu.uid).get();
        if (!snap.exists) { window.location.href = 'index.html'; resolve(null); return; }
        const user = { id: fu.uid, ...snap.data() };
        if (user.role === 'admin') { window.location.href = 'admin.html'; resolve(null); return; }
        resolve(user);
      });
    });
  },

  async requireAdmin() {
    return new Promise((resolve) => {
      fbAuth.onAuthStateChanged(async (fu) => {
        if (!fu) { window.location.href = 'index.html'; resolve(null); return; }
        const snap = await fbDb.collection('users').doc(fu.uid).get();
        if (!snap.exists) { window.location.href = 'index.html'; resolve(null); return; }
        const user = { id: fu.uid, ...snap.data() };
        if (user.role !== 'admin') { window.location.href = 'dashboard.html'; resolve(null); return; }
        resolve(user);
      });
    });
  },

  // Check if user has access to a month
  async hasAccess(uid, monthId) {
    const snap = await fbDb.collection('users').doc(uid).get();
    if (!snap.exists) return false;
    return (snap.data().unlockedMonths || []).includes(monthId);
  },

  // Unlock a month for a user
  async unlockMonth(uid, monthId) {
    await fbDb.collection('users').doc(uid).update({
      unlockedMonths: FieldValue.arrayUnion(monthId)
    });
  }
};

// ── Toast Notifications ────────────────────────────────
const Toast = {
  show(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span style="font-size:16px;flex-shrink:0">${icons[type] || icons.info}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error'); },
  info(msg)    { this.show(msg, 'info'); }
};

// ── Month Utilities ────────────────────────────────────
const MonthUtils = {
  ICONS: ['🎯','📘','🚀','💡','🔬','🎨','🛠️','📊','🌐','⚡','🧩','🏆'],

  // Fetch all months ordered by releaseDate
  async getAll() {
    const snap = await fbDb.collection('months').orderBy('releaseDate').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // Fetch a single month
  async getById(monthId) {
    const snap = await fbDb.collection('months').doc(monthId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  },

  // Fetch lessons for a month, ordered
  async getLessons(monthId) {
    const snap = await fbDb.collection('lessons')
      .where('monthId', '==', monthId)
      .get();
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  isReleased(month) {
    if (!month?.releaseDate) return false;
    const ts = month.releaseDate.toDate ? month.releaseDate.toDate() : new Date(month.releaseDate);
    return ts <= new Date();
  },

  monthIcon(index) { return this.ICONS[index % this.ICONS.length]; },
};

// ── Payment Utilities ──────────────────────────────────
const PaymentUtils = {
  // Fetch all slips (admin)
  async getSlips() {
    const snap = await fbDb.collection('paymentSlips').orderBy('submittedAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // Fetch pending slips (admin)
  async getPending() {
    const snap = await fbDb.collection('paymentSlips')
      .where('status', '==', 'pending')
      .get();
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const tA = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt);
        const tB = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt);
        return tB - tA;
      });
  },

  // Fetch slips for a specific user
  async getUserSlips(uid) {
    const snap = await fbDb.collection('paymentSlips')
      .where('userId', '==', uid)
      .get();
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const tA = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt);
        const tB = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt);
        return tB - tA;
      });
  },

  // Check if user has a pending slip for a month
  async hasPending(uid, monthId) {
    const snap = await fbDb.collection('paymentSlips')
      .where('userId', '==', uid)
      .where('monthId', '==', monthId)
      .where('status', '==', 'pending')
      .get();
    return !snap.empty;
  },

  // Submit a new payment slip
  async submit(userId, userName, userPhone, monthId, monthLabel, bank, note, slipDataUrl) {
    await fbDb.collection('paymentSlips').add({
      userId, userName, userPhone,
      monthId, monthLabel,
      bank, note,
      slipUrl:     slipDataUrl || '',
      amount:      500,
      status:      'pending',
      submittedAt: Timestamp.now(),
    });
    return true;
  },

  // Approve: mark slip approved + unlock month for user
  async approve(slipId) {
    const slipRef = fbDb.collection('paymentSlips').doc(slipId);
    const snap    = await slipRef.get();
    if (!snap.exists) return false;
    const { userId, monthId } = snap.data();
    const batch = fbDb.batch();
    batch.update(slipRef, { status: 'approved' });
    batch.update(fbDb.collection('users').doc(userId), {
      unlockedMonths: FieldValue.arrayUnion(monthId)
    });
    await batch.commit();
    return true;
  },

  // Reject a slip
  async reject(slipId) {
    await fbDb.collection('paymentSlips').doc(slipId).update({ status: 'rejected' });
    return true;
  },
};

// ── Disable right-click globally ──────────────────────
document.addEventListener('contextmenu', e => e.preventDefault());

// ── Prevent keyboard shortcuts on player ─────────────
document.addEventListener('keydown', e => {
  if (document.querySelector('.video-secure-wrapper:hover')) {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }
});
