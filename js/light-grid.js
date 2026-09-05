(function () {
  const canvas = document.getElementById('lightGrid');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const hero = canvas.closest('.hero');
  const hint = document.querySelector('.hero-hint');

  const REVEAL_SPEED = 46;  // cells/sec the light-wave expands after trigger
  const TRAIL_DECAY = 0.9;  // per-frame decay of the cursor trail
  const TRAIL_RADIUS = 3;   // cells lit around the cursor

  const HOLD_DURATION = 7000;      // ms the fully-lit grid holds before the transition
  const TRANSITION_DURATION = 2600; // ms for the randomized reconfiguration

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let CELL = 16;             // css px per cell; scaled down on narrow viewports
  let cols, rows, mask, heat, brightness;
  let textZone = null;      // grid cells reserved (always dark) behind the .hero-role caption
  let mouse = { x: -9999, y: -9999, active: false };
  let revealed = false;
  let revealOrigin = null;
  let revealStart = 0;
  let revealMaxDist = 0;
  let hintHidden = false;
  let rafRunning = false;
  let inView = true;

  let holdStarted = false;
  let holdUntil = 0;

  // The hold-to-idle handoff: every cell in the grid — background AND the
  // ANGELO letters — gets a random rank. As time passes, cells flip to
  // their final state (background off, letters on) in random groups of 3,
  // so the background isn't just switching off while the letters fade in
  // uniformly — the whole grid looks like it's randomly reconfiguring.
  let transitioning = false;
  let transitionStart = 0;
  let transitionOrder = null; // same shape as mask: a random rank per cell
  let transitionTotal = 0;

  function wake() {
    if (!rafRunning) {
      rafRunning = true;
      requestAnimationFrame(draw);
    }
  }

  function beginTransition(now) {
    transitioning = true;
    transitionStart = now;
    revealed = false;
    holdStarted = false;

    const cells = [];
    transitionOrder = new Array(rows);
    for (let r = 0; r < rows; r++) {
      transitionOrder[r] = new Array(cols).fill(-1);
      for (let c = 0; c < cols; c++) {
        cells.push([r, c]);
        heat[r][c] = 0;
      }
    }
    // Fisher-Yates shuffle so cells flip state in random groups of 3.
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    cells.forEach(([r, c], i) => { transitionOrder[r][c] = i; });
    transitionTotal = cells.length;
  }

  // 5x7 dot-matrix glyphs, read top-to-bottom, '1' = lit pixel.
  const GLYPHS = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
    G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  };
  const WORD = 'ANGELO';
  const GLYPH_W = 5, GLYPH_H = 7, GLYPH_GAP = 1;
  const BITMAP_W = WORD.length * GLYPH_W + (WORD.length - 1) * GLYPH_GAP;
  const BITMAP_H = GLYPH_H;

  function bitmapAt(bx, by) {
    if (bx < 0 || by < 0 || bx >= BITMAP_W || by >= BITMAP_H) return false;
    const cell = GLYPH_W + GLYPH_GAP;
    const letterIndex = Math.floor(bx / cell);
    const localX = bx - letterIndex * cell;
    if (localX >= GLYPH_W) return false; // in the gap between letters
    const letter = WORD[letterIndex];
    const glyph = GLYPHS[letter];
    if (!glyph) return false;
    return glyph[by][localX] === '1';
  }

  function buildMask() {
    mask = new Array(rows);
    for (let r = 0; r < rows; r++) mask[r] = new Array(cols).fill(false);

    const scale = Math.min(
      (cols * 0.9) / BITMAP_W,
      (rows * 0.42) / BITMAP_H
    );
    const bitmapPxW = BITMAP_W * scale;
    const bitmapPxH = BITMAP_H * scale;
    const offsetC = (cols - bitmapPxW) / 2;
    const offsetR = (rows - bitmapPxH) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const bx = Math.floor((c + 0.5 - offsetC) / scale);
        const by = Math.floor((r + 0.5 - offsetR) / scale);
        mask[r][c] = bitmapAt(bx, by);
      }
    }
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    CELL = rect.width < 420 ? 8 : rect.width < 640 ? 10 : rect.width < 980 ? 13 : 16;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.max(10, Math.floor(rect.width / CELL));
    rows = Math.max(6, Math.floor(rect.height / CELL));

    buildMask();
    heat = new Array(rows);
    brightness = new Array(rows);
    for (let r = 0; r < rows; r++) {
      heat[r] = new Array(cols).fill(0);
      brightness[r] = new Array(cols).fill(0);
    }
    revealed = false;
    revealOrigin = null;
    holdStarted = false;
    transitioning = false;

    textZone = null;
    const roleEl = document.querySelector('.hero-role');
    if (roleEl) {
      const heroRect = hero.getBoundingClientRect();
      const textRect = roleEl.getBoundingClientRect();
      const pad = 16;
      textZone = {
        colMin: Math.floor((textRect.left - heroRect.left - pad) / CELL),
        colMax: Math.ceil((textRect.right - heroRect.left + pad) / CELL),
        rowMin: Math.floor((textRect.top - heroRect.top - pad) / CELL),
        rowMax: Math.ceil((textRect.bottom - heroRect.top + pad) / CELL),
      };
    }

    wake();
  }

  function cellAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { col: Math.floor(x / CELL), row: Math.floor(y / CELL), x, y };
  }

  function triggerReveal(col, row) {
    revealed = true;
    revealOrigin = { col, row };
    revealStart = performance.now();
    holdStarted = false;
    transitioning = false;

    const corners = [[0, 0], [0, cols - 1], [rows - 1, 0], [rows - 1, cols - 1]];
    revealMaxDist = 0;
    for (const [rr, cc] of corners) {
      const d = Math.hypot(rr - row, cc - col);
      if (d > revealMaxDist) revealMaxDist = d;
    }
  }

  function onMove(clientX, clientY) {
    wake();
    if (!hintHidden) {
      hintHidden = true;
      hint.classList.add('hidden');
    }
    const { col, row } = cellAt(clientX, clientY);
    mouse.active = true;

    for (let dr = -TRAIL_RADIUS; dr <= TRAIL_RADIUS; dr++) {
      for (let dc = -TRAIL_RADIUS; dc <= TRAIL_RADIUS; dc++) {
        const r = row + dr, c = col + dc;
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const dist = Math.hypot(dr, dc);
        if (dist > TRAIL_RADIUS) continue;
        const falloff = 1 - dist / (TRAIL_RADIUS + 0.6);
        heat[r][c] = Math.max(heat[r][c], falloff);
      }
    }

    if (!revealed && row >= 0 && row < rows && col >= 0 && col < cols) {
      let hitLetter = false;
      for (let dr = -1; dr <= 1 && !hitLetter; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
          if (mask[r][c]) { hitLetter = true; break; }
        }
      }
      if (hitLetter) triggerReveal(col, row);
    }
  }

  hero.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
  hero.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  hero.addEventListener('mouseleave', () => { mouse.active = false; });
  hero.addEventListener('touchend', () => { mouse.active = false; });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  // Stop paying the render cost once the hero scrolls out of view.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView) wake();
    }).observe(hero);
  }

  const SETTLE_EPS = 0.0015;

  function draw(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#060607';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    let revealRadius = -1;
    if (revealed && revealOrigin) {
      revealRadius = ((now - revealStart) / 1000) * REVEAL_SPEED;
      if (!holdStarted && !transitioning && revealRadius >= revealMaxDist) {
        holdStarted = true;
        holdUntil = now + HOLD_DURATION;
      }
    }

    if (holdStarted && !transitioning && now >= holdUntil) {
      beginTransition(now);
    }

    let switchedCount = 0;
    if (transitioning) {
      const progress = Math.min(1, (now - transitionStart) / TRANSITION_DURATION);
      switchedCount = Math.floor((progress * transitionTotal) / 3) * 3;
      if (progress >= 1) transitioning = false; // fall through to the idle branch below
    }

    // Force the loop to keep running through the hold and transition phases
    // even though nothing may be changing on screen frame-to-frame yet —
    // we still need to keep checking the clock.
    let stillAnimating = holdStarted || transitioning;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let target;

        if (transitioning) {
          // Each cell holds its full-light-setting state (background lit,
          // letters dark) until its random turn comes up, then snaps
          // straight to its final state (background off, letters on) —
          // no per-cell fade, just an instant flip, in random groups of 3.
          const switched = transitionOrder[r][c] < switchedCount;
          const finalState = mask[r][c] ? 1 : 0;
          const initialState = mask[r][c] ? 0 : 1;
          brightness[r][c] = switched ? finalState : initialState;
          target = brightness[r][c];
        } else if (revealed) {
          const dist = revealOrigin
            ? Math.hypot(r - revealOrigin.row, c - revealOrigin.col)
            : 0;
          const litByWave = dist <= revealRadius;
          if (mask[r][c]) {
            target = litByWave ? 0 : 1; // letters go dark as the wave passes
          } else {
            target = litByWave ? 1 : heat[r][c];
          }
        } else {
          target = mask[r][c] ? 1 : heat[r][c];
          heat[r][c] *= TRAIL_DECAY;
          if (heat[r][c] < SETTLE_EPS) heat[r][c] = 0;
          else stillAnimating = true;
        }

        const prevB = brightness[r][c];
        brightness[r][c] += (target - prevB) * 0.18;
        if (Math.abs(target - brightness[r][c]) > SETTLE_EPS) stillAnimating = true;

        if (
          textZone &&
          r >= textZone.rowMin && r <= textZone.rowMax &&
          c >= textZone.colMin && c <= textZone.colMax
        ) continue; // keep the caption on a permanently dark backdrop

        const b = brightness[r][c];
        if (b < 0.01) continue;

        const x = c * CELL + CELL / 2;
        const y = r * CELL + CELL / 2;
        // Scale with CELL (not a fixed px size) so dots keep the same
        // relative spacing at every grid density — otherwise the smaller
        // cells used on narrow screens make adjacent dots overlap into a
        // dense, cluttered mass instead of a clean, airy grid.
        const radius = CELL * (0.1375 + b * 0.1625);

        const alpha = 0.05 + b * 0.95;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, ${170 + Math.floor(b * 35)}, ${100 + Math.floor(b * 50)}, ${alpha})`;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Only keep animating while something is actually changing on screen,
    // and only while the hero is actually in the viewport — otherwise stop
    // the loop entirely instead of burning CPU on a static frame forever.
    if (inView && stillAnimating) {
      requestAnimationFrame(draw);
    } else {
      rafRunning = false;
    }
  }

  resize();
  wake();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(resize);
  }
})();
