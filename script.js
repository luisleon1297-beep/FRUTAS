/**
 * Tragamonedas PRO:
 * - Sonidos (giro / win / lose) generados con WebAudio (sin archivos externos)
 * - Animación real con rodillos (track que se desplaza y frena)
 * - Niveles + XP
 * - Jackpot acumulado
 * - Ranking localStorage (top 10, guarda mejor record por nombre)
 */

const SYMBOLS = [
  { icon:"🍒", name:"Cereza",   payout3: 6,  payout2: 2,  baseWeight: 26 },
  { icon:"🍋", name:"Limón",    payout3: 5,  payout2: 2,  baseWeight: 24 },
  { icon:"🍇", name:"Uva",      payout3: 7,  payout2: 3,  baseWeight: 20 },
  { icon:"🍉", name:"Sandía",   payout3: 8,  payout2: 3,  baseWeight: 14 },
  { icon:"🍍", name:"Piña",     payout3: 10, payout2: 4,  baseWeight: 10 },
  { icon:"⭐", name:"Estrella", payout3: 14, payout2: 6,  baseWeight: 4  },
  { icon:"7️⃣", name:"Siete",   payout3: 20, payout2: 10, baseWeight: 2  },
];

const LS_KEY = "slotpro_ranking_v1";
const LS_STATE = "slotpro_state_v1";

let credits = 100;
let bet = 10;
let streak = 0;

let level = 1;
let xp = 0;

let jackpot = 500;

let spinning = false;
let autoInterval = null;
let muted = false;

// DOM
const elCredits = document.getElementById("credits");
const elBet = document.getElementById("betValue");
const elStreak = document.getElementById("streak");
const elLevel = document.getElementById("level");
const elXp = document.getElementById("xp");
const elJackpot = document.getElementById("jackpot");
const elMsg = document.getElementById("message");

const betMinus = document.getElementById("betMinus");
const betPlus  = document.getElementById("betPlus");
const spinBtn  = document.getElementById("spinBtn");
const resetBtn = document.getElementById("resetBtn");
const autoBtn  = document.getElementById("autoBtn");
const muteBtn  = document.getElementById("muteBtn");

const trackEls = [
  document.getElementById("track1"),
  document.getElementById("track2"),
  document.getElementById("track3"),
];

const rankList = document.getElementById("rankList");
const playerNameInput = document.getElementById("playerName");
const saveScoreBtn = document.getElementById("saveScoreBtn");

// -------------------- Utils --------------------
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function randInt(max){ return Math.floor(Math.random() * max); }
function wait(ms){ return new Promise(r => setTimeout(r, ms)); }
function setMessage(text, type){
  elMsg.classList.remove("good","bad");
  if(type) elMsg.classList.add(type);
  elMsg.textContent = text;
}
function updateUI(){
  elCredits.textContent = credits;
  elBet.textContent = bet;
  elStreak.textContent = streak;
  elLevel.textContent = level;
  elXp.textContent = xp;
  elJackpot.textContent = jackpot;

  betMinus.disabled = spinning || bet <= 1;
  betPlus.disabled  = spinning || bet >= 50;

  spinBtn.disabled  = spinning || credits < bet;
  autoBtn.disabled  = credits < bet && !autoInterval;
  saveScoreBtn.disabled = spinning;

  muteBtn.textContent = muted ? "🔇 Silencio" : "🔊 Sonido";
}

// -------------------- Sonido (WebAudio) --------------------
let audioCtx = null;

function getAudioCtx(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function beep({freq=440, duration=0.08, type="sine", gain=0.05, slideTo=null}){
  if(muted) return;
  const ctx = getAudioCtx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if(slideTo){
    o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
  }
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + duration);
}

function sfxSpinTick(){
  beep({freq: 420 + randInt(80), duration: 0.03, type:"square", gain:0.025, slideTo: 300});
}
function sfxWin(){
  beep({freq: 523, duration: 0.08, type:"triangle", gain:0.06});
  setTimeout(()=>beep({freq: 659, duration: 0.10, type:"triangle", gain:0.06}), 90);
  setTimeout(()=>beep({freq: 784, duration: 0.12, type:"triangle", gain:0.06}), 210);
}
function sfxLose(){
  beep({freq: 220, duration: 0.12, type:"sawtooth", gain:0.05, slideTo: 140});
}

// -------------------- Probabilidades (con “suerte” por nivel) --------------------
function weightedPick(){
  // Sube un poquito la chance de ⭐ y 7️⃣ al subir de nivel (suave, sin romper el juego)
  // bonusLuck: 0..?
  const bonusLuck = Math.min(8, Math.floor((level - 1) / 2)); // cada 2 niveles +1, cap 8
  const weights = SYMBOLS.map(s => s.baseWeight);

  // ⭐ index 5, 7️⃣ index 6
  weights[5] += bonusLuck;
  weights[6] += Math.floor(bonusLuck / 2);

  const total = weights.reduce((a,b)=>a+b,0);
  let r = Math.random() * total;
  for(let i=0;i<SYMBOLS.length;i++){
    r -= weights[i];
    if(r <= 0) return SYMBOLS[i];
  }
  return SYMBOLS[0];
}

// -------------------- Rodillos (animación real) --------------------
const SYMBOL_HEIGHT = 70; // coincide con CSS (.symbol height)
const VISIBLE_CENTER_INDEX = 1; // centro en una “ventana” de 3 visibles

function buildTrack(trackEl){
  // 3 visibles + extras para desplazar sin cortes (ej: 20 símbolos)
  const totalItems = 22;
  trackEl.innerHTML = "";
  for(let i=0;i<totalItems;i++){
    const s = SYMBOLS[randInt(SYMBOLS.length)].icon;
    const div = document.createElement("div");
    div.className = "symbol";
    div.textContent = s;
    trackEl.appendChild(div);
  }
  trackEl.style.transform = `translateY(${-SYMBOL_HEIGHT}px)`; // centro visible
}

function setCenterSymbol(trackEl, icon){
  // Pone el ícono en la línea central
  const nodes = trackEl.querySelectorAll(".symbol");
  nodes[VISIBLE_CENTER_INDEX].textContent = icon;
}

function fillRandom(trackEl){
  const nodes = trackEl.querySelectorAll(".symbol");
  nodes.forEach(n => n.textContent = SYMBOLS[randInt(SYMBOLS.length)].icon);
}

function animateReelStop(trackEl, finalIcon, durationMs){
  return new Promise(resolve => {
    // Vamos a mover el track hacia abajo y “frenar”
    // 1) rellenar aleatorio para sensación de giro
    fillRandom(trackEl);

    // 2) definir un desplazamiento grande (varias vueltas)
    const loops = 10 + randInt(6); // vueltas
    const distance = (loops * SYMBOL_HEIGHT);

    // 3) transición
    trackEl.style.transition = "none";
    trackEl.style.transform = `translateY(${-SYMBOL_HEIGHT}px)`;
    // Force reflow
    void trackEl.offsetHeight;

    trackEl.style.transition = `transform ${durationMs}ms cubic-bezier(.12,.9,.18,1)`;
    trackEl.style.transform = `translateY(${distance - SYMBOL_HEIGHT}px)`;

    // ticks durante el giro
    const tickInt = setInterval(() => sfxSpinTick(), 90);

    // 4) al terminar: reset visual a posición base y fijar símbolo central
    setTimeout(() => {
      clearInterval(tickInt);
      trackEl.style.transition = "none";
      trackEl.style.transform = `translateY(${-SYMBOL_HEIGHT}px)`;
      setCenterSymbol(trackEl, finalIcon);
      resolve();
    }, durationMs + 20);
  });
}

// -------------------- Premios / XP / Nivel / Jackpot --------------------
function matches(a,b,c){
  if(a.icon === b.icon && b.icon === c.icon) return {kind:"three", sym:a};
  if(a.icon === b.icon) return {kind:"two", sym:a};
  if(a.icon === c.icon) return {kind:"two", sym:a};
  if(b.icon === c.icon) return {kind:"two", sym:b};
  return {kind:"none", sym:null};
}

function computePayout(result, betAmount){
  const [a,b,c] = result;
  const m = matches(a,b,c);

  if(m.kind === "three"){
    let win = (m.sym.payout3 * betAmount);
    // bonus clásico 🍒🍒🍒
    if(m.sym.icon === "🍒") win += 4;
    return {win, three:true, two:false};
  }
  if(m.kind === "two"){
    const win = Math.max(1, Math.round(m.sym.payout2 * betAmount));
    return {win, three:false, two:true};
  }
  return {win:0, three:false, two:false};
}

function xpToNextLevel(lv){
  // sube progresivo
  return 60 + (lv-1)*25;
}

function addXP(amount){
  xp += amount;
  let needed = xpToNextLevel(level);
  while(xp >= needed){
    xp -= needed;
    level++;
    needed = xpToNextLevel(level);
    setMessage(`⬆️ ¡Subiste a nivel ${level}! Tu suerte aumentó un poco.`, "good");
    // pequeño bonus de créditos al subir
    credits += 15 + level * 2;
  }
}

function addToJackpot(amount){
  jackpot += amount;
  // para que no se dispare, cap suave
  jackpot = Math.min(jackpot, 25000);
}

function tryJackpot(result){
  // Jackpot solo si 7️⃣ 7️⃣ 7️⃣ (probable raro). Podrías hacerlo por probabilidad también.
  const [a,b,c] = result;
  if(a.icon === "7️⃣" && b.icon === "7️⃣" && c.icon === "7️⃣"){
    const prize = jackpot;
    jackpot = 500; // reset base
    return prize;
  }
  return 0;
}

// -------------------- Ranking localStorage --------------------
function loadRanking(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return [];
    const data = JSON.parse(raw);
    if(!Array.isArray(data)) return [];
    return data;
  }catch{ return []; }
}
function saveRanking(list){
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}
function renderRanking(){
  const list = loadRanking()
    .sort((a,b)=>b.score - a.score)
    .slice(0,10);

  rankList.innerHTML = "";
  if(list.length === 0){
    const li = document.createElement("li");
    li.textContent = "Aún no hay puntajes guardados.";
    rankList.appendChild(li);
    return;
  }

  list.forEach((r,i)=>{
    const li = document.createElement("li");
    li.innerHTML = `<b>#${i+1} ${escapeHTML(r.name)}</b><span>${r.score}</span>`;
    rankList.appendChild(li);
  });
}
function escapeHTML(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

function saveScore(name, score){
  name = (name || "").trim();
  if(!name) name = "Jugador";

  const list = loadRanking();
  const existing = list.find(x => x.name.toLowerCase() === name.toLowerCase());
  if(existing){
    // guarda el mejor
    if(score > existing.score) existing.score = score;
  }else{
    list.push({name, score});
  }
  saveRanking(list);
  renderRanking();
}

// -------------------- Guardar/recuperar estado --------------------
function saveState(){
  const state = {credits, bet, streak, level, xp, jackpot, muted};
  localStorage.setItem(LS_STATE, JSON.stringify(state));
}
function loadState(){
  try{
    const raw = localStorage.getItem(LS_STATE);
    if(!raw) return;
    const s = JSON.parse(raw);
    if(!s) return;

    credits = typeof s.credits === "number" ? s.credits : credits;
    bet     = typeof s.bet === "number" ? s.bet : bet;
    streak  = typeof s.streak === "number" ? s.streak : streak;
    level   = typeof s.level === "number" ? s.level : level;
    xp      = typeof s.xp === "number" ? s.xp : xp;
    jackpot = typeof s.jackpot === "number" ? s.jackpot : jackpot;
    muted   = typeof s.muted === "boolean" ? s.muted : muted;
  }catch{}
}

// -------------------- Juego --------------------
function stopAuto(){
  if(autoInterval){
    clearInterval(autoInterval);
    autoInterval = null;
    autoBtn.textContent = "Auto";
  }
}

async function spinOnce(){
  if(spinning) return;
  if(credits < bet){
    setMessage("No tienes créditos suficientes para esa apuesta.", "bad");
    stopAuto();
    return;
  }

  // desbloquea audio al primer click/giro
  if(!muted){
    const ctx = getAudioCtx();
    if(ctx.state === "suspended") ctx.resume();
  }

  spinning = true;
  updateUI();

  // costo de apuesta + crecimiento de jackpot
  credits -= bet;
  addToJackpot(Math.max(1, Math.floor(bet * 0.35))); // parte de la apuesta va al jackpot
  updateUI();

  setMessage("Girando...", null);

  // Elegir resultado final
  const final = [weightedPick(), weightedPick(), weightedPick()];

  // Animar stops escalonados
  await Promise.all([
    animateReelStop(trackEls[0], final[0].icon, 950),
    (async()=>{ await wait(180); await animateReelStop(trackEls[1], final[1].icon, 1100); })(),
    (async()=>{ await wait(360); await animateReelStop(trackEls[2], final[2].icon, 1250); })(),
  ]);

  // Calcular premio normal
  const pay = computePayout(final, bet);
  const combo = final.map(s=>s.icon).join(" ");

  // Jackpot si 777
  const jackpotWin = tryJackpot(final);

  let totalWin = pay.win + jackpotWin;

  if(totalWin > 0){
    credits += totalWin;
    streak += 1;

    // XP: más por 3 iguales y por jackpot
    let gainedXP = 10;
    if(pay.three) gainedXP += 18;
    if(pay.two) gainedXP += 6;
    if(jackpotWin > 0) gainedXP += 50;

    addXP(gainedXP);

    if(jackpotWin > 0){
      sfxWin();
      setMessage(`💥 ${combo} — ¡JACKPOT! +${jackpotWin} (más premio: +${pay.win}). Total +${totalWin}.`, "good");
    }else{
      sfxWin();
      setMessage(`✅ ${combo} — Ganaste +${pay.win} (apuesta ${bet}).`, "good");
    }
  } else {
    streak = 0;
    sfxLose();
    setMessage(`❌ ${combo} — Perdiste ${bet}.`, "bad");
  }

  spinning = false;
  updateUI();
  saveState();

  if(credits <= 0){
    setMessage("Te quedaste sin créditos. Presiona Reiniciar para volver a jugar.", "bad");
    stopAuto();
    updateUI();
  }
}

// -------------------- Eventos UI --------------------
spinBtn.addEventListener("click", spinOnce);

betMinus.addEventListener("click", () => {
  bet = clamp(bet - 1, 1, 50);
  updateUI();
  saveState();
});
betPlus.addEventListener("click", () => {
  bet = clamp(bet + 1, 1, 50);
  updateUI();
  saveState();
});

resetBtn.addEventListener("click", () => {
  stopAuto();
  credits = 100;
  bet = 10;
  streak = 0;
  level = 1;
  xp = 0;
  jackpot = 500;
  setMessage("Reiniciado. Ajusta tu apuesta y presiona GIRAR.", null);
  spinning = false;

  trackEls.forEach(buildTrack);
  setCenterSymbol(trackEls[0], "🍒");
  setCenterSymbol(trackEls[1], "🍋");
  setCenterSymbol(trackEls[2], "🍇");

  updateUI();
  saveState();
});

autoBtn.addEventListener("click", () => {
  if(autoInterval){
    stopAuto();
    return;
  }
  if(credits < bet){
    setMessage("No tienes créditos suficientes para usar Auto.", "bad");
    return;
  }
  autoBtn.textContent = "Detener";
  autoInterval = setInterval(() => {
    if(!spinning) spinOnce();
  }, 1200);
});

muteBtn.addEventListener("click", () => {
  muted = !muted;
  updateUI();
  saveState();
});

saveScoreBtn.addEventListener("click", () => {
  const name = playerNameInput.value.trim() || "Jugador";
  // guardamos el “mejor record” como créditos actuales + jackpot (para motivar)
  const score = Math.max(0, Math.floor(credits));
  saveScore(name, score);
  setMessage(`🏆 Guardado: ${name} con ${score} créditos.`, "good");
});

// Atajos teclado
document.addEventListener("keydown", (e) => {
  if(e.code === "Space"){
    e.preventDefault();
    spinOnce();
  }
  if(e.key.toLowerCase() === "a"){
    autoBtn.click();
  }
  if(e.key.toLowerCase() === "m"){
    muteBtn.click();
  }
});

// -------------------- Init --------------------
loadState();
trackEls.forEach(buildTrack);
setCenterSymbol(trackEls[0], "🍒");
setCenterSymbol(trackEls[1], "🍋");
setCenterSymbol(trackEls[2], "🍇");
renderRanking();
updateUI();
setMessage("Listo. Ajusta tu apuesta y presiona GIRAR (Espacio).", null);

// Guardar estado al cerrar/recargar
window.addEventListener("beforeunload", saveState);
