// ── Collection Page Logic (Firebase) ─────────────────
(async function() {
  const user = await Auth.requireStudent();
  if (!user) return;

  const initials = user.initials || user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('navAvatar').textContent     = initials;
  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileName').textContent   = user.name;
  document.getElementById('profilePhone').textContent  = user.phone || '';

  const unlockedIds = user.unlockedMonths || [];

  // Fetch unlocked months from Firestore
  let unlockedMonths = [];
  for (const id of unlockedIds) {
    const m = await MonthUtils.getById(id);
    if (m) unlockedMonths.push(m);
  }

  // Total lessons count
  let totalLessons = 0;
  for (const m of unlockedMonths) {
    totalLessons += m.lessonsCount || 0;
  }

  const joined = user.joinedAt?.toDate
    ? user.joinedAt.toDate().toLocaleDateString('en-US', { month:'long', year:'numeric' })
    : 'Recently';

  // Badges
  const badges = [];
  if (unlockedIds.length >= 1) badges.push({ cls:'badge-muted',   txt:'📚 Enrolled' });
  if (unlockedIds.length >= 3) badges.push({ cls:'badge-accent',  txt:'⭐ Trailblazer' });
  if (unlockedIds.length >= 6) badges.push({ cls:'badge-success', txt:'🔥 Knowledge Seeker' });
  document.getElementById('profileBadges').innerHTML =
    badges.map(b => `<span class="badge ${b.cls}">${b.txt}</span>`).join('') +
    `<span class="badge badge-muted">📅 Since ${joined}</span>`;

  document.getElementById('profileStats').innerHTML = `
    <div class="prof-stat"><div class="prof-stat-num">${unlockedIds.length}</div><div class="prof-stat-label">Archives</div></div>
    <div class="prof-stat"><div class="prof-stat-num">${totalLessons}</div><div class="prof-stat-label">Lessons</div></div>`;

  // Fetch Tutes
  let allTutes = [];
  try {
    const tutesSnap = await fbDb.collection('tutes').get();
    allTutes = tutesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.error('Error fetching tutes:', e); }

  // ── Grid ──
  const grid = document.getElementById('collectionGrid');

  if (!unlockedMonths.length) {
    grid.innerHTML = `
      <div class="empty-collection">
        <div class="empty-icon">📭</div>
        <h3>Your collection is empty</h3>
        <p>Unlock your first month to build your personal knowledge archive.</p>
        <a href="payment.html" class="btn btn-primary">💳 Unlock Your First Month</a>
      </div>`;
    return;
  }

  grid.innerHTML = unlockedMonths.map((m, i) => {
    const icon    = MonthUtils.monthIcon(i);
    const relDate = (() => {
      try {
        const d = m.releaseDate?.toDate ? m.releaseDate.toDate() : new Date(m.releaseDate);
        return d.toLocaleDateString('en-US', { month:'short', year:'numeric' });
      } catch { return ''; }
    })();
    return `
    <div class="collection-card" onclick="localStorage.setItem('last_month_id','${m.id}'); window.location.href='player.html?month=${m.id}'">
      <div class="collection-card-band"></div>
      <div class="collection-card-body">
        <div class="collection-card-top">
          <div class="collection-card-icon">${icon}</div>
          <div style="text-align:right">
            <div class="collection-card-count">${m.lessonsCount||0}</div>
            <div class="collection-card-count-label">Lessons</div>
          </div>
        </div>
        <div class="collection-card-title">${m.label}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Released ${relDate} · Lifetime Access</div>
        
        <!-- Tutes Quick Access -->
        ${(() => {
          const mTutes = allTutes.filter(t => String(t.monthId) === String(m.id));
          if (mTutes.length === 0) return '';
          return `
          <div class="card-tutes-action" style="margin-bottom:12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px">
            <button class="btn btn-ghost btn-sm" style="width:100%; justify-content:center; color:var(--accent-light); border:1px solid rgba(129,140,248,0.2); background:rgba(129,140,248,0.05)" onclick="event.stopPropagation(); openTutesModal('${m.id}', '${m.label}')">
              📑 View Study Materials
            </button>
          </div>`;
        })()}

        <div class="collection-card-footer">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="event.stopPropagation(); localStorage.setItem('last_month_id','${m.id}'); window.location.href='player.html?month=${m.id}'">▶ Watch</button>
          <span class="badge badge-success">✓ Owned</span>
        </div>
      </div>
    </div>`;
  }).join('');

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

  document.getElementById('tutesModal').addEventListener('click', e => { if (e.target.id === 'tutesModal') closeTutesModal(); });
})();
