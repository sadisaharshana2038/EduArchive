// ── Secure Video Player Logic (Firebase) ─────────────
(async function() {
  const user = await Auth.requireStudent();
  if (!user) return;

  const initials = user.initials || user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('navAvatar').textContent = initials;

  const params  = new URLSearchParams(window.location.search);
  let monthId = params.get('month');

  if (!monthId) {
    monthId = localStorage.getItem('last_month_id');
  } else {
    localStorage.setItem('last_month_id', monthId);
  }

  if (!monthId) {
    Toast.error('No month specified.');
    setTimeout(() => history.back(), 1500); 
    return; 
  }

  const hasAccess = (user.unlockedMonths || []).includes(monthId);
  if (!hasAccess) {
    Toast.error('You do not have access to this month.');
    setTimeout(() => window.location.href = 'dashboard.html', 1500);
    return;
  }

  const [month, lessons] = await Promise.all([
    MonthUtils.getById(monthId),
    MonthUtils.getLessons(monthId)
  ]);

  if (!month || !lessons.length) {
    Toast.error('No lessons found for this month.');
    setTimeout(() => history.back(), 1500);
    return;
  }

  document.title = `EduArchive — ${month.label}`;
  document.getElementById('monthTitle').textContent = month.label;

  let player;
  let apiReady = false;
  let isPlayerReady = false;
  let updateTimer;
  let idleTimer;

  // Custom UI Elements
  const customPlayBtn      = document.getElementById('customPlayBtn');
  const playIcon           = document.getElementById('playIcon');
  const currTimeEl         = document.getElementById('currTime');
  const totalTimeEl        = document.getElementById('totalTime');
  const progressArea       = document.getElementById('progressArea');
  const progressFill       = document.getElementById('progressFill');
  const shield             = document.getElementById('interactionShield');
  const customMuteBtn      = document.getElementById('customMuteBtn');
  const muteIcon           = document.getElementById('muteIcon');
  const customFullscreenBtn = document.getElementById('customFullscreenBtn');
  const videoWrapper       = document.getElementById('videoWrapper');
  const volumeSlider       = document.getElementById('volumeSlider');

  // Load saved volume
  let savedVolume = parseInt(localStorage.getItem('player_volume')) || 100;
  volumeSlider.value = savedVolume;

  window.onYouTubeIframeAPIReady = function() {
    apiReady = true;
    checkAndPlayFirst();
  };

  function checkAndPlayFirst() {
    if (apiReady && lessons.length > 0) {
      playLesson(0);
    }
  }

  const lessonList   = document.getElementById('lessonList');
  const placeholder  = document.getElementById('videoPlaceholder');
  const secureWrap   = document.getElementById('secureWrapper');
  const videoTitle   = document.getElementById('videoTitle');
  const videoSub     = document.getElementById('videoSub');
  const videoCtrl    = document.getElementById('videoControls');
  const lessonDesc   = document.getElementById('lessonDescription');
  const prevBtn      = document.getElementById('prevBtn');
  const nextBtn      = document.getElementById('nextBtn');
  const lessonCtr    = document.getElementById('lessonCounter');
  const progressWrap = document.getElementById('progressWrap');

  let currentIndex = 0;

  progressWrap.innerHTML = `
    <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:100%"></div></div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:5px">${lessons.length} lessons · Lifetime Access</div>`;

  function renderList() {
    lessonList.innerHTML = lessons.map((lesson, i) => `
      <div class="lesson-item ${i === currentIndex ? 'active' : ''}" data-index="${i}" onclick="playLesson(${i})">
        <div class="lesson-num">${lesson.order}</div>
        <div class="lesson-text">
          <div class="lesson-name">${lesson.title}</div>
          <div class="lesson-dur">🕐 ${lesson.duration}</div>
        </div>
        <div class="lesson-play-icon">${i === currentIndex ? '▶' : '›'}</div>
      </div>`).join('');
  }


  window.playLesson = function(index) {
    if (index < 0 || index >= lessons.length) return;
    currentIndex = index;
    const lesson = lessons[index];

    videoTitle.textContent = `${lesson.order}. ${lesson.title}`;
    videoSub.textContent   = `${month.label} · Lesson ${lesson.order} of ${lessons.length} · ${lesson.duration}`;
    lessonCtr.textContent  = `${index + 1} / ${lessons.length}`;

    placeholder.style.display  = 'none';
    secureWrap.style.display   = 'block';
    videoCtrl.style.display    = 'flex';
    lessonDesc.style.display   = 'block';
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === lessons.length - 1;

    if (!player) {
      if (typeof YT === 'undefined' || !YT.Player) {
        secureWrap.innerHTML = `<iframe width="100%" height="100%" style="border:none;" src="https://www.youtube.com/embed/${lesson.youtubeId}?autoplay=1&rel=0&controls=0&modestbranding=1" allowfullscreen></iframe>`;
        return;
      }
      isPlayerReady = false;
      player = new YT.Player('ytPlayer', {
        height: '100%',
        width: '100%',
        videoId: lesson.youtubeId,
        playerVars: {
          'autoplay': 1,
          'modestbranding': 1,
          'rel': 0,
          'controls': 0, 
          'showinfo': 0,
          'iv_load_policy': 3,
          'disablekb': 1
        },
        events: {
          'onReady': (event) => {
            isPlayerReady = true;
            event.target.playVideo();
            event.target.setVolume(savedVolume);
            startUpdateTimer();
            syncMuteIcon();
            resetIdleTimer();
          },
          'onStateChange': (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              playIcon.textContent = '⏸';
              resetIdleTimer();
            } else {
              playIcon.textContent = '▶';
              showControls(); // Keep controls visible when paused
            }
          }
        }
      });
    } else if (isPlayerReady && typeof player.loadVideoById === 'function') {
      player.loadVideoById(lesson.youtubeId);
    } else {
      secureWrap.innerHTML = `<iframe width="100%" height="100%" style="border:none;" src="https://www.youtube.com/embed/${lesson.youtubeId}?autoplay=1&rel=0&controls=0&modestbranding=1" allowfullscreen></iframe>`;
      player = null;
    }

    renderList();
    const el = lessonList.querySelector(`[data-index="${index}"]`);
    if (el) el.scrollIntoView({ behavior:'smooth', block:'nearest' });
  };

  // ── Auto-Hide Controls Logic ──
  function resetIdleTimer() {
    showControls();
    if (idleTimer) clearTimeout(idleTimer);
    
    // Only auto-hide if playing
    if (player && isPlayerReady && player.getPlayerState() === YT.PlayerState.PLAYING) {
      idleTimer = setTimeout(hideControls, 3000);
    }
  }

  function hideControls() {
    if (player && isPlayerReady && player.getPlayerState() === YT.PlayerState.PLAYING) {
      videoWrapper.classList.add('controls-hidden');
    }
  }

  function showControls() {
    videoWrapper.classList.remove('controls-hidden');
  }

  videoWrapper.addEventListener('mousemove', resetIdleTimer);
  videoWrapper.addEventListener('mousedown', resetIdleTimer);
  videoWrapper.addEventListener('touchstart', resetIdleTimer);

  // ── Custom Playback Logic ──
  customPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
    resetIdleTimer();
  });

  function togglePlay() {
    if (!isPlayerReady || !player) return;
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }

  customMuteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetIdleTimer();
    if (!isPlayerReady || !player) return;
    if (player.isMuted()) {
      player.unMute();
      if (player.getVolume() === 0) {
        player.setVolume(50);
        volumeSlider.value = 50;
      }
    } else {
      player.mute();
    }
    syncMuteIcon();
  });

  volumeSlider.addEventListener('input', (e) => {
    resetIdleTimer();
    const val = e.target.value;
    savedVolume = val;
    localStorage.setItem('player_volume', val);
    if (isPlayerReady && player) {
      player.setVolume(val);
      if (val > 0 && player.isMuted()) player.unMute();
      else if (val == 0 && !player.isMuted()) player.mute();
      syncMuteIcon();
    }
  });

  function syncMuteIcon() {
    if (!player || !isPlayerReady) return;
    const isMuted = player.isMuted();
    const vol = player.getVolume();
    if (isMuted || vol == 0) {
      muteIcon.textContent = '🔇';
    } else if (vol < 50) {
      muteIcon.textContent = '🔉';
    } else {
      muteIcon.textContent = '🔊';
    }
  }

  customFullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen();
    resetIdleTimer();
  });

  function toggleFullscreen() {
    const isFS = videoWrapper.classList.contains('is-fullscreen');
    
    if (!isFS) {
      videoWrapper.classList.add('is-fullscreen');
      document.body.classList.add('no-scroll');
      if (videoWrapper.requestFullscreen) videoWrapper.requestFullscreen().catch(()=>{});
      else if (videoWrapper.webkitRequestFullscreen) videoWrapper.webkitRequestFullscreen();
      else if (videoWrapper.msRequestFullscreen) videoWrapper.msRequestFullscreen();
    } else {
      videoWrapper.classList.remove('is-fullscreen');
      document.body.classList.remove('no-scroll');
      if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    }
  }

  shield.addEventListener('dblclick', toggleFullscreen);
  shield.addEventListener('click', () => {
    togglePlay();
    resetIdleTimer();
  });

  function startUpdateTimer() {
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = setInterval(() => {
      if (!isPlayerReady || !player || !player.getCurrentTime) return;
      const curr = player.getCurrentTime();
      const total = player.getDuration();
      if (total > 0) {
        const pct = (curr / total) * 100;
        progressFill.style.width = pct + '%';
        currTimeEl.textContent = formatTime(curr);
        totalTimeEl.textContent = formatTime(total);
      }
    }, 500);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  progressArea.addEventListener('click', (e) => {
    e.stopPropagation();
    resetIdleTimer();
    if (!isPlayerReady || !player || !player.getDuration) return;
    const rect = progressArea.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const seekTime = player.getDuration() * pct;
    player.seekTo(seekTime, true);
  });

  prevBtn.addEventListener('click', () => playLesson(currentIndex - 1));
  nextBtn.addEventListener('click', () => playLesson(currentIndex + 1));

  document.addEventListener('keydown', e => {
    resetIdleTimer();
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape' && videoWrapper.classList.contains('is-fullscreen')) {
       toggleFullscreen();
    }
    if (e.key === 'ArrowRight' || e.key === 'l') playLesson(currentIndex + 1);
    if (e.key === 'ArrowLeft'  || e.key === 'j') playLesson(currentIndex - 1);
    if (e.key === 'f') toggleFullscreen();
    if (e.key === 't') document.body.classList.toggle('theater-mode');
    if (e.key === 'm') customMuteBtn.click();
    if (e.key === 'ArrowUp') {
       e.preventDefault();
       let v = Math.min(100, parseInt(volumeSlider.value) + 5);
       volumeSlider.value = v;
       volumeSlider.dispatchEvent(new Event('input'));
    }
    if (e.key === 'ArrowDown') {
       e.preventDefault();
       let v = Math.max(0, parseInt(volumeSlider.value) - 5);
       volumeSlider.value = v;
       volumeSlider.dispatchEvent(new Event('input'));
    }
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  });

  document.addEventListener('fullscreenchange', () => {
     if (!document.fullscreenElement && videoWrapper.classList.contains('is-fullscreen')) {
        videoWrapper.classList.remove('is-fullscreen');
        document.body.classList.remove('no-scroll');
     }
  });

  renderList();
  if (apiReady) checkAndPlayFirst();
})();
