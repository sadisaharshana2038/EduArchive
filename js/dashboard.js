// ── Dashboard Page Logic (Firebase) ──────────────────
(async function() {
  const user = await Auth.requireStudent();
  if (!user) return;

  // ── Init nav ──
  document.getElementById('navAvatar').textContent = (user.initials || user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase());
  document.getElementById('heroName').textContent  = user.name.split(' ')[0];

  // ── Load months from Firestore ──
  const months = await MonthUtils.getAll();
  const unlockedMonths = user.unlockedMonths || [];

  // Hero stats
  const totalReleasedMonths = months.filter(m => MonthUtils.isReleased(m) && m.lessonsCount > 0).length;
  const totalLessons = months
    .filter(m => unlockedMonths.includes(m.id))
    .reduce((acc, m) => acc + (m.lessonsCount || 0), 0);

  document.getElementById('dashHeroCards').innerHTML = `
    <div class="hero-stat-card">
      <div class="hero-stat-num">${unlockedMonths.length}</div>
      <div class="hero-stat-label">Unlocked</div>
    </div>
    <div class="hero-stat-card">
      <div class="hero-stat-num">${totalLessons}</div>
      <div class="hero-stat-label">Lessons</div>
    </div>
    <div class="hero-stat-card">
      <div class="hero-stat-num">${totalReleasedMonths}</div>
      <div class="hero-stat-label">Archives</div>
    </div>
  `;

  // Sidebar progress
  const pct = totalReleasedMonths > 0 ? Math.round((unlockedMonths.length / totalReleasedMonths) * 100) : 0;
  document.getElementById('sidebarProgress').innerHTML = `
    <div class="prog-title">📈 Collection Progress</div>
    <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
    <div class="prog-text">${unlockedMonths.length} of ${totalReleasedMonths} archives unlocked</div>
  `;

  // ── Check for pending slips ──
  let pendingMonthIds = new Set();
  try {
    const pendingSnap = await fbDb.collection('paymentSlips')
      .where('userId', '==', user.id)
      .where('status', '==', 'pending')
      .get();
    if (!pendingSnap.empty) {
      document.getElementById('pendingBadgeWrap').style.display = 'flex';
      pendingSnap.docs.forEach(d => pendingMonthIds.add(d.data().monthId));
    }
  } catch(e) { console.warn('Could not fetch pending slips', e); }

  // ── Filters ──
  let activeFilter = 'all';
  let searchQuery  = '';
  let allTutes = [];

  async function renderGrid() {
    const grid = document.getElementById('archiveGrid');
    const now  = new Date();

    console.log('[Dashboard] Rendering grid. Tutes matching:', allTutes.length);

    const filtered = months.filter(m => {
      const isUnlocked = unlockedMonths.includes(m.id);
      const matchesSearch = m.label.toLowerCase().includes(searchQuery);
      if (!matchesSearch) return false;
      if (activeFilter === 'unlocked') return isUnlocked;
      if (activeFilter === 'locked')   return !isUnlocked;
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>No archives found</h3><p>Try adjusting your filter or search.</p></div>`;
      return;
    }

    grid.innerHTML = filtered.map((month, i) => {
      const isUnlocked  = unlockedMonths.includes(month.id);
      const isReleased  = MonthUtils.isReleased(month);
      const isPending   = pendingMonthIds.has(month.id);
      const icon        = MonthUtils.monthIcon(months.indexOf(month));
      const lessonsCount = month.lessonsCount || 0;
      const relDate = (() => {
        try {
          const d = month.releaseDate?.toDate ? month.releaseDate.toDate() : new Date(month.releaseDate);
          return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        } catch { return ''; }
      })();

      if (isUnlocked) {
        return `
        <div class="month-card unlocked" onclick="openMonth('${month.id}')">
          <div class="card-header-band"></div>
          <div class="card-body">
            <div class="card-top">
              <div><div class="card-title">${month.label}</div><div class="card-subtitle">Released ${relDate}</div></div>
              <div class="card-icon">${icon}</div>
            </div>
            <div class="card-meta">
              <div class="meta-item"><div class="meta-value">${lessonsCount}</div><div class="meta-label">Lessons</div></div>
              <div class="meta-item"><div class="meta-value">∞</div><div class="meta-label">Access</div></div>
              <div class="meta-item"><div class="meta-value">HD</div><div class="meta-label">Quality</div></div>
            </div>
            <div class="card-progress">
              <div class="progress-bar"><div class="progress-fill" style="width:100%"></div></div>
              <div class="progress-label">✅ Fully Unlocked</div>
            </div>

            <!-- Tutes Quick Access -->
            ${(() => {
              const mTutes = allTutes.filter(t => String(t.monthId) === String(month.id));
              if (mTutes.length === 0) return '';
              return `
              <div class="card-tutes-action" style="margin-bottom:12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px">
                <button class="btn btn-ghost btn-sm" style="width:100%; justify-content:center; color:var(--accent-light); border:1px solid rgba(129,140,248,0.2); background:rgba(129,140,248,0.05)" onclick="event.stopPropagation(); openTutesModal('${month.id}', '${month.label}')">
                  📑 View Study Materials
                </button>
              </div>`;
            })()}

            <div class="card-actions">
              <button class="btn btn-primary btn-sm" style="flex:1" onclick="event.stopPropagation();openMonth('${month.id}')">▶ Watch Lessons</button>
              <span class="badge badge-success">✓ Unlocked</span>
            </div>
          </div>
        </div>`;
      }

      if (isPending) {
        return `
        <div class="month-card pending">
          <div class="card-header-band pending"></div>
          <div class="card-body">
            <div class="card-top">
              <div><div class="card-title">${month.label}</div><div class="card-subtitle">Awaiting approval</div></div>
              <div class="card-icon" style="background:rgba(255,181,71,0.12);border-color:rgba(255,181,71,0.3)">${icon}</div>
            </div>
            <div class="card-meta">
              <div class="meta-item"><div class="meta-value" style="color:var(--text-muted)">${lessonsCount || '?'}</div><div class="meta-label">Lessons</div></div>
              <div class="meta-item"><div class="meta-value" style="color:var(--warning)">⏳</div><div class="meta-label">Pending</div></div>
              <div class="meta-item"><div class="meta-value" style="color:var(--text-muted)">HD</div><div class="meta-label">Quality</div></div>
            </div>
            <div class="card-actions">
              <span class="badge badge-warning" style="flex:1;justify-content:center;padding:10px">⏳ Payment Under Review</span>
            </div>
          </div>
        </div>`;
      }

      const isComingSoon = !isReleased;
      return `
      <div class="month-card locked">
        <div class="card-header-band" style="background:linear-gradient(90deg,#2a2f3e,#3a3f52)"></div>
        <div class="card-body">
          ${isComingSoon ? '<div class="coming-soon-badge">Coming Soon</div>' : ''}
          <div class="card-top">
            <div><div class="card-title" style="color:var(--text-secondary)">${month.label}</div>
            <div class="card-subtitle">${isComingSoon ? 'Releasing '+relDate : 'Locked — Unlock to access'}</div></div>
            <div class="card-icon" style="font-size:28px;background:rgba(255,255,255,0.03);border-color:var(--border)">🔒</div>
          </div>
          <div class="card-meta">
            <div class="meta-item"><div class="meta-value" style="color:var(--text-muted)">${lessonsCount||'--'}</div><div class="meta-label">Lessons</div></div>
            <div class="meta-item"><div class="meta-value" style="color:var(--text-muted)">LKR</div><div class="meta-label">500</div></div>
            <div class="meta-item"><div class="meta-value" style="color:var(--text-muted)">HD</div><div class="meta-label">Quality</div></div>
          </div>
          ${!isComingSoon ? `
          <div class="card-actions">
            <button class="btn btn-outline btn-sm" style="flex:1" onclick="showRequestModal('${month.id}','${month.label}','${icon}',${lessonsCount})">🔓 Request Access</button>
          </div>` : `
          <div class="card-actions">
            <button class="btn btn-ghost btn-sm" style="flex:1;opacity:0.5" disabled>🔜 Not Yet Available</button>
          </div>`}
        </div>
      </div>`;
    }).join('');
  }

  // Filter buttons
  document.getElementById('filterTabs').addEventListener('click', e => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter;
    renderGrid();
  });

  document.getElementById('searchInput').addEventListener('input', function() {
    searchQuery = this.value.toLowerCase();
    renderGrid();
  });

  window.openMonth = function(monthId) {
    if (!monthId) return;
    localStorage.setItem('last_month_id', monthId); // Robustness fallback
    window.location.href = `player.html?month=${monthId}`;
  };

  window.showRequestModal = function(monthId, monthLabel, icon, lessonsCount) {
    if (pendingMonthIds.has(monthId)) { Toast.info('You already have a pending payment for this month.'); return; }
    document.getElementById('modalContent').innerHTML = `
      <div class="modal-month-info">
        <div class="modal-month-icon">${icon}</div>
        <div><div class="modal-month-name">${monthLabel}</div>
        <div class="modal-month-meta">${lessonsCount} lessons · Lifetime Access · LKR 500</div></div>
      </div>
      <div class="modal-note">📌 Complete the bank transfer and submit your payment slip on the <strong>Unlock Month</strong> page. Access is approved within 24 hours.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="window.location.href='payment.html?month=${monthId}'">💳 Go to Payment Page</button>
      </div>`;
    document.getElementById('requestModal').classList.add('active');
  };

  window.closeModal = function() { document.getElementById('requestModal').classList.remove('active'); };
  
  window.openTutesModal = function(monthId, monthLabel) {
    const mTutes = allTutes.filter(t => String(t.monthId) === String(monthId));
    const content = document.getElementById('tutesModalContent');
    content.innerHTML = `
      <div style="padding:0 20px 20px">
        <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.08); margin-bottom:20px">
          <p style="font-size:13px; color:var(--text-muted); margin:0">Archive: <strong>${monthLabel}</strong></p>
        </div>
        <div style="display:grid; gap:12px">
          ${mTutes.map(t => `
            <a href="${t.link}" target="_blank" class="tute-modal-item" style="display:flex; align-items:center; gap:14px; padding:16px; background:rgba(129,140,248,0.08); border:1px solid rgba(129,140,248,0.15); border-radius:12px; text-decoration:none; color:var(--text-primary); transition:all 0.3s ease">
              <div style="font-size:24px; width:48px; height:48px; background:rgba(129,140,248,0.15); border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0">📥</div>
              <div style="flex:1">
                <div style="font-weight:600; font-size:15px; margin-bottom:2px">${t.title}</div>
                <div style="font-size:12px; color:var(--text-muted)">Click to download from Google Drive</div>
              </div>
              <div style="font-size:18px; color:var(--accent-light); opacity:0.6">↗</div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
    document.getElementById('tutesModal').classList.add('active');
  };

  window.closeTutesModal = function() {
    document.getElementById('tutesModal').classList.remove('active');
  };

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('requestModal').addEventListener('click', e => { if (e.target.id === 'requestModal') closeModal(); });
  document.getElementById('tutesModal').addEventListener('click', e => { if (e.target.id === 'tutesModal') closeTutesModal(); });

  // Fetch Tutes once at start
  try {
    const tutesSnap = await fbDb.collection('tutes').get();
    allTutes = tutesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log('[Dashboard] Tutes loaded:', allTutes.length);
  } catch(e) { console.error('[Dashboard] Error fetching tutes:', e); }

  renderGrid();
})();
