/**
 * PIXEL SLOT CASINO:
 * - Pixel UI + luces parpadeantes al ganar (CSS class .win)
 * - Sonidos WebAudio (sin archivos)
 * - Jackpot acumulado + probabilidad (además de 777)
 * - Max Bet
 * - Cobrar/Retirar (guarda récord automáticamente en ranking)
 * - Niveles + XP + “suerte” leve
 * - Ranking en localStorage + guarda estado del juego
 */

const SYMBOLS = [
  { icon:"🍒", payout3: 6,  payout2: 2,  baseWeight: 26 },
  { icon:"🍋", payout3: 5,  payout2: 2,  baseWeight: 24 },
  { icon:"🍇", payout3: 7,  payout2: 3,  baseWeight: 20 },
  { icon:"🍉", payout3: 8,  payout2: 3,  baseWeight: 14 },
  { icon:"🍍", payout3: 10, payout2: 4,  baseWeight: 10 },
  { icon:"⭐", payout3: 14, payout2: 6,  baseWeight: 4  },
  { icon:"7️⃣", payout3: 20, payout2: 10, baseWeight: 2  },
];

const LS_RANK = "pixel_slot_rank_v1";
const LS_STATE = "pixel_slot_state_v1";

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
const cabinet = document.getElementById("cabinet");
const elCredits = document.getElementById("credits");
const elBet = document.getElementById("betValue");
const elLevel = document.getElementById("level");
const elXp = document.getElementById("xp");
const elStreak = document.getElementById("streak");
const elJackpot = document.getElementById("jackpot");
const elMsg = document.getElementById("message");
const marqueeText = document.getElementById("marqueeText");

const trackEls = [
  document.getElementById("track1"),
  document.getElementById("track2"),
  document.getElementById("track3"),
];

const betMinus = document.getElementById("betMinus");
const betPlus  = document.getElementById("betPlus");
const spinBtn  = document.getElementById("spinBtn");
const maxBetBtn= document.getElementById("maxBetBtn");
const cashoutBtn = document.getElementById("cashoutBtn");

const autoBtn  = document.getElementById("autoBtn");
const muteBtn  = document.getElementById("muteBtn");
const resetBtn = document.getElementById("resetBtn");

const rankList = document.getElementById("rankList");
const playerNameInput = document.getElementById("playerName");
const saveScoreBtn = document.getElementById("saveScoreBtn");

// reel settings
const SYMBOL_HEIGHT = 72;
const CENTER_INDEX = 1;

// ---------- helpers ----------
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
function randInt(max){ return Math.floor(Math.random()*max); }
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

function setMessage(text, type){
  elMsg.classList.remove("good","bad");
  if(type) elMsg.classList.add(type);
  elMsg.textContent = text;

  marqueeText.textContent = text.toUpperCase();
}

function updateUI(){
  elCredits.textContent = credits;
  elBet.textContent = bet;
  elLevel.textContent = level;
  elXp.textContent = xp;
  elStreak.textContent = streak;
  elJackpot.textContent = jackpot;

  betMinus.disabled = spinning || bet <= 1;
  betPlus.disabled = spinning || bet >= 50;
  spinBtn.disabled = spinning || credits < bet;
  maxBetBtn.disabled = spinning || credits < 1;
  cashoutBtn.disabled = spinning;

  autoBtn.disabled = credits < bet && !autoInterval;

  muteBtn.textContent = muted ? "MUTE" : "SONIDO";
}

function winLights(on){
  cabinet.classList.toggle("win", !!on);
}

// ---------- audio ----------
let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep({freq=440, duration=0.08, type="square", gain=0.03, slideTo=null}){
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
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + duration);
}
function sfxTick(){ beep({freq: 360 + randInt(120), duration:0.028, type:"square", gain:0.02, slideTo: 220}); }
function sfxWin(){
  beep({freq:523, duration:0.07, type:"triangle", gain:0.06});
  setTimeout(()=>beep({freq:659, duration:0.09, type:"triangle", gain:0.06}), 90);
  setTimeout(()=>beep({freq:784, duration:0.11, type:"triangle", gain:0.06}), 210);
}
function sfxLose(){ beep({freq:220, duration:0.14, type:"sawtooth", gain:0.05, slideTo:130}); }

// ---------- probability + level “luck” ----------
function weightedPick(){
  const bonusLuck = Math.min(10, Math.floor((level - 1) / 2));
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

// ---------- reels ----------
function buildTrack(trackEl){
  const totalItems = 24;
  trackEl.innerHTML = "";
  for(let i=0;i<totalItems;i++){
    const div = document.createElement("div");
    div.className = "symbol";
    div.textContent = SYMBOLS[randInt(SYMBOLS.length)].icon;
    trackEl.appendChild(div);
  }
  trackEl.style.transform = `translateY(${-SYMBOL_HEIGHT}px)`;
}

function fillRandom(trackEl){
  trackEl.querySelectorAll(".symbol").forEach(n=>{
    n.textContent = SYMBOLS[randInt(SYMBOLS.length)].icon;
  });
}

function setCenter(trackEl, icon){
  const nodes = trackEl.querySelectorAll(".symbol");
  nodes[CENTER_INDEX].textContent = icon;
}

function animateReelStop(trackEl, finalIcon, durationMs){
  return new Promise(resolve=>{
    fillRandom(trackEl);

    const loops = 12 + randInt(7);
    const distance = loops * SYMBOL_HEIGHT;

    trackEl.style.transition = "none";
    trackEl.style.transform = `translateY(${-SYMBOL_HEIGHT}px)`;
    void trackEl.offsetHeight;

    trackEl.style.transition = `transform ${durationMs}ms cubic-bezier(.12,.95,.15,1)`;
    trackEl.style.transform = `translateY(${distance - SYMBOL_HEIGHT}px)`;

    const tick = setInterval(()=>sfxTick(), 85);

    setTimeout(()=>{
      clearInterval(tick);
      trackEl.style.transition = "none";
      trackEl.style.transform = `translateY(${-SYMBOL_HEIGHT}px)`;
      setCenter(trackEl, finalIcon);
      resolve();
    }, durationMs + 25);
  });
}

// ---------- payout + level + jackpot ----------
function match(a,b,c){
  if(a.icon===b.icon && b.icon===c.icon) return {kind:"three", sym:a};
  if(a.icon===b.icon) return {kind:"two", sym:a};
  if(a.icon===c.icon) return {kind:"two", sym:a};
  if(b.icon===c.icon) return {kind:"two", sym:b};
  return {kind:"none", sym:null};
}

function computePayout(result, betAmount){
  const [a,b,c] = result;
  const m = match(a,b,c);

  if(m.kind==="three"){
    let win = m.sym.payout3 * betAmount;
    if(m.sym.icon==="🍒") win += 4; // bonus clásico
    return {win, three:true, two:false};
  }
  if(m.kind==="two"){
    const win = Math.max(1, Math.round(m.sym.payout2 * betAmount));
    return {win, three:false, two:true};
  }
  return {win:0, three:false, two:false};
}

function xpToNext(lv){ return 60 + (lv-1)*25; }

function addXP(amount){
  xp += amount;
  let need = xpToNext(level);
  while(xp >= need){
    xp -= need;
    level++;
    credits += 15 + level * 2;
    need = xpToNext(level);
    setMessage(`SUBISTE A NIVEL ${level}! +SUERTE Y BONUS`, "good");
  }
}

function addToJackpot(amount){
  jackpot += amount;
  jackpot = Math.min(jackpot, 30000);
}

// Jackpot por probabilidad:
// - siempre crece con giros
// - al ganar, paga el monto y vuelve a 500
function jackpotChance(){
  // Probabilidad pequeña que sube levemente con nivel y tamaño de apuesta
  // Base: 0.25% (1/400). Aumenta con nivel y apuesta (cap)
  const pBase = 1/400;
  const pLevel = Math.min(0.004, (level-1) * 0.00025);     // +0..0.4%
  const pBet   = Math.min(0.003, (bet/50) * 0.003);        // +0..0.3%
  const p = pBase + pLevel + pBet;                         // cap aprox < 1%
  return Math.random() < p;
}

function jackpot777(result){
  const [a,b,c] = result;
  return (a.icon==="7️⃣" && b.icon==="7️⃣" && c.icon==="7️⃣");
}

// ---------- ranking / state ----------
function loadRanking(){
  try{
    const raw = localStorage.getItem(LS_RANK);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  }catch{ return []; }
}
function saveRanking(list){ localStorage.setItem(LS_RANK, JSON.stringify(list)); }
function escapeHTML(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}
function renderRanking(){
  const list = loadRanking().sort((a,b)=>b.score-a.score).slice(0,10);
  rankList.innerHTML = "";
  if(list.length===0){
    const li = document.createElement("li");
    li.textContent = "SIN PUNTAJES AUN.";
    rankList.appendChild(li);
    return;
  }
  list.forEach((r,i)=>{
    const li = document.createElement("li");
    li.innerHTML = `<b>#${i+1} ${escapeHTML(r.name)}</b><span>${r.score}</span>`;
    rankList.appendChild(li);
  });
}
function saveScore(name, score){
  name = (name||"").trim().toUpperCase() || "JUGADOR";
  const list = loadRanking();
  const ex = list.find(x => x.name === name);
  if(ex){
    if(score > ex.score) ex.score = score;
  }else{
    list.push({name, score});
  }
  saveRanking(list);
  renderRanking();
}

function saveState(){
  localStorage.setItem(LS_STATE, JSON.stringify({
    credits, bet, streak, level, xp, jackpot, muted
  }));
}
function loadState(){
  try{
    const raw = localStorage.getItem(LS_STATE);
    if(!raw) return;
    const s = JSON.parse(raw);
    if(!s) return;
    if(typeof s.credits==="number") credits=s.credits;
    if(typeof s.bet==="number") bet=s.bet;
    if(typeof s.streak==="number") streak=s.streak;
    if(typeof s.level==="number") level=s.level;
    if(typeof s.xp==="number") xp=s.xp;
    if(typeof s.jackpot==="number") jackpot=s.jackpot;
    if(typeof s.muted==="boolean") muted=s.muted;
  }catch{}
}

// ---------- gameplay ----------
function stopAuto(){
  if(autoInterval){
    clearInterval(autoInterval);
    autoInterval = null;
    autoBtn.textContent = "AUTO";
  }
}

async function spinOnce(){
  if(spinning) return;
  if(credits < bet){
    setMessage("NO TIENES CREDITOS PARA ESA APUESTA.", "bad");
    stopAuto();
    return;
  }

  // unlock audio on interaction
  if(!muted){
    const ctx = getAudioCtx();
    if(ctx.state === "suspended") ctx.resume();
  }

  winLights(false);
  spinning = true;
  updateUI();

  credits -= bet;
  addToJackpot(Math.max(1, Math.floor(bet * 0.40)));
  saveState();
  updateUI();

  setMessage("GIRANDO...", null);

  const final = [weightedPick(), weightedPick(), weightedPick()];

  await Promise.all([
    animateReelStop(trackEls[0], final[0].icon, 980),
    (async()=>{ await wait(180); await animateReelStop(trackEls[1], final[1].icon, 1120); })(),
    (async()=>{ await wait(360); await animateReelStop(trackEls[2], final[2].icon, 1280); })(),
  ]);

  const combo = final.map(s=>s.icon).join(" ");
  const pay = computePayout(final, bet);

  // Jackpot si 777 o por chance
  let jackpotWin = 0;
  const hit777 = jackpot777(final);
  const hitChance = !hit777 && jackpotChance(); // chance extra aunque no sea 777
  if(hit777 || hitChance){
    jackpotWin = jackpot;
    jackpot = 500;
  }

  const totalWin = pay.win + jackpotWin;

  if(totalWin > 0){
    credits += totalWin;
    streak++;

    let gainedXP = 10 + (pay.two ? 6 : 0) + (pay.three ? 18 : 0) + (jackpotWin>0 ? 50 : 0);
    // pequeño bonus por racha
    gainedXP += Math.min(20, streak * 2);
    addXP(gainedXP);

    sfxWin();
    winLights(true);

    if(jackpotWin > 0){
      const why = hit777 ? "777" : "CHANCE";
      setMessage(`💥 ${combo} — JACKPOT (${why}) +${jackpotWin} | +${pay.win} = +${totalWin}`, "good");
    }else{
      setMessage(`✅ ${combo} — GANASTE +${pay.win}`, "good");
    }
  } else {
    streak = 0;
    sfxLose();
    setMessage(`❌ ${combo} — PERDISTE ${bet}`, "bad");
  }

  spinning = false;
  updateUI();
  saveState();

  // apagar luces después de un rato
  if(cabinet.classList.contains("win")){
    setTimeout(()=>winLights(false), 1200);
  }

  if(credits <= 0){
    setMessage("SIN CREDITOS. REINICIA O COBRA PARA GUARDAR.", "bad");
    stopAuto();
    updateUI();
  }
}

function cashout(){
  // Guarda automáticamente el récord con el nombre
  const name = (playerNameInput.value || "JUGADOR").trim() || "JUGADOR";
  const score = Math.max(0, Math.floor(credits));
  saveScore(name, score);
  setMessage(`💾 COBRADO: ${name.toUpperCase()} = ${score} CREDITOS (GUARDADO)`, "good");
  sfxWin();
  winLights(true);
  setTimeout(()=>winLights(false), 900);
}

// ---------- events ----------
spinBtn.addEventListener("click", spinOnce);

betMinus.addEventListener("click", ()=>{
  bet = clamp(bet-1, 1, 50);
  updateUI(); saveState();
});
betPlus.addEventListener("click", ()=>{
  bet = clamp(bet+1, 1, 50);
  updateUI(); saveState();
});

maxBetBtn.addEventListener("click", ()=>{
  // MAX BET = apuesta máxima permitida, sin pasarse de créditos, cap 50
  bet = clamp(Math.min(50, credits), 1, 50);
  setMessage(`MAX BET ACTIVADO: ${bet}`, null);
  updateUI(); saveState();
});

cashoutBtn.addEventListener("click", ()=>{
  stopAuto();
  cashout();
});

autoBtn.addEventListener("click", ()=>{
  if(autoInterval){
    stopAuto();
    return;
  }
  if(credits < bet){
    setMessage("NO PUEDES AUTO SIN CREDITOS.", "bad");
    return;
  }
  autoBtn.textContent = "STOP";
  autoInterval = setInterval(()=>{
    if(!spinning) spinOnce();
  }, 1200);
});

muteBtn.addEventListener("click", ()=>{
  muted = !muted;
  updateUI(); saveState();
});

resetBtn.addEventListener("click", ()=>{
  stopAuto();
  credits = 100; bet = 10; streak = 0; level = 1; xp = 0; jackpot = 500;
  winLights(false);
  buildTrack(trackEls[0]); buildTrack(trackEls[1]); buildTrack(trackEls[2]);
  setCenter(trackEls[0], "🍒"); setCenter(trackEls[1], "🍋"); setCenter(trackEls[2], "🍇");
  setMessage("REINICIADO. PRESIONA GIRAR.", null);
  spinning = false;
  updateUI(); saveState();
});

saveScoreBtn.addEventListener("click", ()=>{
  const name = (playerNameInput.value || "JUGADOR").trim();
  const score = Math.max(0, Math.floor(credits));
  saveScore(name, score);
  setMessage(`🏆 GUARDADO: ${name.toUpperCase()} = ${score}`, "good");
  sfxWin();
});

document.addEventListener("keydown", (e)=>{
  const k = e.key.toLowerCase();
  if(e.code === "Space"){ e.preventDefault(); spinOnce(); }
  if(k === "a") autoBtn.click();
  if(k === "m") muteBtn.click();
  if(k === "c") cashoutBtn.click();
});

// ---------- init ----------
loadState();
trackEls.forEach(buildTrack);
setCenter(trackEls[0], "🍒");
setCenter(trackEls[1], "🍋");
setCenter(trackEls[2], "🍇");
renderRanking();
updateUI();
setMessage("LISTO. USA ESPACIO PARA GIRAR.", null);
window.addEventListener("beforeunload", saveState);