// ── Admin Panel Logic (Firebase) ─────────────────────
(async function() {
  const user = await Auth.requireAdmin();
  if (!user) return;

  const initials = user.initials || user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('navAvatar').textContent = initials;

  let currentQFilter = 'pending';
  let currentVMMonth = '';
  let allMonths = [];
  let currentStudentSearch = '';
  let currentTuteMonth = '';

  function extractYouTubeId(input) {
    if (!input) return '';
    // Regex for standard, short, embed, and shorts URLs
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = input.match(regex);
    if (match) return match[1];
    // If no match, return trimmed input (might be a plain ID)
    return input.trim();
  }

  // ── Load initial data ──
  let isClearing = false;

  // ── Load initial data ──
  allMonths = await MonthUtils.getAll();
  if (allMonths.length) currentVMMonth = allMonths[0].id;

  // ── Clear All Lessons ──
  window.clearAllLessons = async function() {
    if (!confirm('☢ WARNING: This will permanently delete ALL lessons from EVERY month. Are you sure?')) return;
    if (isClearing) return;
    isClearing = true;
    Toast.info('Clearing lessons... Please wait.');

    try {
      const lessonsSnap = await fbDb.collection('lessons').get();
      const batch = fbDb.batch();
      lessonsSnap.docs.forEach(doc => batch.delete(doc.ref));
      
      // Reset lessonsCount in months
      allMonths.forEach(m => {
        batch.update(fbDb.collection('months').doc(m.id), { lessonsCount: 0 });
      });

      await batch.commit();
      allMonths = await MonthUtils.getAll();
      Toast.success('Database cleared! All lessons removed. ✓');
      renderVideoManager();
      renderSidebarStats();
    } catch(e) {
      Toast.error('Clear failed: ' + e.message);
    } finally {
      isClearing = false;
    }
  };

  // ── Sidebar stats ──
  async function renderSidebarStats() {
    const pendingSnap = await fbDb.collection('paymentSlips').where('status','==','pending').get();
    const studentsSnap = await fbDb.collection('users').where('role','==','student').get();
    const lessonsSnap  = await fbDb.collection('lessons').get();

    const pending  = pendingSnap.size;
    const students = studentsSnap.size;
    const lessons  = lessonsSnap.size;

    const el = document.getElementById('pendingCount');
    if (el) el.textContent = pending > 0 ? pending : '';

    document.getElementById('adminSideStats').innerHTML = `
      <div class="admin-stat-row"><span class="admin-stat-label">⏳ Pending</span><span class="admin-stat-value" style="color:var(--warning)">${pending}</span></div>
      <div class="admin-stat-row"><span class="admin-stat-label">👥 Students</span><span class="admin-stat-value">${students}</span></div>
      <div class="admin-stat-row"><span class="admin-stat-label">🎬 Lessons</span><span class="admin-stat-value">${lessons}</span></div>
      <div class="admin-stat-row"><span class="admin-stat-label">📚 Months</span><span class="admin-stat-value">${allMonths.length}</span></div>`;
  }

  // ── Tab switching ──
  window.showTab = function(tab) {
    ['queue','videos','students','months','tutes'].forEach(t => {
      const el = document.getElementById(`tab${t.charAt(0).toUpperCase()+t.slice(1)}`);
      if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    ['sideQueueBtn','sideVideosBtn','sideStudentsBtn','sideMonthsBtn','sideTutesBtn'].forEach((id,i) => {
      document.getElementById(id)?.classList.toggle('active', ['queue','videos','students','months','tutes'][i] === tab);
    });
    ['tabQueueBtn','tabVideosBtn','tabStudentsBtn','tabMonthsBtn','tabTutesBtn'].forEach((id,i) => {
      document.getElementById(id)?.classList.toggle('active', ['queue','videos','students','months','tutes'][i] === tab);
    });
    if (tab === 'queue')    renderQueue();
    if (tab === 'videos')   renderVideoManager();
    if (tab === 'students') renderStudents();
    if (tab === 'months')   renderMonthsManager();
    if (tab === 'tutes')    renderTuteManager();
  };

  // ── Queue ──
  window.filterQueue = function(filter, el) {
    document.querySelectorAll('[data-qfilter]').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    currentQFilter = filter;
    renderQueue();
  };

  async function renderQueue() {
    const list = document.getElementById('queueList');
    list.innerHTML = `<div style="text-align:center;padding:40px"><div class="loader" style="margin:0 auto"></div></div>`;

    let slips = await PaymentUtils.getSlips();
    if (currentQFilter !== 'all') slips = slips.filter(s => s.status === currentQFilter);

    const statusMap = { pending:'badge-warning', approved:'badge-success', rejected:'badge-danger' };
    const statusTxt = { pending:'⏳ Pending', approved:'✓ Approved', rejected:'✕ Rejected' };
    const initOf = name => name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

    if (!slips.length) {
      list.innerHTML = `<div class="queue-empty"><div class="empty-icon">${currentQFilter==='pending'?'🎉':'📭'}</div><p>${currentQFilter==='pending'?'All caught up! No pending slips.':'No submissions here.'}</p></div>`;
      return;
    }

    list.innerHTML = slips.map(slip => {
      const submittedAt = slip.submittedAt?.toDate ? slip.submittedAt.toDate() : new Date(slip.submittedAt);
      const timeAgo = formatTimeAgo(submittedAt);
      const hasImage = slip.slipUrl && slip.slipUrl.startsWith('data:image');
      return `
      <div class="queue-card">
        <div class="queue-card-top">
          <div class="queue-student-info">
            <div class="queue-avatar">${initOf(slip.userName||'?')}</div>
            <div><div class="queue-student-name">${slip.userName||'Unknown'}</div>
            <div class="queue-student-phone">📱 ${slip.userPhone||''}</div></div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="badge ${statusMap[slip.status]}">${statusTxt[slip.status]}</span>
            <div class="slip-thumb" onclick="openSlipModal('${slip.id}')" title="View slip">
              ${hasImage ? `<img src="${slip.slipUrl}" alt="Slip"/>` : '🧾'}
            </div>
          </div>
        </div>
        <div class="queue-meta">
          <div class="queue-meta-item"><div class="queue-meta-label">Month</div><div class="queue-meta-value">📅 ${slip.monthLabel||slip.monthId}</div></div>
          <div class="queue-meta-item"><div class="queue-meta-label">Bank</div><div class="queue-meta-value">🏦 ${slip.bank||'N/A'}</div></div>
          <div class="queue-meta-item"><div class="queue-meta-label">Amount</div><div class="queue-meta-value" style="color:var(--accent-2)">LKR ${(slip.amount||0).toLocaleString()}</div></div>
          <div class="queue-meta-item"><div class="queue-meta-label">Submitted</div><div class="queue-meta-value">${timeAgo}</div></div>
        </div>
        ${slip.note ? `<div class="queue-note">💬 "${slip.note}"</div>` : ''}
        ${slip.status === 'pending' ? `
        <div class="queue-actions">
          <button class="btn btn-success btn-sm" onclick="approveSlip('${slip.id}')">✓ Approve & Unlock</button>
          <button class="btn btn-danger btn-sm" onclick="rejectSlip('${slip.id}')">✕ Reject</button>
          <span class="queue-time">${submittedAt.toLocaleString()}</span>
        </div>` : `<div class="queue-actions"><span class="queue-time">Processed · ${submittedAt.toLocaleString()}</span></div>`}
      </div>`;
    }).join('');
  }

  window.approveSlip = async function(slipId) {
    try {
      await PaymentUtils.approve(slipId);
      Toast.success('Payment approved! Student access unlocked. ✓');
      renderQueue();
      renderSidebarStats();
    } catch(e) { Toast.error('Failed to approve. ' + e.message); }
  };

  window.rejectSlip = async function(slipId) {
    try {
      await PaymentUtils.reject(slipId);
      Toast.error('Payment rejected.');
      renderQueue();
      renderSidebarStats();
    } catch(e) { Toast.error('Failed to reject. ' + e.message); }
  };

  window.openSlipModal = async function(slipId) {
    const snap = await fbDb.collection('paymentSlips').doc(slipId).get();
    if (!snap.exists) return;
    const slip = { id: snap.id, ...snap.data() };
    const hasImage = slip.slipUrl && slip.slipUrl.startsWith('data:image');
    const submittedAt = slip.submittedAt?.toDate ? slip.submittedAt.toDate() : new Date();
    document.getElementById('slipModalContent').innerHTML = `
      ${hasImage ? `<img class="slip-img-big" src="${slip.slipUrl}" alt="Payment Slip"/>` : `<div style="text-align:center;padding:40px;font-size:48px;background:rgba(255,255,255,0.03);border-radius:var(--radius);margin-bottom:16px">🧾</div>`}
      <div class="slip-modal-info">
        <div><strong>Student:</strong> ${slip.userName||'—'}</div>
        <div><strong>Phone:</strong> ${slip.userPhone||'—'}</div>
        <div><strong>Month:</strong> ${slip.monthLabel||slip.monthId}</div>
        <div><strong>Bank:</strong> ${slip.bank||'N/A'}</div>
        <div><strong>Amount:</strong> LKR ${(slip.amount||0).toLocaleString()}</div>
        <div><strong>Note:</strong> ${slip.note||'—'}</div>
        <div><strong>Submitted:</strong> ${submittedAt.toLocaleString()}</div>
      </div>
      ${slip.status === 'pending' ? `
      <div class="slip-modal-actions">
        <button class="btn btn-ghost btn-sm" onclick="closeSlipModal()">Close</button>
        <button class="btn btn-danger btn-sm" onclick="rejectSlip('${slip.id}');closeSlipModal()">✕ Reject</button>
        <button class="btn btn-success btn-sm" onclick="approveSlip('${slip.id}');closeSlipModal()">✓ Approve</button>
      </div>` : `<div class="slip-modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeSlipModal()">Close</button></div>`}`;
    document.getElementById('slipModal').classList.add('active');
  };
  window.closeSlipModal = function() { document.getElementById('slipModal').classList.remove('active'); };
  document.getElementById('slipModal').addEventListener('click', e => { if (e.target.id === 'slipModal') closeSlipModal(); });

  // ── Video Manager ──
  function renderVideoManager() {
    const sel = document.getElementById('vmMonth');
    sel.innerHTML = '<option value="">-- Select Month --</option>' +
      allMonths.map(m => `<option value="${m.id}">${m.label}</option>`).join('');

    document.getElementById('vmMonthList').innerHTML = allMonths.map(m =>
      `<button class="vm-month-btn ${m.id === currentVMMonth ? 'active' : ''}" onclick="vmSelectMonth('${m.id}',this)">${m.label.replace(' 2026','')}</button>`
    ).join('');

    renderVMLessons();
  }

  window.vmSelectMonth = function(monthId, el) {
    currentVMMonth = monthId;
    document.querySelectorAll('.vm-month-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    renderVMLessons();
  };

  async function renderVMLessons() {
    const container = document.getElementById('vmLessonsDisplay');
    container.innerHTML = `<div style="text-align:center;padding:20px"><div class="loader" style="margin:0 auto"></div></div>`;
    if (!currentVMMonth) { container.innerHTML = ''; return; }

    const month   = allMonths.find(m => m.id === currentVMMonth);
    const lessons = await MonthUtils.getLessons(currentVMMonth);

    container.innerHTML = `<h3 style="margin-bottom:14px">${month?.label||currentVMMonth} — ${lessons.length} Lessons</h3>` +
      (lessons.length === 0 ? '<p style="color:var(--text-muted);font-size:14px">No lessons yet. Add one using the form.</p>' :
       lessons.map(l => `
        <div class="vm-lesson-row">
          <div class="vm-lesson-num">${l.order}</div>
          <div class="vm-lesson-info">
            <div class="vm-lesson-title">${l.title}</div>
            <div class="vm-lesson-meta">🎬 ID: ${l.youtubeId} · ⏱ ${l.duration}</div>
          </div>
          <button class="vm-delete-btn" onclick="deleteLesson('${l.id}','${l.monthId}')" title="Remove">🗑</button>
        </div>`).join(''));
  }

  window.addLesson = async function() {
    const monthId  = document.getElementById('vmMonth').value;
    const title    = document.getElementById('vmTitle').value.trim();
    const ytInput  = document.getElementById('vmYtId').value.trim();
    const duration = document.getElementById('vmDuration').value.trim() || '00:00';
    
    const ytId = extractYouTubeId(ytInput);

    if (!monthId || !title || !ytId) { Toast.error('Please fill Month, Title, and YouTube ID/Link.'); return; }

    const btn = event.target.closest('button');
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⌛ Adding...';

    try {
      const existing = await MonthUtils.getLessons(monthId);
      await fbDb.collection('lessons').add({
        monthId, title, duration, youtubeId: ytId, order: existing.length + 1
      });
      await fbDb.collection('months').doc(monthId).update({ lessonsCount: existing.length + 1 });

      allMonths = await MonthUtils.getAll();
      ['vmTitle','vmYtId','vmDuration'].forEach(id => document.getElementById(id).value = '');
      Toast.success(`Lesson "${title}" added successfully! ✓`);
      currentVMMonth = monthId;
      renderVideoManager();
      renderSidebarStats();
    } catch(e) {
      Toast.error('Failed to add lesson: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  };

  window.deleteLesson = async function(lessonId, monthId) {
    await fbDb.collection('lessons').doc(lessonId).delete();
    const remaining = await MonthUtils.getLessons(monthId);
    // Re-sequence
    const batch = fbDb.batch();
    remaining.forEach((l, i) => batch.update(fbDb.collection('lessons').doc(l.id), { order: i+1 }));
    batch.update(fbDb.collection('months').doc(monthId), { lessonsCount: remaining.length });
    await batch.commit();
    allMonths = await MonthUtils.getAll();
    Toast.info('Lesson removed.');
    renderVMLessons();
    renderSidebarStats();
  };

  // ── Months Manager ──
  function renderMonthsManager() {
    const list = document.getElementById('monthsManagerList');
    list.innerHTML = `
      <table class="students-table">
        <thead><tr><th>Month Label</th><th>ID</th><th>Lessons</th><th>Release Date</th><th>Actions</th></tr></thead>
        <tbody>
          ${allMonths.map(m => {
            const relDate = m.releaseDate?.toDate ? m.releaseDate.toDate().toLocaleDateString() : '—';
            return `
              <tr>
                <td style="font-weight:600;color:var(--text-primary)">${m.label}</td>
                <td><code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px">${m.id}</code></td>
                <td><span class="badge badge-success">${m.lessonsCount || 0}</span></td>
                <td style="font-size:13px;color:var(--text-muted)">${relDate}</td>
                <td>
                  <button class="vm-delete-btn" onclick="deleteMonth('${m.id}')" title="Delete Month" style="height:32px;width:32px">🗑</button>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  window.addMonth = async function() {
    const label = document.getElementById('monthLabel').value.trim();
    const dateInput = document.getElementById('monthReleaseDate').value;
    if (!label || !dateInput) { Toast.error('Please fill both Label and Release Date.'); return; }

    // Derive ID (e.g. "May 2026" -> "2026-05")
    const dateObj = new Date(dateInput);
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const monthId = `${y}-${m}`;

    if (allMonths.find(x => x.id === monthId)) {
      Toast.error(`A month with ID ${monthId} already exists.`);
      return;
    }

    const btn = event.target.closest('button');
    btn.disabled = true;
    btn.textContent = '⌛ Adding...';

    try {
      await fbDb.collection('months').doc(monthId).set({
        label,
        releaseDate: firebase.firestore.Timestamp.fromDate(dateObj),
        lessonsCount: 0
      });

      allMonths = await MonthUtils.getAll();
      Toast.success(`Month "${label}" created! ✓`);
      document.getElementById('monthLabel').value = '';
      document.getElementById('monthReleaseDate').value = '';
      renderMonthsManager();
      renderSidebarStats();
    } catch(e) {
      Toast.error('Failed to add month: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '➕ Add Month';
    }
  };

  window.deleteMonth = async function(monthId) {
    const month = allMonths.find(m => m.id === monthId);
    if (month && month.lessonsCount > 0) {
      Toast.error('Cannot delete a month that has lessons. Delete lessons first.');
      return;
    }
    if (!confirm(`Permanently delete "${month.label}"?`)) return;

    try {
      await fbDb.collection('months').doc(monthId).delete();
      allMonths = await MonthUtils.getAll();
      Toast.info('Month removed.');
      renderMonthsManager();
      renderSidebarStats();
    } catch(e) {
      Toast.error('Delete failed: ' + e.message);
    }
  };

  // ── Tute Manager ──
  async function renderTuteManager() {
    const sel = document.getElementById('tmMonth');
    const tabs = document.getElementById('tmMonthList');
    const list = document.getElementById('tutesManagerList');

    // Sync dropdown and filter tabs
    sel.innerHTML = `<option value="">-- Select Month --</option>` + allMonths.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    tabs.innerHTML = allMonths.map(m => `
      <button class="filter-tab ${currentTuteMonth === m.id ? 'active' : ''}" onclick="currentTuteMonth='${m.id}'; renderTuteManager()">
        ${m.label}
      </button>`).join('');

    if (!currentTuteMonth && allMonths.length > 0) {
      currentTuteMonth = allMonths[0].id; // Default to first month
      return renderTuteManager();
    }

    if (!currentTuteMonth) {
      list.innerHTML = `<div class="empty-state">No months found for tutes.</div>`;
      return;
    }

    const tutesSnap = await fbDb.collection('tutes').where('monthId', '==', currentTuteMonth).get();
    const tutes = tutesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (tutes.length === 0) {
      list.innerHTML = `<div class="empty-state">No tutes found for this month. 📂</div>`;
      return;
    }

    list.innerHTML = `
      <table class="students-table">
        <thead><tr><th>Title</th><th>Link</th><th>Actions</th></tr></thead>
        <tbody>
          ${tutes.map(t => `
            <tr>
              <td style="font-weight:600;color:var(--text-primary)">${t.title}</td>
              <td><a href="${t.link}" target="_blank" class="badge badge-success" style="text-decoration:none">Open Link ↗</a></td>
              <td>
                <button class="vm-delete-btn" onclick="deleteTute('${t.id}')" title="Delete Tute" style="height:32px;width:32px">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  window.addTute = async function() {
    const monthId = document.getElementById('tmMonth').value;
    const title = document.getElementById('tmTitle').value.trim();
    const link = document.getElementById('tmLink').value.trim();

    if (!monthId || !title || !link) {
      Toast.error('Please fill Month, Title, and Link.');
      return;
    }

    const btn = event.target.closest('button');
    btn.disabled = true;
    btn.textContent = '⌛ Adding...';

    try {
      await fbDb.collection('tutes').add({
        monthId,
        title,
        link,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      Toast.success('Tute added successfully! ✓');
      document.getElementById('tmTitle').value = '';
      document.getElementById('tmLink').value = '';
      renderTuteManager();
    } catch(e) {
      Toast.error('Failed to add tute: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '➕ Add Tute';
    }
  };

  window.deleteTute = async function(tuteId) {
    if (!confirm('Are you sure you want to delete this tute?')) return;
    try {
      await fbDb.collection('tutes').doc(tuteId).delete();
      Toast.info('Tute deleted.');
      renderTuteManager();
    } catch(e) {
      Toast.error('Delete failed: ' + e.message);
    }
  };

  // ── Students ──
  async function renderStudents() {
    const snap = await fbDb.collection('users').where('role','==','student').get();
    let students = snap.docs.map(d => ({ id:d.id, ...d.data() }));

    if (currentStudentSearch) {
      const q = currentStudentSearch.toLowerCase();
      students = students.filter(s => 
        (s.name && s.name.toLowerCase().includes(q)) || 
        (s.phone && s.phone.includes(q))
      );
    }

    const initOf   = name => (name||'?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

    if (!students.length) {
      document.getElementById('studentsList').innerHTML = '<p style="color:var(--text-muted)">No students yet.</p>';
      return;
    }

    const tbody = students.map(s => {
      const ini  = s.initials || initOf(s.name||'?');
      const pills = (s.unlockedMonths||[]).map(mid => {
        const m = allMonths.find(x => x.id === mid);
        return `<span class="month-pill">${m ? m.label.replace(' 2026','') : mid}</span>`;
      }).join('') || '<span style="color:var(--text-muted);font-size:12px">None</span>';
      const joined = s.joinedAt?.toDate ? s.joinedAt.toDate().toLocaleDateString() : '—';
      return `
      <tr>
        <td><div class="student-cell">
          <div class="student-mini-avatar">${ini}</div>
          <div><div class="student-name">${s.name||'—'}</div><div class="student-phone">${s.phone||''}</div></div>
        </div></td>
        <td><div class="month-pills">${pills}</div></td>
        <td><span style="color:var(--accent-light);font-weight:700">${(s.unlockedMonths||[]).length}</span></td>
        <td style="color:var(--text-muted);font-size:12px">${joined}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="openAccessModal('${s.id}')" style="color:var(--accent-light)">🔑 Access</button>
        </td>
      </tr>`;
    }).join('');

    document.getElementById('studentsList').innerHTML = `
      <table class="students-table">
        <thead><tr><th>Student</th><th>Unlocked Months</th><th>Count</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>${tbody}</tbody>
      </table>`;
  }

  // ── Access Management ──
  let currentAccessStudentId = null;

  window.openAccessModal = async function(sid) {
    currentAccessStudentId = sid;
    const snap = await fbDb.collection('users').doc(sid).get();
    if (!snap.exists) return;
    const student = snap.data();
    const unlocked = student.unlockedMonths || [];

    document.getElementById('accessStudentName').textContent = student.name;
    document.getElementById('accessStudentPhone').textContent = student.phone;

    const list = document.getElementById('accessMonthsList');
    list.innerHTML = allMonths.map(m => `
      <label class="checkbox-item" style="display:flex; align-items:center; gap:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:8px; cursor:pointer; transition:var(--transition); font-size:13px;">
        <input type="checkbox" value="${m.id}" ${unlocked.includes(m.id) ? 'checked' : ''} style="accent-color:var(--accent); width:16px; height:16px;">
        <span>${m.label}</span>
      </label>
    `).join('');

    document.getElementById('accessModal').classList.add('active');

    document.getElementById('saveAccessBtn').onclick = () => saveAccess(sid);
  };

  window.closeAccessModal = function() {
    document.getElementById('accessModal').classList.remove('active');
  };

  async function saveAccess(sid) {
    const list = document.getElementById('accessMonthsList');
    const checked = Array.from(list.querySelectorAll('input:checked')).map(i => i.value);
    
    const btn = document.getElementById('saveAccessBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      await fbDb.collection('users').doc(sid).update({ unlockedMonths: checked });
      Toast.success('Access updated successfully! ✓');
      closeAccessModal();
      renderStudents();
    } catch(e) {
      Toast.error('Failed to update: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  }

  function formatTimeAgo(date) {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return 'Just now';
  }

  // ── Init ──
  await renderSidebarStats();
  
  // Student Search Listener
  document.getElementById('studentSearch')?.addEventListener('input', (e) => {
    currentStudentSearch = e.target.value.trim();
    renderStudents();
  });

  showTab('queue');
})();
