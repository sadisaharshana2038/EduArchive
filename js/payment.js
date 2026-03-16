// ── Payment Page Logic (Firebase) ────────────────────
(async function() {
  const user = await Auth.requireStudent();
  if (!user) return;

  document.getElementById('navAvatar').textContent = user.initials || user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

  let selectedMonth = null;
  let slipDataUrl   = null;

  // ── Pre-select month from URL ──
  const preMonth = new URLSearchParams(window.location.search).get('month');

  // ── Load months from Firestore ──
  const months = await MonthUtils.getAll();

  // ── Render month options ──
  function renderMonthSelector() {
    const container = document.getElementById('monthSelector');
    container.innerHTML = months.map((m, i) => {
      const isUnlocked = (user.unlockedMonths || []).includes(m.id);
      const icon = MonthUtils.monthIcon(i);
      let cls = 'month-opt', badge = '';
      if (isUnlocked) { cls += ' already-unlocked'; badge = `<div class="month-opt-badge"><span class="badge badge-success" style="font-size:10px">✓ Owned</span></div>`; }
      return `
      <div class="${cls}" data-id="${m.id}" data-label="${m.label}" data-icon="${icon}" data-lessons="${m.lessonsCount||0}">
        <div class="month-opt-icon">${icon}</div>
        <div class="month-opt-name">${m.label.replace(' 2026','')}</div>
        ${badge}
      </div>`;
    }).join('');

    // Check pending async per month
    container.querySelectorAll('.month-opt:not(.already-unlocked)').forEach(async el => {
      const isPending = await PaymentUtils.hasPending(user.id, el.dataset.id);
      if (isPending) {
        el.classList.add('pending-payment');
        el.innerHTML += `<div class="month-opt-badge"><span class="badge badge-warning" style="font-size:10px">⏳ Pending</span></div>`;
        return;
      }
      el.addEventListener('click', () => {
        container.querySelectorAll('.month-opt').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        selectedMonth = { id: el.dataset.id, label: el.dataset.label, icon: el.dataset.icon, lessons: el.dataset.lessons };
        updateSummary();
        checkSubmitReady();
      });
      if (preMonth && el.dataset.id === preMonth) { setTimeout(() => el.click(), 100); }
    });
  }

  // ── Bank details (static display) ──
  const bk = DB.bankDetails;
  document.getElementById('bankDetailsBox').innerHTML = `
    <div class="bank-row"><span class="bank-row-label">Bank</span><span class="bank-row-value">${bk.bankName}</span></div>
    <div class="bank-row"><span class="bank-row-label">Account Name</span><span class="bank-row-value">${bk.accountName}</span></div>
    <div class="bank-row">
      <span class="bank-row-label">Account No.</span>
      <span style="display:flex;align-items:center;gap:6px">
        <span class="bank-row-value">${bk.accountNumber}</span>
        <button class="copy-btn" onclick="navigator.clipboard.writeText('${bk.accountNumber}').then(()=>Toast.success('Copied!'))">📋</button>
      </span>
    </div>
    <div class="bank-row"><span class="bank-row-label">Branch</span><span class="bank-row-value">${bk.branch}</span></div>
    <div class="bank-row"><span class="bank-row-label">Amount</span><span class="bank-row-value highlight">${bk.amount}</span></div>
  `;

  // ── Summary ──
  function updateSummary() {
    const c = document.getElementById('summaryContent');
    if (!selectedMonth) { c.innerHTML = `<div class="summary-empty">Select a month above to see the summary.</div>`; return; }
    c.innerHTML = `
      <div class="summary-row"><span class="s-label">Month</span><span class="s-value">${selectedMonth.label}</span></div>
      <div class="summary-row"><span class="s-label">Lessons</span><span class="s-value">${selectedMonth.lessons} Videos</span></div>
      <div class="summary-row"><span class="s-label">Access Type</span><span class="s-value">Lifetime ♾️</span></div>
      <div class="summary-row"><span class="s-label">Student</span><span class="s-value">${user.name}</span></div>
      <div class="summary-total"><span>Total Amount</span><span class="total-amount">LKR 500</span></div>`;
  }

  // ── My submissions ──
  async function renderMyPayments() {
    const card   = document.getElementById('myPaymentsCard');
    const slips  = await PaymentUtils.getUserSlips(user.id);
    if (!slips.length) { card.style.display = 'none'; return; }
    const statusMap = { pending:'badge-warning', approved:'badge-success', rejected:'badge-danger' };
    const statusTxt = { pending:'⏳ Pending', approved:'✓ Approved', rejected:'✕ Rejected' };
    card.innerHTML = `<h3 style="margin-bottom:14px">📄 My Submissions</h3>` +
      slips.map(s => `<div class="my-payment-row">
        <span>${s.monthLabel.replace(' 2026','')}</span>
        <span class="badge ${statusMap[s.status]||'badge-muted'}">${statusTxt[s.status]||s.status}</span>
      </div>`).join('');
  }

  // ── File Upload ──
  const dropZone = document.getElementById('dropZone');
  const slipFile = document.getElementById('slipFile');
  const preview  = document.getElementById('slipPreview');

  dropZone.addEventListener('click', () => slipFile.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  slipFile.addEventListener('change', () => { if (slipFile.files[0]) handleFile(slipFile.files[0]); });

  function handleFile(file) {
    if (file.size > 5 * 1024 * 1024) { Toast.error('File too large. Max 5MB.'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      slipDataUrl = e.target.result;
      dropZone.style.display = 'none';
      preview.style.display  = 'block';
      preview.innerHTML = `<img src="${slipDataUrl}" alt="Slip"/><button class="slip-preview-remove" onclick="window.removeSlip()">✕ Remove</button>`;
      checkSubmitReady();
      Toast.success('Slip uploaded!');
    };
    reader.readAsDataURL(file);
  }

  window.removeSlip = function() {
    slipDataUrl = null; slipFile.value = '';
    dropZone.style.display = 'block';
    preview.style.display  = 'none';
    preview.innerHTML = '';
    checkSubmitReady();
  };

  function checkSubmitReady() {
    document.getElementById('submitBtn').disabled = !(selectedMonth && slipDataUrl);
  }

  // ── Submit ──
  document.getElementById('submitBtn').addEventListener('click', async () => {
    const bank   = document.getElementById('bankSelect').value;
    const note   = document.getElementById('payNote').value;
    const errDiv = document.getElementById('submitError');
    if (!bank) { errDiv.style.display = 'block'; errDiv.textContent = 'Please select your bank.'; return; }
    errDiv.style.display = 'none';
    document.getElementById('submitTxt').style.display    = 'none';
    document.getElementById('submitLoader').style.display = 'block';
    document.getElementById('submitBtn').disabled = true;

    try {
      await PaymentUtils.submit(
        user.id, user.name, user.phone,
        selectedMonth.id, selectedMonth.label,
        bank, note, slipDataUrl
      );
      document.getElementById('successOverlay').classList.add('active');
    } catch (err) {
      console.error(err);
      document.getElementById('submitTxt').style.display    = 'inline';
      document.getElementById('submitLoader').style.display = 'none';
      document.getElementById('submitBtn').disabled = false;
      Toast.error('Submission failed. Please try again.');
    }
  });

  renderMonthSelector();
  updateSummary();
  renderMyPayments();
})();
