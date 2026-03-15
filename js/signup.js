// ── Sign Up Page Logic ────────────────────────
(function() {
  const form      = document.getElementById('signupForm');
  const btnText   = document.getElementById('signupBtnText');
  const loader    = document.getElementById('signupLoader');
  const signupBtn = document.getElementById('signupBtn');
  const errorDiv  = document.getElementById('signupError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name     = document.getElementById('name').value.trim();
    const phone    = document.getElementById('phone').value.trim().replace(/\s/g, '');
    const password = document.getElementById('password').value;

    errorDiv.style.display = 'none';
    signupBtn.disabled = true;
    btnText.style.display = 'none';
    loader.style.display = 'block';

    try {
      // 1. Generate fake email
      const email = phone + '@eduarchive.app';

      // 2. Create Auth User
      const cred = await fbAuth.createUserWithEmailAndPassword(email, password);
      
      // 3. Create Firestore Document
      await fbDb.collection('users').doc(cred.user.uid).set({
        name,
        phone,
        role: 'student',
        unlockedMonths: [],
        joinedAt: firebase.firestore.Timestamp.now()
      });

      Toast.success('Account created! Welcome, ' + name.split(' ')[0]);
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1500);

    } catch (err) {
      console.error('Signup error:', err);
      signupBtn.disabled = false;
      btnText.style.display = 'inline';
      loader.style.display = 'none';
      errorDiv.style.display = 'block';

      const messages = {
        'auth/email-already-in-use': 'This phone number is already registered.',
        'auth/invalid-email':    'Invalid phone number format.',
        'auth/weak-password':     'Password is too weak. Min. 6 chars.',
        'auth/network-request-failed': 'Connection failed. Check your internet.'
      };
      errorDiv.textContent = messages[err.code] || err.message || 'Registration failed. Please try again.';
    }
  });

  // Phone number input — digits only
  document.getElementById('phone').addEventListener('input', function() {
    this.value = this.value.replace(/[^0-9]/g, '').slice(0, 11);
  });
})();
