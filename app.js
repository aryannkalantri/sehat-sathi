/* Sehat Sathi v3 — AI-first triage chat.
   - Free-text conversation goes through our own Cloudflare Worker proxy
     (config.js -> SEHAT.proxyUrl). The Gemini API key NEVER touches the browser.
   - Client-side red-flag keyword guard runs on EVERY user message BEFORE any
     network call: instant 108 screen on match, no matter what the model says.
   - The worker's server-side system prompt hard-forbids diagnosis and any
     medicine names/doses. AI can also suggest tap chips for low-literacy users.
   - Offline / proxy error / proxy not configured yet -> deterministic tap
     questionnaire (flows.js), so the app never dies. */
(function(){
"use strict";
const $ = id => document.getElementById(id);
const screens = ['screen-lang','screen-consent','screen-home','screen-chat','screen-result','screen-redflag'];
let flow = null, history = [];
let mode = 'ai', aiHistory = [], lastFid = 'fever', busy = false;
let voiceOn = true;

const AI_READY = !!(window.SEHAT && SEHAT.proxyUrl && SEHAT.proxyUrl.indexOf('http') === 0);

function show(id){
  screens.forEach(s => $(s).classList.toggle('active', s === id));
  document.getElementById(id).scrollTop = 0;
}
function renderChrome(){
  document.documentElement.lang = LANG;
  $('demoBanner').textContent = t('demoBanner');
  $('langTagline').textContent = t('langTagline');
  $('langHint').textContent = t('langHint');
  $('consentTitle').textContent = t('consentTitle');
  $('disclaimerText').textContent = t('disclaimer');
  $('privacyNote').textContent = t('privacyNote');
  $('consentBtn').textContent = t('consentBtn');
  $('listenBtn').textContent = t('listen');
  $('homeTitle').textContent = t('homeTitle');
  $('homeSub').textContent = t('homeSub');
  $('freeChatBtn').innerHTML = '<span class="flow-icon">💬</span><span>' + t('freeChat') + '<span class="sub">' + t('freeChatSub') + '</span></span>';
  $('freeChatBtn').hidden = !AI_READY;
  $('topicLabel').textContent = t('orTapTopic');
  $('topicLabel').style.display = AI_READY ? '' : 'none';
  $('textInput').placeholder = t('typePlaceholder');
  $('langToggle').textContent = LANG === 'hi' ? 'EN' : 'हिं';
  $('talkDoctorBtn').textContent = t('talkDoctor');
  $('restartBtn').textContent = t('startOver');
  $('resultNote').textContent = t('notDiagnosis');
  $('escTitle').textContent = t('escTitle');
  $('escBody').textContent = t('escBody');
  $('rfCall').textContent = '📞 ' + t('call108');
  $('rfRestart').textContent = t('startOver');
  $('voiceToggle').textContent = voiceOn ? '🔊' : '🔇';
  renderFlowCards();
  renderHistory();
}
function renderFlowCards(){
  const box = $('flowCards'); box.innerHTML = '';
  Object.keys(FLOWS).forEach(fid => {
    const f = FLOWS[fid];
    const b = document.createElement('button');
    b.className = 'big-btn flow-card';
    b.innerHTML = '<span class="flow-icon">'+f.icon+'</span><span>'+t(f.labelKey)+'<span class="sub">'+t(f.subKey)+'</span></span>';
    b.onclick = () => AI_READY ? startAiChat(fid) : startFallbackFlow(fid);
    box.appendChild(b);
  });
}

/* ---------- safety net 1: keyword guard (runs before any network call) ---------- */
const REDFLAG_RE = /सांस लेने|साँस|छाती में दर्द|बेहोश|दौरा पड़|ब्लीडिंग|बहुत खून|खून बह|आत्महत्या|ज़हर|trouble breathing|can\'t breathe|chest pain|unconscious|faint|seizure|heavy bleeding|bleeding a lot|suicide|poison|overdose/i;
const keywordHit = txt => REDFLAG_RE.test(txt || '');

/* ---------- speech ---------- */
function speak(text, force){
  if (!voiceOn && !force) return;
  try{
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG === 'hi' ? 'hi-IN' : 'en-IN';
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }catch(e){}
}
$('voiceToggle').onclick = () => {
  voiceOn = !voiceOn;
  $('voiceToggle').textContent = voiceOn ? '🔊' : '🔇';
  if (!voiceOn){ try{ speechSynthesis.cancel(); }catch(e){} }
};
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) $('micBtn').hidden = false;
let rec = null;
$('micBtn').onclick = () => {
  if (!SR) return;
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = LANG === 'hi' ? 'hi-IN' : 'en-IN'; rec.interimResults = false;
  $('micBtn').classList.add('listening');
  rec.onresult = e => { $('textInput').value = e.results[0][0].transcript; };
  rec.onend = () => { rec = null; $('micBtn').classList.remove('listening'); };
  rec.onerror = () => { rec = null; $('micBtn').classList.remove('listening'); };
  try{ rec.start(); }catch(e){ rec = null; $('micBtn').classList.remove('listening'); }
};

/* ---------- chat rendering ---------- */
function addMsg(who, key, raw){
  history.push({who, key, raw});
  renderHistory();
  const m = $('messages'); m.scrollTop = m.scrollHeight;
}
function esc(s){ return String(s).replace(/</g,'&lt;'); }
function renderHistory(){
  const box = $('messages'); box.innerHTML = '';
  history.forEach(h => {
    const d = document.createElement('div');
    d.className = 'msg ' + h.who;
    const txt = h.key ? t(h.key) : h.raw;
    if (h.list){
      const head = document.createElement('div'); head.textContent = txt; d.appendChild(head);
      const ul = document.createElement('ul'); ul.className = 'danger-list';
      t(h.list).split('\n').forEach(li => { const el = document.createElement('li'); el.textContent = li.replace(/^•\s*/,''); ul.appendChild(el); });
      d.appendChild(ul);
    } else d.textContent = txt;
    if (h.who === 'bot'){
      const sp = document.createElement('button');
      sp.className = 'speak'; sp.textContent = '🔊'; sp.setAttribute('aria-label','listen');
      sp.onclick = () => speak(h.key ? t(h.key) + (h.list ? '. ' + t(h.list).replace(/\n/g,'. ') : '') : h.raw, true);
      d.appendChild(sp);
    }
    box.appendChild(d);
  });
}
function setChips(opts){
  const box = $('chips'); box.innerHTML = '';
  (opts || []).forEach(o => {
    const b = document.createElement('button');
    b.className = 'chip-btn';
    if (o.ai){ b.textContent = o.ai; b.onclick = () => sendChipText(o.ai); }
    else { b.textContent = t(o.t); b.onclick = () => choose(o); }
    box.appendChild(b);
  });
}
function showTyping(){
  const box = $('messages');
  const d = document.createElement('div');
  d.className = 'msg bot typing'; d.innerHTML = '<span></span><span></span><span></span>';
  box.appendChild(d); box.scrollTop = box.scrollHeight;
  return d;
}
function hideTyping(el){ if (el && el.parentNode) el.parentNode.removeChild(el); }

/* ---------- AI mode (via our proxy; key never in the browser) ---------- */
function trimHistory(){
  while (aiHistory.length > 18) aiHistory.splice(0, 2); // sliding window
}
function startFreeChat(){
  if (!AI_READY) return;
  lastFid = 'fever'; mode = 'ai'; flow = null; history = [];
  aiHistory = [{role:'user', text:'I need help with a health problem.'}];
  show('screen-chat'); renderHistory(); setChips([]);
  askAi();
}
function startAiChat(fid){
  lastFid = fid; mode = 'ai'; flow = null; history = [];
  const label = t(FLOWS[fid].labelKey);
  aiHistory = [{role:'user', text:'My health concern: ' + label}];
  show('screen-chat'); renderHistory(); setChips([]);
  addMsg('user', null, label);
  askAi();
}
async function askAi(){
  if (!AI_READY){ startFallbackFlow(lastFid); return; }
  busy = true; setChips([]);
  const tip = showTyping();
  try{
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 45000);
    const res = await fetch(SEHAT.proxyUrl, {
      method: 'POST', signal: ctrl.signal,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ lang: LANG, messages: aiHistory })
    });
    clearTimeout(to);
    if (!res.ok) throw new Error('http ' + res.status);
    const d = await res.json();
    hideTyping(tip); busy = false;
    if (!d || typeof d.reply !== 'string') throw new Error('bad reply');
    handleAi(d);
  }catch(e){ hideTyping(tip); busy = false; startFallbackFlow(lastFid); }
}
function handleAi(d){
  aiHistory.push({role:'model', text:d.reply}); trimHistory();
  addMsg('bot', null, d.reply);
  speak(d.reply);
  const finished = d.redflag === true || d.urgency === 'red' || d.done === true;
  if (!finished && Array.isArray(d.chips) && d.chips.length){
    setChips(d.chips.filter(c => typeof c === 'string' && c.trim()).slice(0,3).map(c => ({ai:c.trim()})));
  }
  if (d.redflag === true || d.urgency === 'red'){
    setTimeout(() => showResult('red', null, d.reply), 900); return;
  }
  if (d.done === true && (d.urgency === 'green' || d.urgency === 'yellow')){
    setTimeout(() => showResult(d.urgency, null, d.reply), 900);
  }
}

/* ---------- fallback: deterministic questionnaire ---------- */
function startFallbackFlow(fid){
  mode = 'fallback'; flow = FLOWS[fid] || FLOWS.fever; lastFid = fid;
  history = []; show('screen-chat'); renderHistory(); setChips([]);
  addMsg('bot', null, LANG === 'hi'
    ? 'AI से कनेक्शन नहीं हो पाया — बटन वाले सवालों से आगे बढ़ते हैं।'
    : 'Could not reach the AI — continuing with tap answers.');
  askNode(flow.start);
}
function startFallback(){ startFallbackFlow(lastFid); }
function askNode(nid){
  const node = flow.nodes[nid];
  flow.current = nid;
  addMsg('bot', node.q, null);
  if (node.list) history[history.length-1].list = node.list;
  renderHistory();
  const m = $('messages'); m.scrollTop = m.scrollHeight;
  setChips(node.opts);
}
function choose(opt){
  addMsg('user', opt.t, null);
  setChips([]);
  const go = opt.go;
  if (go.indexOf('R:') === 0){
    const parts = go.split(':');
    setTimeout(() => showResult(parts[1], parts[2], null), 350);
  } else {
    setTimeout(() => askNode(go), 350);
  }
}

/* ---------- input ---------- */
$('sendBtn').onclick = sendText;
$('textInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });
function sendText(){
  const inp = $('textInput');
  const v = inp.value.trim();
  if (!v || busy || !$('screen-chat').classList.contains('active')) return;
  inp.value = '';
  sendChipText(v);
}
function sendChipText(v){
  if (!v || busy || !$('screen-chat').classList.contains('active')) return;
  if (keywordHit(v)){
    addMsg('user', null, v);
    setChips([]);
    setTimeout(() => showResult('red', null, null), 400);
    return;
  }
  addMsg('user', null, v);
  setChips([]);
  if (mode === 'ai'){
    aiHistory.push({role:'user', text:v}); trimHistory();
    askAi();
  } else {
    const node = flow.nodes[flow.current];
    setTimeout(() => {
      addMsg('bot', node.q, null);
      if (node.list) history[history.length-1].list = node.list;
      renderHistory(); setChips(node.opts);
    }, 400);
  }
}

/* ---------- results ---------- */
const ICONS = {
  green: '<svg class="result-icon" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1E7A38"/><path d="M20 33l8 8 16-18" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  yellow: '<svg class="result-icon" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#D9A400"/><path d="M32 18v18" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="46" r="4" fill="#fff"/></svg>',
  red: '<svg class="result-icon" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#B3261E"/><path d="M32 18v18" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="46" r="4" fill="#fff"/></svg>'
};
function showResult(level, advKey, aiText){
  $('escalationCard').hidden = true;
  const advice = aiText || (advKey ? t(advKey) : '');
  if (level === 'red'){
    $('rfTitle').textContent = t('emergency') + ' — ' + t('res_red_t');
    $('rfAdvice').textContent = (advice || t('adv_fever_red')) + ' ' + t('notDiagnosis');
    show('screen-redflag');
    speak(t('res_red_t') + '. ' + advice, true);
    return;
  }
  const card = $('resultCard');
  card.className = 'result-card ' + level;
  card.innerHTML = ICONS[level] + '<h2>' + esc(t('res_' + level + '_t')) + '</h2>'
    + '<div class="result-advice">' + esc(advice) + '</div>'
    + '<button class="chip-btn" id="resSpeak" style="margin-top:12px">🔊 ' + esc(t('listen').replace('🔊 ','')) + '</button>';
  $('resSpeak').onclick = () => speak(t('res_' + level + '_t') + '. ' + advice + '. ' + t('notDiagnosis'), true);
  show('screen-result');
  speak(t('res_' + level + '_t') + '. ' + advice);
}
$('talkDoctorBtn').onclick = () => { $('escalationCard').hidden = false; $('escalationCard').scrollIntoView({behavior:'smooth'}); };
function restart(){ flow = null; history = []; aiHistory = []; mode = 'ai'; show('screen-home'); renderChrome(); }
$('restartBtn').onclick = restart;
$('rfRestart').onclick = restart;

/* ---------- onboarding ---------- */
$('freeChatBtn').onclick = startFreeChat;
document.querySelectorAll('[data-setlang]').forEach(b => {
  b.onclick = () => { LANG = b.getAttribute('data-setlang'); renderChrome(); show('screen-consent'); };
});
$('langToggle').onclick = () => { LANG = LANG === 'hi' ? 'en' : 'hi'; renderChrome(); };
$('listenBtn').onclick = () => speak(t('disclaimer'), true);
$('consentBtn').onclick = () => { show('screen-home'); };
renderChrome();
})();
