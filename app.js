/* Sehat Sathi v1 — chat engine + UI wiring. Fully client-side: no data leaves the phone. */
(function(){
"use strict";
const $ = id => document.getElementById(id);
const screens = ['screen-lang','screen-consent','screen-home','screen-chat','screen-result','screen-redflag'];
let flow = null, history = [];

function show(id){
  screens.forEach(s => $(s).classList.toggle('active', s === id));
  $('screens').querySelector('#'+id).scrollTop = 0;
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
  $('textInput').placeholder = t('typePlaceholder');
  $('langToggle').textContent = LANG === 'hi' ? 'EN' : 'हिं';
  $('talkDoctorBtn').textContent = t('talkDoctor');
  $('restartBtn').textContent = t('startOver');
  $('resultNote').textContent = t('notDiagnosis');
  $('escTitle').textContent = t('escTitle');
  $('escBody').textContent = t('escBody');
  $('rfCall').textContent = '📞 ' + t('call108');
  $('rfRestart').textContent = t('startOver');
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
    b.onclick = () => startFlow(fid);
    box.appendChild(b);
  });
}
/* --- speech --- */
function speak(text){
  try{
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG === 'hi' ? 'hi-IN' : 'en-IN';
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }catch(e){/* no TTS */}
}
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
/* --- chat --- */
function addMsg(who, key, raw){
  history.push({who, key, raw});
  renderHistory();
  const m = $('messages'); m.scrollTop = m.scrollHeight;
}
function renderHistory(){
  const box = $('messages'); box.innerHTML = '';
  history.forEach(h => {
    const d = document.createElement('div');
    d.className = 'msg ' + h.who;
    const txt = h.key ? t(h.key) : h.raw;
    if (h.list){
      d.innerHTML = '<div></div>';
      d.firstChild.textContent = txt;
      const ul = document.createElement('ul'); ul.className = 'danger-list';
      t(h.list).split('\n').forEach(li => { const el = document.createElement('li'); el.textContent = li.replace(/^•\s*/,''); ul.appendChild(el); });
      d.appendChild(ul);
    } else d.textContent = txt;
    if (h.who === 'bot'){
      const sp = document.createElement('button');
      sp.className = 'speak'; sp.textContent = '🔊'; sp.setAttribute('aria-label','listen');
      sp.onclick = () => speak(h.key ? t(h.key) + (h.list ? '. ' + t(h.list).replace(/\n/g,'. ') : '') : h.raw);
      d.appendChild(sp);
    }
    box.appendChild(d);
  });
}
function setChips(opts){
  const box = $('chips'); box.innerHTML = '';
  (opts || []).forEach(o => {
    const b = document.createElement('button');
    b.className = 'chip-btn'; b.textContent = t(o.t);
    b.onclick = () => choose(o);
    box.appendChild(b);
  });
}
function startFlow(fid){
  flow = FLOWS[fid]; history = [];
  show('screen-chat');
  renderHistory(); setChips([]);
  askNode(flow.start);
}
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
  if (go.startsWith('R:')){
    const [, level, adv] = go.split(':');
    setTimeout(() => showResult(level, adv), 350);
  } else {
    setTimeout(() => askNode(go), 350);
  }
}
$('sendBtn').onclick = sendText;
$('textInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });
function sendText(){
  const v = $('textInput').value.trim();
  if (!v || !$('screen-chat').classList.contains('active')) return;
  addMsg('user', null, v);
  $('textInput').value = '';
  setChips([]);
  const node = flow.nodes[flow.current];
  // free text: re-offer the same options (tap-first design)
  setTimeout(() => { addMsg('bot', node.q, null); if (node.list) history[history.length-1].list = node.list; renderHistory(); setChips(node.opts); }, 400);
}
/* --- results --- */
const ICONS = {
  green: '<svg class="result-icon" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1E7A38"/><path d="M20 33l8 8 16-18" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  yellow: '<svg class="result-icon" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#D9A400"/><path d="M32 18v18" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="46" r="4" fill="#fff"/></svg>',
  red: '<svg class="result-icon" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#B3261E"/><path d="M32 18v18" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="46" r="4" fill="#fff"/></svg>',
};
function showResult(level, advKey){
  $('escalationCard').hidden = true;
  if (level === 'red'){
    $('rfTitle').textContent = t('emergency') + ' — ' + t('res_red_t');
    $('rfAdvice').textContent = t(advKey) + ' ' + t('notDiagnosis');
    show('screen-redflag');
    speak(t('res_red_t') + '. ' + t(advKey));
    return;
  }
  const card = $('resultCard');
  card.className = 'result-card ' + level;
  card.innerHTML = ICONS[level] + '<h2>' + t('res_' + level + '_t') + '</h2>' +
    '<div class="result-advice">' + t(advKey) + '</div>' +
    '<button class="chip-btn" id="resSpeak" style="margin-top:12px">🔊 ' + t('listen').replace('🔊 ','') + '</button>';
  $('resSpeak').onclick = () => speak(t('res_' + level + '_t') + '. ' + t(advKey) + '. ' + t('notDiagnosis'));
  show('screen-result');
}
$('talkDoctorBtn').onclick = () => { $('escalationCard').hidden = false; $('escalationCard').scrollIntoView({behavior:'smooth'}); };
function restart(){ flow = null; history = []; show('screen-home'); renderChrome(); }
$('restartBtn').onclick = restart;
$('rfRestart').onclick = restart;
/* --- onboarding --- */
document.querySelectorAll('[data-setlang]').forEach(b => {
  b.onclick = () => { LANG = b.getAttribute('data-setlang'); renderChrome(); show('screen-consent'); };
});
$('langToggle').onclick = () => { LANG = LANG === 'hi' ? 'en' : 'hi'; renderChrome(); };
$('listenBtn').onclick = () => speak(t('disclaimer'));
$('consentBtn').onclick = () => { show('screen-home'); };
renderChrome();
})();
