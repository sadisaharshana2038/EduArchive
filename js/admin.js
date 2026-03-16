// ── Admin Panel Logic (Firebase) ─────────────────────
(function() {
  console.log('[Admin] Admin.js script loading...');

  // ── State ──
  let currentQFilter = 'pending';
  let currentVMMonth = '';
  let allMonths = [];
  let currentStudentSearch = '';
  let currentTuteMonth = '';
  let allTutes = [];
  let isClearing = false;

  // ── Utility Functions ──
  function extractYouTubeId(input) {
    if (!input) return '';
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = input.match(regex);
    return match ? match[1] : input.trim();
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

  // ── Core Functions (Exposed early) ──
  
  window.setTuteMonth = function(monthId) {
    currentTuteMonth = monthId;
    window.renderTuteManager();
  };

  window.renderTuteManager = async function() {
    const sel = document.getElementById('tmMonth');
    const tabs = document.getElementById('tmMonthList');
    const list = document.getElementById('tutesManagerList');

    if (!sel || !tabs || !list) return;

    if (allTutes.length === 0) {
      try {
        const snap = await fbDb.collection('tutes').get();
        allTutes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { console.error('Error fetching tutes:', e); }
    }

    sel.innerHTML = `<option value="">-- Select Month --</option>` + allMonths.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    tabs.innerHTML = allMonths.map(m => `
      <button class="filter-tab ${currentTuteMonth === m.id ? 'active' : ''}" onclick="setTuteMonth('${m.id}')">
        ${m.label}
      </button>`).join('');

    if (!currentTuteMonth && allMonths.length > 0) {
      // Find the first month that actually has tutes, or default to first month
      const monthWithTutes = allMonths.find(m => allTutes.some(t => String(t.monthId) === String(m.id)));
      currentTuteMonth = monthWithTutes ? monthWithTutes.id : allMonths[0].id;
      setTimeout(window.renderTuteManager, 0); 
      return;
    }

    if (!currentTuteMonth) {
      list.innerHTML = `<div class="empty-state">No months found for tutes.</div>`;
      return;
    }

    const tutes = allTutes.filter(t => String(t.monthId) === String(currentTuteMonth));

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
                <button class="vm-delete-btn" onclick="deleteTute('${t.id}', event)" title="Delete Tute" style="height:32px;width:32px;display:flex;align-items:center;justify-content:center">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  };

  window.clearAllLessons = async function() {
    // Priority: use currentVMMonth if we are in Video Manager
    const monthId = currentVMMonth || document.getElementById('vmMonth').value;
    const month = allMonths.find(m => m.id === monthId);
    
    let title = '☢ CRITICAL ACTION';
    let message = 'This will permanently delete ALL lessons from EVERY month. Are you sure you want to proceed?';
    let confirmText = 'Yes, CLEAR ALL';

    if (monthId && month) {
      title = '🗑 CLEAR MONTH';
      message = `This will permanently delete all lessons for "${month.label}". Are you sure you want to proceed?`;
      confirmText = 'Yes, Clear Month';
    }

    const confirmed = await customConfirm(title, message, confirmText);
    if (!confirmed) return;
    if (isClearing) return;
    isClearing = true;
    Toast.info('Clearing lessons... Please wait.');

    try {
      let lessonsSnap;
      if (monthId) {
        lessonsSnap = await fbDb.collection('lessons').where('monthId', '==', monthId).get();
      } else {
        lessonsSnap = await fbDb.collection('lessons').get();
      }

      const batch = fbDb.batch();
      lessonsSnap.docs.forEach(doc => batch.delete(doc.ref));
      
      if (monthId) {
        batch.update(fbDb.collection('months').doc(monthId), { lessonsCount: 0 });
      } else {
        allMonths.forEach(m => {
          batch.update(fbDb.collection('months').doc(m.id), { lessonsCount: 0 });
        });
      }

      await batch.commit();
      allMonths = await MonthUtils.getAll();
      Toast.success(monthId ? `Lessons for ${month.label} cleared! ✓` : 'Database cleared! All lessons removed. ✓');
      renderVideoManager();
      renderSidebarStats();
    } catch(e) {
      Toast.error('Clear failed: ' + e.message);
    } finally {
      isClearing = false;
    }
  };

  // ── Custom Confirmation Logic ──
  window.customConfirm = function(title, message, confirmText = 'Yes, Delete') {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const titleEl = document.getElementById('confirmTitle');
      const msgEl = document.getElementById('confirmMessage');
      const btnEl = document.getElementById('confirmActionBtn');
      
      if (!modal || !titleEl || !msgEl || !btnEl) {
        // Fallback if elements not found (unlikely)
        resolve(confirm(message));
        return;
      }

      titleEl.textContent = title;
      msgEl.textContent = message;
      btnEl.textContent = confirmText;
      modal.classList.add('active');

      btnEl.onclick = () => {
        modal.classList.remove('active');
        resolve(true);
      };
      
      // Cancel is handled by closeConfirmModal which we'll define below
      window.onCancelConfirm = () => {
        modal.classList.remove('active');
        resolve(false);
      };
    });
  };

  window.closeConfirmModal = () => {
    if (window.onCancelConfirm) window.onCancelConfirm();
    document.getElementById('confirmModal').classList.remove('active');
  };

  window.deleteTute = async function(tuteId, e) {
    console.log('[Admin] deleteTute called for ID:', tuteId);
    if (!tuteId) { Toast.error('Invalid Tute ID'); return; }
    
    const ev = e || window.event;
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }

    const confirmed = await customConfirm('Delete Tute?', 'Are you sure you want to permanently remove this tute?');
    if (!confirmed) return;
    
    const btn = ev?.currentTarget || ev?.target?.closest('button') || ev?.target;
    const oldHtml = btn ? btn.innerHTML : '🗑';
    
    if (btn && btn.tagName === 'BUTTON') {
      btn.disabled = true;
      btn.innerHTML = '<span class="loader-sm" style="width:14px;height:14px;border-width:2px"></span>';
    }

    try {
      console.log('[Admin] Deleting from Firestore...');
      await fbDb.collection('tutes').doc(tuteId).delete();
      
      allTutes = allTutes.filter(t => t.id !== tuteId);
      Toast.success('Tute deleted successfully! ✓');
      window.renderTuteManager();
    } catch(err) {
      console.error('[Admin] Delete failed:', err);
      Toast.error('Delete failed: ' + err.message);
      if (btn && btn.tagName === 'BUTTON') {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      }
    }
  };

  window.addTute = async function() {
    const monthId = document.getElementById('tmMonth').value;
    const title = document.getElementById('tmTitle').value.trim();
    const link = document.getElementById('tmLink').value.trim();

    if (!monthId || !title || !link) {
      Toast.error('Please fill Month, Title, and Link.');
      return;
    }

    const btn = event.target.closest('button');
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⌛ Adding...';

    try {
      const docRef = await fbDb.collection('tutes').add({
        monthId, title, link,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      allTutes.push({ id: docRef.id, monthId, title, link });
      Toast.success('Tute added successfully! ✓');
      document.getElementById('tmTitle').value = '';
      document.getElementById('tmLink').value = '';
      currentTuteMonth = monthId;
      window.renderTuteManager();
    } catch(e) {
      Toast.error('Failed to add tute: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  };

  // ── Rest of the functions (Queue, Students, etc.) ──
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
    if (tab === 'tutes')    window.renderTuteManager();
  };

  async function renderSidebarStats() {
    try {
      const [pendingSnap, studentsSnap, lessonsSnap] = await Promise.all([
        fbDb.collection('paymentSlips').where('status','==','pending').get(),
        fbDb.collection('users').where('role','==','student').get(),
        fbDb.collection('lessons').get()
      ]);

      const pending = pendingSnap.size;
      const el = document.getElementById('pendingCount');
      if (el) el.textContent = pending > 0 ? pending : '';

      document.getElementById('adminSideStats').innerHTML = `
        <div class="admin-stat-row"><span class="admin-stat-label">⏳ Pending</span><span class="admin-stat-value" style="color:var(--warning)">${pending}</span></div>
        <div class="admin-stat-row"><span class="admin-stat-label">👥 Students</span><span class="admin-stat-value">${studentsSnap.size}</span></div>
        <div class="admin-stat-row"><span class="admin-stat-label">🎬 Lessons</span><span class="admin-stat-value">${lessonsSnap.size}</span></div>
        <div class="admin-stat-row"><span class="admin-stat-label">📚 Months</span><span class="admin-stat-value">${allMonths.length}</span></div>`;
    } catch(e) { console.error('Stats error:', e); }
  }

  // Define other internal functions like renderQueue, renderStudents, etc.
  async function renderQueue() {
    const list = document.getElementById('queueList');
    list.innerHTML = `<div style="text-align:center;padding:40px"><div class="loader" style="margin:0 auto"></div></div>`;
    let slips = await PaymentUtils.getSlips();
    if (currentQFilter !== 'all') slips = slips.filter(s => s.status === currentQFilter);
    const statusMap = { pending:'badge-warning', approved:'badge-success', rejected:'badge-danger' };
    const statusTxt = { pending:'⏳ Pending', approved:'✓ Approved', rejected:'✕ Rejected' };
    const initOf = name => (name||'?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

    if (!slips.length) {
      list.innerHTML = `<div class="queue-empty"><div class="empty-icon">${currentQFilter==='pending'?'🎉':'📭'}</div><p>${currentQFilter==='pending'?'All caught up! No pending slips.':'No submissions found.'}</p></div>`;
      return;
    }

    list.innerHTML = slips.map(slip => {
      const submittedAt = slip.submittedAt?.toDate ? slip.submittedAt.toDate() : new Date();
      const timeAgo = formatTimeAgo(submittedAt);
      const hasImage = slip.slipUrl?.startsWith('data:image');
      return `
      <div class="queue-card">
        <div class="queue-card-top">
          <div class="queue-student-info">
            <div class="queue-avatar">${initOf(slip.userName||'?')}</div>
            <div><div class="queue-student-name">${slip.userName||'Unknown'}</div><div class="queue-student-phone">📱 ${slip.userPhone||''}</div></div>
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
        <div class="queue-actions">
          ${slip.status === 'pending' ? `
            <button class="btn btn-success btn-sm" onclick="approveSlip('${slip.id}')">✓ Approve & Unlock</button>
            <button class="btn btn-danger btn-sm" onclick="rejectSlip('${slip.id}')">✕ Reject</button>
            <span class="queue-time">${submittedAt.toLocaleString()}</span>
          ` : `<div class="queue-actions"><span class="queue-time">Processed · ${submittedAt.toLocaleString()}</span></div>`}
        </div>
      </div>`;
    }).join('');
  }

  window.filterQueue = function(filter, el) {
    document.querySelectorAll('[data-qfilter]').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    currentQFilter = filter;
    renderQueue();
  };

  window.approveSlip = async (id) => { try { await PaymentUtils.approve(id); Toast.success('Approved!'); renderQueue(); renderSidebarStats(); } catch(e) { Toast.error(e.message); } };
  window.rejectSlip = async (id) => { try { await PaymentUtils.reject(id); Toast.error('Rejected.'); renderQueue(); renderSidebarStats(); } catch(e) { Toast.error(e.message); } };

  window.openSlipModal = async (id) => {
    const snap = await fbDb.collection('paymentSlips').doc(id).get();
    if (!snap.exists) return;
    const slip = snap.data();
    document.getElementById('slipModalContent').innerHTML = `<img src="${slip.slipUrl}" style="width:100%;border-radius:10px;"/>`;
    document.getElementById('slipModal').classList.add('active');
  };
  window.closeSlipModal = () => document.getElementById('slipModal').classList.remove('active');

  function renderVideoManager() {
    const sel = document.getElementById('vmMonth');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Month --</option>' + allMonths.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    document.getElementById('vmMonthList').innerHTML = allMonths.map(m => `<button class="vm-month-btn ${m.id === currentVMMonth ? 'active' : ''}" onclick="vmSelectMonth('${m.id}',this)">${m.label.replace(' 2026','')}</button>`).join('');
    renderVMLessons();
  }

  window.vmSelectMonth = (mid, el) => { currentVMMonth = mid; document.querySelectorAll('.vm-month-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); renderVMLessons(); };

  async function renderVMLessons() {
    const container = document.getElementById('vmLessonsDisplay');
    const header = document.querySelector('#tabVideos .section-header h2');
    if (!container || !currentVMMonth) return;
    
    const lessons = await MonthUtils.getLessons(currentVMMonth);
    const month = allMonths.find(m => m.id === currentVMMonth);
    
    if (header && month) {
      header.innerHTML = `🎬 Lessons — <b>${lessons.length}</b> for ${month.label}`;
    }

    const monthInfoHtml = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:15px; padding:0 5px">
        <h3 style="font-size:16px; color:var(--text-secondary)">${month.label} Lessons (<b>${lessons.length}</b>)</h3>
        ${lessons.length > 0 ? `<button class="btn btn-danger btn-sm" onclick="clearMonthLessons('${month.id}')" style="font-size:11px; padding:4px 8px; border-radius:6px">🗑 Clear ${month.label.split(' ')[0]}</button>` : ''}
      </div>`;

    if (lessons.length === 0) {
      container.innerHTML = monthInfoHtml + `<div class="empty-state" style="padding:40px">No lessons for this month yet. 🎬</div>`;
      return;
    }

    container.innerHTML = monthInfoHtml + lessons.map(l => `
      <div class="vm-lesson-row">
        <div class="vm-lesson-num">${l.order}</div>
        <div class="vm-lesson-info">
          <div class="vm-lesson-title" title="${l.title}">${l.title}</div>
          <div class="vm-lesson-meta">
            <span>🎬 ID: <code title="${l.youtubeId}">${l.youtubeId}</code></span>
            <span>⏱ ${l.duration || '00:00'}</span>
          </div>
        </div>
        <button class="vm-delete-btn" onclick="deleteLesson('${l.id}','${l.monthId}')" title="Delete Lesson">🗑</button>
      </div>`).join('');
  }

  window.clearMonthLessons = function(mid) {
    currentVMMonth = mid;
    window.clearAllLessons();
  };

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
      await fbDb.collection('lessons').add({ monthId, title, duration, youtubeId: ytId, order: existing.length + 1 });
      await fbDb.collection('months').doc(monthId).update({ lessonsCount: existing.length + 1 });
      allMonths = await MonthUtils.getAll();
      ['vmTitle','vmYtId','vmDuration'].forEach(id => document.getElementById(id).value = '');
      Toast.success(`Lesson "${title}" added successfully! ✓`);
      currentVMMonth = monthId;
      renderVideoManager();
      renderSidebarStats();
    } catch(e) { Toast.error('Failed to add lesson: ' + e.message); } finally { btn.disabled = false; btn.textContent = oldText; }
  };

  window.deleteLesson = async function(lessonId, monthId) {
    if(!await customConfirm('Delete Lesson?', 'Remove this lesson from the archive?')) return;
    try {
      await fbDb.collection('lessons').doc(lessonId).delete();
      const remaining = await MonthUtils.getLessons(monthId);
      const batch = fbDb.batch();
      remaining.forEach((l, i) => batch.update(fbDb.collection('lessons').doc(l.id), { order: i+1 }));
      batch.update(fbDb.collection('months').doc(monthId), { lessonsCount: remaining.length });
      await batch.commit();
      allMonths = await MonthUtils.getAll();
      Toast.info('Lesson removed.');
      renderVMLessons();
      renderSidebarStats();
    } catch(e) { Toast.error('Delete failed: ' + e.message); }
  };

  function renderMonthsManager() {
    const list = document.getElementById('monthsManagerList');
    if (!list) return;
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
    const dateObj = new Date(dateInput);
    const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const monthId = `${y}-${m}`;
    if (allMonths.find(x => x.id === monthId)) { Toast.error(`A month with ID ${monthId} already exists.`); return; }
    const btn = event.target.closest('button');
    btn.disabled = true; btn.textContent = '⌛ Adding...';
    try {
      await fbDb.collection('months').doc(monthId).set({ label, releaseDate: firebase.firestore.Timestamp.fromDate(dateObj), lessonsCount: 0 });
      allMonths = await MonthUtils.getAll();
      Toast.success(`Month "${label}" created! ✓`);
      document.getElementById('monthLabel').value = '';
      document.getElementById('monthReleaseDate').value = '';
      renderMonthsManager();
      renderSidebarStats();
    } catch(e) { Toast.error('Failed to add month: ' + e.message); } finally { btn.disabled = false; btn.textContent = '➕ Add Month'; }
  };

  window.deleteMonth = async function(monthId) {
    const month = allMonths.find(m => m.id === monthId);
    if (month && month.lessonsCount > 0) { Toast.error('Cannot delete a month that has lessons.'); return; }
    if (!await customConfirm('Delete Month?', `Permanently delete "${month?.label || monthId}"?`)) return;
    try {
      await fbDb.collection('months').doc(monthId).delete();
      allMonths = await MonthUtils.getAll();
      Toast.info('Month removed.');
      renderMonthsManager();
      renderSidebarStats();
    } catch(e) { Toast.error('Delete failed: ' + e.message); }
  };

  async function renderStudents() {
    const snap = await fbDb.collection('users').where('role','==','student').get();
    let students = snap.docs.map(d => ({ id:d.id, ...d.data() }));

    if (currentStudentSearch) {
      const q = currentStudentSearch.toLowerCase();
      students = students.filter(s => (s.name?.toLowerCase().includes(q) || s.phone?.includes(q)));
    }
    const list = document.getElementById('studentsList');
    if (!list) return;

    const initOf = name => (name||'?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

    const tbody = students.map(s => {
      const ini = s.initials || initOf(s.name);
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

    list.innerHTML = `<table class="students-table">
      <thead><tr><th>Student</th><th>Unlocked Months</th><th>Count</th><th>Joined</th><th>Actions</th></tr></thead>
      <tbody>${tbody}</tbody>
    </table>`;
  }

  window.openAccessModal = async function(sid) {
    const snap = await fbDb.collection('users').doc(sid).get();
    if (!snap.exists) return;
    const student = snap.data();
    const unlocked = student.unlockedMonths || [];
    document.getElementById('accessStudentName').textContent = student.name;
    document.getElementById('accessStudentPhone').textContent = student.phone;
    const list = document.getElementById('accessMonthsList');
    list.innerHTML = allMonths.map(m => `
      <label class="checkbox-item" style="display:flex; align-items:center; gap:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:8px; cursor:pointer; font-size:13px;">
        <input type="checkbox" value="${m.id}" ${unlocked.includes(m.id) ? 'checked' : ''} style="accent-color:var(--accent); width:16px; height:16px;">
        <span>${m.label}</span>
      </label>`).join('');
    document.getElementById('accessModal').classList.add('active');
    document.getElementById('saveAccessBtn').onclick = () => saveAccess(sid);
  };

  async function saveAccess(sid) {
    const list = document.getElementById('accessMonthsList');
    const checked = Array.from(list.querySelectorAll('input:checked')).map(i => i.value);
    const btn = document.getElementById('saveAccessBtn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      await fbDb.collection('users').doc(sid).update({ unlockedMonths: checked });
      Toast.success('Access updated! ✓');
      window.closeAccessModal();
      renderStudents();
    } catch(e) { Toast.error('Failed: ' + e.message); } finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
  window.closeAccessModal = () => document.getElementById('accessModal').classList.remove('active');

  // ── Initialization ──
  (async function main() {
    try {
      console.log('[Admin] Authenticating...');
      const user = await Auth.requireAdmin();
      if (!user) return;
      
      const initials = user.initials || user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
      const av = document.getElementById('navAvatar');
      if (av) av.textContent = initials;

      allMonths = await MonthUtils.getAll();
      if (allMonths.length) currentVMMonth = allMonths[0].id;

      await renderSidebarStats();
      
      document.getElementById('studentSearch')?.addEventListener('input', (e) => {
        currentStudentSearch = e.target.value.trim();
        renderStudents();
      });

      window.showTab('queue');
      console.log('[Admin] Initialization complete.');
    } catch(err) {
      console.error('[Admin] Main init failure:', err);
      Toast.error('Critical Error: ' + err.message);
    }
  })();

})();
