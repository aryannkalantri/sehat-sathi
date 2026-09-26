/* Sehat Sathi v3 — AI-first triage chat.
   Two AI backends (proxy takes precedence):
   1. Cloudflare Worker proxy (config.js -> SEHAT.proxyUrl). Key never in browser.
   2. Demo direct-key path (config.js -> SEHAT.geminiKey): a Google AI Studio key
      locked to this site's HTTP referrer + the Generative Language API only.
   - Client-side red-flag keyword guard runs on EVERY user message BEFORE any
     network call: instant 108 screen on match, no matter what the model says.
   - The AI is instructed never to diagnose or name any medicine/dose (prompt
     rule, not a hard filter). AI can suggest tap chips for low-literacy users.
   - Offline / AI error / no key configured -> deterministic tap
     questionnaire (flows.js), so the app never dies. */
(function(){
"use strict";
const $ = id => document.getElementById(id);
const screens = ['screen-lang','screen-consent','screen-home','screen-chat','screen-result','screen-redflag'];
let flow = null, history = [];
let mode = 'ai', aiHistory = [], lastFid = 'fever', busy = false;
let voiceOn = true;

const AI_READY = (() => {
  if (!window.SEHAT) return false;
  const proxy = typeof SEHAT.proxyUrl === 'string' && SEHAT.proxyUrl.indexOf('http') === 0;
  const direct = typeof SEHAT.geminiKey === 'string' && SEHAT.geminiKey.length > 20;
  return proxy || direct;
})();
const USE_PROXY = !!(window.SEHAT && typeof SEHAT.proxyUrl === 'string' && SEHAT.proxyUrl.indexOf('http') === 0);

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
/* Client-side system prompt (demo direct-key path only).
   Mirrors proxy/worker.js. The production proxy builds its prompt server-side. */
function clientSystemPrompt(){
  const langIns = LANG === 'hi'
    ? 'simple spoken Hindi in Devanagari script, the way an ASHA health worker speaks to villagers'
    : 'very simple plain English';
  return 'You are "Sehat Sathi", a symptom-triage chat assistant for rural Rajasthan, India. '
    + 'Your ONLY job is to work out how urgently the person should see a doctor. The user is a villager, possibly low-literacy, on a cheap phone.\n'
    + 'LANGUAGE: Reply in ' + langIns + '. Very simple everyday words. Short sentences.\n'
    + 'HARD RULES (never break):\n'
    + '1. You are NOT a doctor. Never diagnose a disease or say what illness the person "has".\n'
    + '2. NEVER recommend, name, suggest, or dose any medicine, tablet, syrup, injection, vaccine, or home remedy — not even paracetamol, ORS, or kadha. No exceptions.\n'
    + '3. Ask exactly ONE short question per reply. Every reply under 40 words.\n'
    + '4. Your FIRST reply must ask about emergency danger signs: trouble breathing, chest pain, fainting, seizures, very heavy bleeding. If the concern is pregnancy, also ask: vaginal bleeding, severe headache, blurred vision, swelling of face or hands, baby moving less.\n'
    + '5. If the user reports ANY danger sign, set "redflag": true, tell them to go to the nearest hospital NOW or call 108, and stop asking questions.\n'
    + '6. When you have enough information, set "done": true and "urgency" to "green" (care at home, watch and wait), "yellow" (see a doctor within 24-48 hours), or "red" (go now / call 108).\n'
    + '7. Never claim to be human, a doctor, government-approved, or "clinically proven".\n'
    + '8. If asked for medicines or a diagnosis, say you cannot answer that and guide them to see a doctor.\n'
    + '9. You MAY include "chips": 2-3 very short suggested replies the user can tap instead of typing (in the user\'s language, max 6 words each), e.g. ["हाँ","नहीं","पता नहीं"]. Omit when not useful.\n'
    + 'OUTPUT: Reply with ONLY a JSON object, nothing else: '
    + '{"reply": "<your message to the user>", "urgency": "none|green|yellow|red", "redflag": true|false, "done": true|false, "chips": ["..."]}. '
    + 'While still asking questions use urgency "none" and done false.';
}
function parseAiJson(txt){
  try{ return JSON.parse(txt); }catch(e){}
  const m = /\{[\s\S]*\}/.exec(txt || '');
  if (m){ try{ return JSON.parse(m[0]); }catch(e){} }
  return null;
}
async function askProxy(signal){
  const res = await fetch(SEHAT.proxyUrl, {
    method: 'POST', signal: signal,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ lang: LANG, messages: aiHistory })
  });
  if (!res.ok) throw new Error('http ' + res.status);
  return res.json();
}
async function askDirect(signal){
  const contents = aiHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(SEHAT.geminiModel || 'gemini-2.5-flash') + ':generateContent?key=' + encodeURIComponent(SEHAT.geminiKey),
    { method: 'POST', signal: signal, headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: clientSystemPrompt() }] },
        contents: contents,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 300 }
      }) }
  );
  if (!res.ok) throw new Error('http ' + res.status);
  const data = await res.json();
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const raw = parts.map(p => p.text || '').join('');
  const d = parseAiJson(raw);
  if (!d || typeof d.reply !== 'string') throw new Error('bad json');
  return d;
}
let lastAiCall = 0, aiTurns = 0;
async function askAi(){
  if (!AI_READY){ startFallbackFlow(lastFid); return; }
  const now = Date.now();
  if (now - lastAiCall < 2500 || aiTurns >= 60){ startFallbackFlow(lastFid); return; }
  lastAiCall = now; aiTurns++;
  busy = true; setChips([]);
  const tip = showTyping();
  try{
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000);
    const d = await (USE_PROXY ? askProxy(ctrl.signal) : askDirect(ctrl.signal));
    clearTimeout(to);
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
