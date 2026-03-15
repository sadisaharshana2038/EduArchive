// ── Login Page Logic (Firebase) ───────────────────────
(function() {
  // If already signed in, redirect
  fbAuth.onAuthStateChanged(async (fu) => {
    if (!fu) return; // Stay on login page
    try {
      const snap = await fbDb.collection('users').doc(fu.uid).get();
      if (snap.exists) {
        const role = snap.data().role;
        window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
      }
    } catch(e) { /* stay on page */ }
  });

  const form      = document.getElementById('loginForm');
  const btnText   = document.getElementById('loginBtnText');
  const btnLoader = document.getElementById('btnLoader');
  const loginBtn  = document.getElementById('loginBtn');
  const errorDiv  = document.getElementById('loginError');
  const togglePwdBtn = document.getElementById('togglePwd');
  const pwdInput  = document.getElementById('password');

  // Toggle password visibility
  togglePwdBtn.addEventListener('click', () => {
    const isText = pwdInput.type === 'text';
    pwdInput.type = isText ? 'password' : 'text';
    togglePwdBtn.innerHTML = isText
      ? `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  });

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone    = document.getElementById('phone').value.trim().replace(/\s/g, '');
    const password = pwdInput.value;

    errorDiv.style.display = 'none';
    loginBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'block';

    try {
      await Auth.login(phone, password);
      // onAuthStateChanged handled elsewhere
      Toast.success('Logging you in...');
    } catch (err) {
      console.error('Login error:', err);
      loginBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoader.style.display = 'none';
      errorDiv.style.display = 'block';

      const messages = {
        'auth/user-not-found':    'No account found with this phone number.',
        'auth/wrong-password':    'Incorrect password. Please try again.',
        'auth/invalid-credential':'Incorrect phone number or password.',
        'auth/too-many-requests': 'Too many attempts. Please wait a moment.',
        'permission-denied':      'Server error: The project may be suspended or disabled.',
        'auth/network-request-failed': 'Connection failed. Check your internet.',
      };
      errorDiv.textContent = messages[err.code] || err.message || 'Sign in failed. Please check your credentials.';
      pwdInput.value = '';
    } finally {
      // Safety timeout to reset button if no response within 10s
      setTimeout(() => {
        if (loginBtn.disabled && btnLoader.style.display === 'block') {
          loginBtn.disabled = false;
          btnText.style.display = 'inline';
          btnLoader.style.display = 'none';
          errorDiv.style.display = 'block';
          errorDiv.textContent = 'Connection timeout. The Firebase project might be suspended.';
        }
      }, 10000);
    }
  });

  // Phone number input — digits only
  document.getElementById('phone').addEventListener('input', function() {
    this.value = this.value.replace(/[^0-9]/g, '').slice(0, 11);
  });
})();
