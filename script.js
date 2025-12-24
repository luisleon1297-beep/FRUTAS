/* NEO RED SLOT - Full (no libs)
   - 5 reels x 3 rows
   - Paylines 9/15 toggle
   - Bet per line +/- + Max Bet
   - Progressive Jackpot + chance
   - Auto-spin
   - Bonus game (3+ BONUS scatter)
   - WebAudio SFX (simple)
*/

(() => {
  "use strict";

  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- SVG sprites (originales) ---------- */
  function svgDataUri(svg) {
    const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
    return `data:image/svg+xml;charset=utf-8,${encoded}`;
  }

  const SPRITES = {
    CHERRY: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" rx="38" fill="#0b0013"/>
      <path d="M118 64c18-26 38-30 54-24-20 6-30 20-34 34" fill="none" stroke="#9cffb1" stroke-width="10" stroke-linecap="round"/>
      <circle cx="78" cy="128" r="36" fill="#ff1b3a" stroke="#b40022" stroke-width="10"/>
      <circle cx="132" cy="132" r="32" fill="#ff0033" stroke="#b40022" stroke-width="10"/>
      <circle cx="64" cy="116" r="10" fill="#ffd3da" opacity=".65"/>
      <circle cx="124" cy="120" r="9" fill="#ffd3da" opacity=".55"/>
      <path d="M96 94c10-22 22-36 40-46" fill="none" stroke="#7cff8a" stroke-width="10" stroke-linecap="round"/>
    </svg>`),

    LEMON: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" rx="38" fill="#0b0013"/>
      <path d="M55 110c0-38 30-62 58-62s42 18 42 46-30 78-58 78-42-24-42-62z" fill="#ffd200" stroke="#b88b00" stroke-width="10"/>
      <path d="M70 118c0-24 22-44 40-44" fill="none" stroke="#fff7b3" stroke-width="10" stroke-linecap="round" opacity=".8"/>
      <path d="M114 56c10-10 20-12 30-10" fill="none" stroke="#7cff8a" stroke-width="10" stroke-linecap="round"/>
    </svg>`),

    SEVEN: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" rx="38" fill="#0b0013"/>
      <path d="M52 52h96v18L92 160H68l58-90H52z" fill="#ffffff"/>
      <path d="M52 52h96v18L92 160H68l58-90H52z" fill="none" stroke="#ff1b3a" stroke-width="10" opacity=".7"/>
    </svg>`),

    STAR: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" rx="38" fill="#0b0013"/>
      <path d="M100 24l20 52 56 2-44 34 16 54-48-30-48 30 16-54-44-34 56-2z"
        fill="#ffd200" stroke="#b88b00" stroke-width="10" stroke-linejoin="round"/>
      <path d="M84 72l16-40 16 40" fill="none" stroke="#fff7b3" stroke-width="10" opacity=".7"/>
    </svg>`),

    BONUS: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" rx="38" fill="#0b0013"/>
      <circle cx="100" cy="100" r="62" fill="#ff1b3a" stroke="#b40022" stroke-width="12"/>
      <text x="100" y="112" text-anchor="middle" font-size="44" font-family="Arial Black, Arial" fill="#fff">BONUS</text>
      <path d="M52 56h96" stroke="#ffd3da" stroke-width="10" opacity=".55" stroke-linecap="round"/>
    </svg>`),
  };

  const SYMBOLS = [
    { key: "CHERRY", img: SPRITES.CHERRY, w: 3 },
    { key: "LEMON", img: SPRITES.LEMON, w: 4 },
    { key: "STAR", img: SPRITES.STAR, w: 2 },
    { key: "SEVEN", img: SPRITES.SEVEN, w: 1 },
    // BONUS (scatter) no entra como “normal” de línea, lo tratamos aparte en el pago
    { key: "BONUS", img: SPRITES.BONUS, w: 1 },
  ];

  function weightedPick(list) {
    const sum = list.reduce((a, s) => a + s.w, 0);
    let r = Math.random() * sum;
    for (const s of list) {
      r -= s.w;
      if (r <= 0) return s;
    }
    return list[list.length - 1];
  }

  /* ---------- Paylines mapping: line -> rows per reel (0 top, 1 mid, 2 bot) ---------- */
  const PAYLINES = {
    1:  [1,1,1,1,1],
    2:  [0,0,0,0,0],
    3:  [2,2,2,2,2],
    4:  [0,1,2,1,0],
    5:  [2,1,0,1,2],
    6:  [1,0,1,2,1],
    7:  [1,2,1,0,1],
    8:  [0,1,0,1,0],
    9:  [2,1,2,1,2],
    10: [0,0,1,2,2],
    11: [2,2,1,0,0],
    12: [1,1,0,1,2],
    13: [1,1,2,1,0],
    14: [0,1,1,1,2],
    15: [2,1,1,1,0],
  };

  /* ---------- DOM ---------- */
  const el = {
    machine: $("machine"),
    tracks: [$("track1"), $("track2"), $("track3"), $("track4"), $("track5")],
    totalBet: $("totalBet"),
    winValue: $("winValue"),
    creditValue: $("creditValue"),
    jackpotValue: $("jackpotValue"),
    betMinus: $("betMinus"),
    betPlus: $("betPlus"),
    betPerLine: $("betPerLine"),
    linesBtn: $("linesBtn"),
    linesValue: $("linesValue"),
    spinBtn: $("spinBtn"),
    autoBtn: $("autoBtn"),
    maxBetBtn: $("maxBetBtn"),
    muteBtn: $("muteBtn"),
    cashoutBtn: $("cashoutBtn"),
    resetBtn: $("resetBtn"),
    message: $("message"),
    paylinesSvg: $("paylines"),
    bonusModal: $("bonusModal"),
    bonusGrid: $("bonusGrid"),
    bonusDoneBtn: $("bonusDoneBtn"),
    bonusSub: $("bonusSub"),
  };

  /* ---------- State ---------- */
  const LS_KEY = "neo_red_slot_state_v1";
  let state = {
    credits: 500,
    betPerLine: 1,
    lines: 9,
    jackpot: 1000,
    muted: false,
    auto: false,
  };

  let isSpinning = false;
  let lastWin = 0;

  /* ---------- Audio (simple WebAudio) ---------- */
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function beep(freq = 440, dur = 0.08, type = "square", gain = 0.04) {
    if (state.muted) return;
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  }
  function sfxSpin() { beep(220, 0.06, "square", 0.03); }
  function sfxStop() { beep(420, 0.05, "triangle", 0.03); }
  function sfxWin()  { beep(660, 0.08, "square", 0.05); setTimeout(()=>beep(880,0.09,"square",0.05), 90); }
  function sfxLose() { beep(180, 0.10, "sawtooth", 0.02); }
  function sfxJackpot(){ beep(523,0.10,"square",0.06); setTimeout(()=>beep(659,0.10,"square",0.06),120); setTimeout(()=>beep(784,0.12,"square",0.06),240); }

  /* ---------- Persistence ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return;
      state = { ...state, ...data };
    } catch {}
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
  }

  /* ---------- UI ---------- */
  function setMessage(txt) { el.message.textContent = txt; }
  function totalBet() { return state.betPerLine * state.lines; }

  function setControlsEnabled(enabled) {
    const ids = [
      el.betMinus, el.betPlus, el.linesBtn, el.spinBtn, el.autoBtn,
      el.maxBetBtn, el.muteBtn, el.cashoutBtn, el.resetBtn
    ];
    ids.forEach(b => b && (b.disabled = !enabled));
  }

  function clearPaylineGlow() {
    if (!el.paylinesSvg) return;
    el.paylinesSvg.querySelectorAll("polyline").forEach(p => p.classList.remove("on"));
  }

  function glowPaylines(lineNums) {
    clearPaylineGlow();
    if (!el.paylinesSvg) return;
    lineNums.forEach(n => {
      const p = el.paylinesSvg.querySelector(`polyline[data-line="${n}"]`);
      if (p) p.classList.add("on");
    });
    // apaga luego
    setTimeout(clearPaylineGlow, 900);
  }

  function renderHUD() {
    el.totalBet.textContent = totalBet();
    el.winValue.textContent = lastWin;
    el.creditValue.textContent = state.credits;
    el.jackpotValue.textContent = state.jackpot;
    el.betPerLine.textContent = state.betPerLine;
    el.linesValue.textContent = state.lines;
    el.muteBtn.textContent = state.muted ? "SOUND: OFF" : "SOUND";
    el.autoBtn.textContent = state.auto ? "AUTO: ON" : "AUTO";
  }

  function buildCell(symbol) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const box = document.createElement("div");
    box.className = "symbol";
    const img = document.createElement("img");
    img.alt = symbol.key;
    img.src = symbol.img;
    box.appendChild(img);
    cell.appendChild(box);
    return cell;
  }

  // Creamos un “strip” largo por reel para animar
  const STRIP_LEN = 24; // suficiente para “rueda”
  const reelStrips = Array.from({ length: 5 }, () =>
    Array.from({ length: STRIP_LEN }, () => weightedPick(SYMBOLS))
  );

  function renderReelsInitial() {
    el.tracks.forEach((track, r) => {
      track.innerHTML = "";
      // duplicamos strip para que se vea continuo
      const strip = [...reelStrips[r], ...reelStrips[r]];
      strip.forEach(sym => track.appendChild(buildCell(sym)));
      track.style.transform = "translateY(0px)";
      track.style.transition = "none";
    });
  }

  function getCellHeightPx() {
    // toma la altura real de .cell (según tu CSS variable --cellH)
    const anyCell = el.tracks[0]?.querySelector(".cell");
    return anyCell ? anyCell.getBoundingClientRect().height : 86;
  }

  /* ---------- Game logic ---------- */
  function canAffordSpin() {
    return state.credits >= totalBet();
  }

  function paytable(symbolKey, count) {
    // paga por 3+ iguales (en línea) con multiplicadores simples
    const base = {
      CHERRY: 6,
      LEMON: 4,
      STAR: 10,
      SEVEN: 20,
    }[symbolKey] || 0;

    if (count < 3) return 0;
    if (count === 3) return base;
    if (count === 4) return base * 3;
    return base * 6; // 5
  }

  function evaluate(matrix) {
    // matrix[reel][row] => symbolKey
    const wins = [];
    let total = 0;

    // evaluar líneas activas
    for (let line = 1; line <= state.lines; line++) {
      const rows = PAYLINES[line];
      const keys = rows.map((row, reel) => matrix[reel][row]);
      // contamos “desde el reel 1 hacia la derecha” cuántos iguales consecutivos
      const first = keys[0];
      if (first === "BONUS") continue; // BONUS no paga por línea

      let count = 1;
      for (let i = 1; i < keys.length; i++) {
        if (keys[i] === first) count++;
        else break;
      }

      const linePay = paytable(first, count) * state.betPerLine;
      if (linePay > 0) {
        wins.push({ line, symbol: first, count, amount: linePay });
        total += linePay;
      }
    }

    // BONUS scatter: 3+ en cualquier posición (sobre 15 celdas)
    const all = matrix.flat();
    const bonusCount = all.filter(k => k === "BONUS").length;
    const bonusTriggered = bonusCount >= 3;

    return { total, wins, bonusTriggered, bonusCount };
  }

  function jackpotChanceBoost() {
    // leve boost por bet/lines
    const t = totalBet();
    return clamp(0.0006 + t * 0.00002, 0.0006, 0.01); // max 1%
  }

  async function animateReels(finalMatrix) {
    const cellH = getCellHeightPx();
    const spins = [18, 20, 22, 24, 26]; // diferentes “vueltas”
    const baseDur = 700;

    // Para cada reel, animamos hacia abajo y al final “seteamos” el resultado visible
    await Promise.all(el.tracks.map(async (track, r) => {
      const distance = spins[r] * cellH;
      track.style.transition = `transform ${baseDur + r * 140}ms cubic-bezier(.16,.95,.2,1)`;
      // pequeño “shake” audio
      sfxSpin();
      // mueve
      track.style.transform = `translateY(${-distance}px)`;
      await sleep(baseDur + r * 140);
      sfxStop();

      // “snap” al resultado: reconstruimos track con resultado en el centro (3 filas visibles)
      track.style.transition = "none";
      track.innerHTML = "";

      // armamos un strip nuevo: algunos random arriba/abajo + 3 visibles centradas
      const padTop = 6;
      const padBot = 6;

      for (let i = 0; i < padTop; i++) track.appendChild(buildCell(weightedPick(SYMBOLS)));
      // visibles (top/mid/bot)
      track.appendChild(buildCell(SYMBOLS.find(s => s.key === finalMatrix[r][0]) || weightedPick(SYMBOLS)));
      track.appendChild(buildCell(SYMBOLS.find(s => s.key === finalMatrix[r][1]) || weightedPick(SYMBOLS)));
      track.appendChild(buildCell(SYMBOLS.find(s => s.key === finalMatrix[r][2]) || weightedPick(SYMBOLS)));
      for (let i = 0; i < padBot; i++) track.appendChild(buildCell(weightedPick(SYMBOLS)));

      // dejamos “centrado” para que se vean 3 filas (las del medio)
      // (con overflow hidden del reel, se ven las 3 del centro)
      track.style.transform = `translateY(${-padTop * cellH}px)`;
    }));
  }

  function generateResultMatrix() {
    // 5 reels x 3 rows
    const m = Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => weightedPick(SYMBOLS).key));

    // pequeña “lógica casino”: BONUS no demasiado frecuente
    // si salieron demasiados BONUS, reducimos
    let bonusCount = m.flat().filter(k => k === "BONUS").length;
    while (bonusCount > 4) {
      const rr = rand(0, 4);
      const cc = rand(0, 2);
      if (m[rr][cc] === "BONUS") m[rr][cc] = weightedPick(SYMBOLS.filter(s => s.key !== "BONUS")).key;
      bonusCount = m.flat().filter(k => k === "BONUS").length;
    }

    return m;
  }

  async function spinOnce() {
    if (isSpinning) return;
    if (!canAffordSpin()) {
      setMessage("❌ No tienes créditos suficientes.");
      sfxLose();
      return;
    }

    isSpinning = true;
    clearPaylineGlow();
    el.machine.classList.remove("win", "jackpotHit");
    setControlsEnabled(false);

    try {
      lastWin = 0;
      renderHUD();

      // cobrar apuesta
      state.credits -= totalBet();

      // jackpot incrementa siempre
      state.jackpot += Math.max(1, Math.floor(totalBet() * 0.15));

      setMessage("🎰 Girando...");
      renderHUD();

      const matrix = generateResultMatrix();
      await animateReels(matrix);

      // evaluar
      const { total, wins, bonusTriggered, bonusCount } = evaluate(matrix);

      // jackpot por combinación 777 en línea 1 (middle) o por probabilidad
      const middle777 =
        matrix[0][1] === "SEVEN" && matrix[1][1] === "SEVEN" && matrix[2][1] === "SEVEN" && matrix[3][1] === "SEVEN" && matrix[4][1] === "SEVEN";

      const hitJackpot = middle777 || (Math.random() < jackpotChanceBoost());

      let jackpotWin = 0;
      if (hitJackpot) {
        jackpotWin = state.jackpot;
        state.jackpot = 1000; // reset base
      }

      const totalWin = total + jackpotWin;
      lastWin = totalWin;

      if (wins.length) glowPaylines(wins.map(w => w.line));

      if (totalWin > 0) {
        state.credits += totalWin;
        el.machine.classList.add("win");
        setMessage(
          hitJackpot
            ? `💥 JACKPOT! +${jackpotWin} | Total Win: ${totalWin}`
            : `✅ WIN: +${totalWin}`
        );
        sfxWin();
      } else {
        setMessage(`Sin premio. Intenta otra vez.`);
        sfxLose();
      }

      if (hitJackpot) {
        el.machine.classList.add("jackpotHit");
        sfxJackpot();
      }

      renderHUD();
      save();

      if (bonusTriggered) {
        await runBonusGame(bonusCount);
        renderHUD();
        save();
      }
    } catch (err) {
      console.error(err);
      setMessage("⚠️ Error en el giro. Se reactivó SPIN.");
    } finally {
      isSpinning = false;
      setControlsEnabled(true);

      // si auto sigue activo, gira de nuevo
      if (state.auto) {
        await sleep(3500);
        // chequeo por si se quedó sin créditos
        if (canAffordSpin()) spinOnce();
        else {
          state.auto = false;
          renderHUD();
          setMessage("AUTO detenido: sin créditos.");
        }
      }
    }
  }

  /* ---------- Bonus game ---------- */
  async function runBonusGame(bonusCount) {
    // premio base según cantidad de BONUS
    const base = bonusCount === 3 ? 30 : bonusCount === 4 ? 60 : 120;
    const picks = 3;

    el.bonusModal.classList.add("show");
    el.bonusModal.setAttribute("aria-hidden", "false");
    el.bonusDoneBtn.disabled = true;

    el.bonusSub.textContent = `Salieron ${bonusCount} BONUS. Elige ${picks} cajas (premio base: ${base}).`;

    // construir cajas
    el.bonusGrid.innerHTML = "";
    const prizes = Array.from({ length: 9 }, () => base + rand(0, base * 2));
    // metemos 2 “mega”
    prizes[rand(0, 8)] += base * 4;
    prizes[rand(0, 8)] += base * 3;

    let chosen = 0;
    let bonusWin = 0;

    const onPick = (btn, value) => {
      if (btn.classList.contains("open")) return;
      if (chosen >= picks) return;

      btn.classList.add("open");
      btn.textContent = `+${value}`;
      chosen++;
      bonusWin += value;

      if (chosen >= picks) {
        el.bonusDoneBtn.disabled = false;
        el.bonusDoneBtn.focus();
      }
    };

    for (let i = 0; i < 9; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bonusBox";
      b.textContent = "¿?";
      b.addEventListener("click", () => onPick(b, prizes[i]));
      el.bonusGrid.appendChild(b);
    }

    await new Promise((resolve) => {
      const done = () => {
        el.bonusDoneBtn.removeEventListener("click", done);
        resolve();
      };
      el.bonusDoneBtn.addEventListener("click", done);
    });

    el.bonusModal.classList.remove("show");
    el.bonusModal.setAttribute("aria-hidden", "true");

    if (bonusWin > 0) {
      state.credits += bonusWin;
      lastWin += bonusWin;
      setMessage(`🎁 BONUS cobrado: +${bonusWin}`);
      sfxWin();
    }
  }

  /* ---------- Buttons / Inputs ---------- */
  function setBet(delta) {
    if (isSpinning) return;
    state.betPerLine = clamp(state.betPerLine + delta, 1, 50);
    renderHUD();
    save();
  }

  function toggleLines() {
    if (isSpinning) return;
    state.lines = state.lines === 9 ? 15 : 9;
    renderHUD();
    save();
  }

  function maxBet() {
    if (isSpinning) return;
    state.lines = 15;
    state.betPerLine = 10;
    renderHUD();
    save();
  }

  function toggleMute() {
    state.muted = !state.muted;
    renderHUD();
    save();
    setMessage(state.muted ? "🔇 Sonido OFF" : "🔊 Sonido ON");
  }

  function toggleAuto() {
    state.auto = !state.auto;
    renderHUD();
    save();
    setMessage(state.auto ? "AUTO activado" : "AUTO desactivado");
    if (state.auto && !isSpinning) spinOnce();
  }

  function cashout() {
    if (isSpinning) return;
    state.auto = false;
    renderHUD();
    setMessage(`💰 CASHOUT: te quedaste con ${state.credits} créditos.`);
    // aquí podrías guardar récord / enviar a server si quieres
  }

  function resetGame() {
    if (isSpinning) return;
    state = { credits: 500, betPerLine: 1, lines: 9, jackpot: 1000, muted: false, auto: false };
    lastWin = 0;
    clearPaylineGlow();
    el.machine.classList.remove("win", "jackpotHit");
    renderReelsInitial();
    renderHUD();
    save();
    setMessage("LISTO ▶ Presiona SPIN");
  }

  /* ---------- Events ---------- */
  function bind() {
    el.betMinus.addEventListener("click", () => setBet(-1));
    el.betPlus.addEventListener("click", () => setBet(+1));
    el.linesBtn.addEventListener("click", toggleLines);
    el.spinBtn.addEventListener("click", () => spinOnce());
    el.autoBtn.addEventListener("click", toggleAuto);
    el.maxBetBtn.addEventListener("click", maxBet);
    el.muteBtn.addEventListener("click", toggleMute);
    el.cashoutBtn.addEventListener("click", cashout);
    el.resetBtn.addEventListener("click", resetGame);

    // Teclas
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.code === "Space") { e.preventDefault(); spinOnce(); }
      if (e.key?.toLowerCase() === "a") toggleAuto();
      if (e.key?.toLowerCase() === "m") toggleMute();
    });

    // iOS: reanudar audio tras primer toque
    window.addEventListener("pointerdown", () => {
      if (!state.muted) ensureAudio();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
    }, { once: true });
  }

  /* ---------- Init ---------- */
  function init() {
    load();
    renderReelsInitial();
    renderHUD();
    bind();
    setMessage("LISTO ▶ Presiona SPIN");
  }

  // Asegura que el DOM exista antes de enganchar botones
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
