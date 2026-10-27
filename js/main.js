// 畫面與流程:首頁 → 跟電腦玩 / 兩人同一支手機 / 線上對戰(建立房間、加入房間)
import { newState, play, isLegal, playableBoards, winningLine } from './game.js';
import { Net } from './net.js';

const $ = id => document.getElementById(id);
const AI_TIME = { easy: 150, normal: 800, hard: 2000 };              // 電腦每步想幾毫秒
const AI_BLUNDER = { easy: .35, normal: 0, hard: 0 };                // 簡單模式有時候亂下

let S = newState(), history = [];
let mode = null;                                                     // 'ai' | 'local' | 'online'
let me = 1;                                                          // 我是哪一方(ai / online)
let diff = 'normal', aiThinking = false, aiToken = 0;
let net = null, round = 1, hostIs = 1;
const worker = new Worker('js/mcts-worker.js', { type: 'module' });

// ---------- 畫面切換 ----------
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
function toast(msg, ms = 2200) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }
function seg(id, cb) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); cb(b.dataset.v);
  });
}
let firstSide = 1;
seg('diff', v => diff = v); seg('side', v => firstSide = +v);

// ---------- 棋盤 ----------
const boardEl = $('board'), subs = [], cells = [];
for (let b = 0; b < 9; b++) {
  const sub = document.createElement('div'); sub.className = 'sub';
  for (let c = 0; c < 9; c++) {
    const btn = document.createElement('button'); btn.className = 'cell'; btn.dataset.idx = b * 9 + c;
    btn.setAttribute('aria-label', `第 ${b + 1} 個小棋盤 第 ${c + 1} 格`); sub.appendChild(btn); cells.push(btn);
  }
  const mark = document.createElement('div'); mark.className = 'mark'; sub.appendChild(mark);
  boardEl.appendChild(sub); subs.push(sub);
}
boardEl.addEventListener('click', e => { const c = e.target.closest('.cell'); if (c) onCell(+c.dataset.idx); });

function myTurn() { return mode === 'local' || S.player === me; }
function render() {
  const play_ = new Set(playableBoards(S)), line = winningLine(S), canAct = !S.winner && myTurn() && !aiThinking;
  for (let i = 0; i < 81; i++) {
    const v = S.cells[i], el = cells[i];
    el.classList.toggle('x', v === 1); el.classList.toggle('o', v === 2); el.classList.toggle('last', i === S.last);
    el.disabled = !canAct || v !== 0 || !play_.has((i / 9) | 0);
  }
  for (let b = 0; b < 9; b++) {
    const m = S.macro[b], el = subs[b];
    el.classList.toggle('active', play_.has(b)); el.classList.toggle('won-x', m === 1); el.classList.toggle('won-o', m === 2);
    el.classList.toggle('draw', m === 3); el.classList.toggle('done', m !== 0); el.classList.toggle('winline', !!line && line.includes(b));
  }
  boardEl.classList.toggle('waiting', !canAct);
  $('pX').classList.toggle('turn', !S.winner && S.player === 1); $('pO').classList.toggle('turn', !S.winner && S.player === 2);
  $('status').textContent = statusText();
  $('btnUndo').style.display = mode === 'online' ? 'none' : '';
  $('btnUndo').disabled = !history.length || aiThinking;
}
const NAME = p => p === 1 ? 'X' : 'O';
function statusText() {
  if (S.winner === 3) return '和局!';
  if (S.winner) {
    if (mode === 'local') return `${NAME(S.winner)} 贏了!`;
    return S.winner === me ? `你贏了!🎉` : (mode === 'ai' ? '電腦贏了' : '對手贏了');
  }
  if (mode === 'online' && !net?.connected) return '對手斷線了';
  const where = S.next >= 0 && S.macro[S.next] === 0 ? '下在發亮的小棋盤' : '可以下在任何發亮的小棋盤';
  if (mode === 'local') return `輪到 ${NAME(S.player)} · ${where}`;
  if (S.player === me) return `輪到你(${NAME(me)})· ${where}`;
  return mode === 'ai' ? '電腦思考中…' : '等對手下…';
}

// ---------- 下棋 ----------
function apply(idx, push = true) {
  play(S, idx); if (push) history.push(idx);
  if (navigator.vibrate) navigator.vibrate(12);
  render();
  if (S.winner) setTimeout(() => toast(statusText(), 3000), 250);
}
function onCell(idx) {
  if (!myTurn() || aiThinking || !isLegal(S, idx)) return;
  if (mode === 'online') { if (!net?.connected) return toast('對手不在線上'); net.send({ t: 'move', idx, n: S.moves }); }
  apply(idx);
  if (mode === 'ai') maybeAI();
}
function maybeAI() {
  if (mode !== 'ai' || S.winner || S.player === me) return;
  aiThinking = true; render(); const token = ++aiToken;
  const moves = []; for (let i = 0; i < 81; i++) if (isLegal(S, i)) moves.push(i);
  if (Math.random() < AI_BLUNDER[diff]) {
    setTimeout(() => { if (token !== aiToken) return; aiThinking = false; apply(moves[(Math.random() * moves.length) | 0]); $('aiInfo').textContent = ''; }, 400);
    return;
  }
  const t0 = performance.now();
  worker.onmessage = e => {
    if (token !== aiToken) return;
    const wait = Math.max(0, 350 - (performance.now() - t0));        // 太快也停一下,看得到電腦下哪
    setTimeout(() => {
      if (token !== aiToken) return;
      aiThinking = false; apply(e.data.move);
      $('aiInfo').textContent = `電腦模擬了 ${e.data.iterations.toLocaleString()} 盤,估計勝率 ${Math.round(e.data.winRate * 100)}%`;
    }, wait);
  };
  worker.postMessage({ cells: Array.from(S.cells), macro: Array.from(S.macro), next: S.next, player: S.player, winner: S.winner, last: S.last, moves: S.moves, timeMs: AI_TIME[diff] });
}
function reset() { aiToken++; aiThinking = false; S = newState(); history = []; $('aiInfo').textContent = ''; render(); }

// ---------- 模式 ----------
function startAI() {
  mode = 'ai'; me = firstSide; reset();
  $('nameX').textContent = me === 1 ? '你' : '電腦'; $('nameO').textContent = me === 2 ? '你' : '電腦';
  show('game'); maybeAI();
}
function startLocal() { mode = 'local'; reset(); $('nameX').textContent = '玩家 1'; $('nameO').textContent = '玩家 2'; show('game'); }
$('btnAI').onclick = startAI; $('btnLocal').onclick = startLocal;
$('btnUndo').onclick = () => {
  if (!history.length || aiThinking) return;
  let n = mode === 'ai' ? (S.player === me ? 2 : 1) : 1;                // 跟電腦玩:退回到上一次輪到你
  n = Math.min(n, history.length); const keep = history.slice(0, history.length - n);
  reset(); keep.forEach(i => apply(i)); if (mode === 'ai') maybeAI();
};
$('btnRestart').onclick = () => {
  if (mode === 'online') { if (net?.role === 'host') hostNewRound(); else net?.send({ t: 'rematch' }); toast('已邀請對手再來一局'); return; }
  if (mode === 'ai') { me = 3 - me; $('nameX').textContent = me === 1 ? '你' : '電腦'; $('nameO').textContent = me === 2 ? '你' : '電腦'; }   // 換邊先下
  reset(); maybeAI();
};
$('btnBack').onclick = () => { leaveOnline(); aiToken++; aiThinking = false; mode = null; show('home'); };
const rules = $('rules'); $('btnRules').onclick = () => rules.showModal(); $('btnHelp').onclick = () => rules.showModal();

// ---------- 線上對戰 ----------
function leaveOnline() { if (net) { net.close(); net = null; } if (location.search) window.history.replaceState(null, '', location.pathname); }
function inviteURL(code) { return `${location.origin}${location.pathname}?room=${code}`; }
function setOnlineNames() {
  $('nameX').textContent = me === 1 ? '你' : '對手'; $('nameO').textContent = me === 2 ? '你' : '對手';
}
function hostNewRound() {
  round++; hostIs = round % 2 === 1 ? 1 : 2;                         // 每局換邊先下
  net.send({ t: 'start', hostIs, round }); me = hostIs; mode = 'online'; reset(); setOnlineNames();
}
function onlineHandlers() {
  return {
    onOpen: () => {
      if (net.role === 'host') { round = 0; hostNewRound(); show('game'); toast('對手加入了!'); }
      else { $('lobbyStatus').textContent = '已連上,等房主開始…'; }
    },
    onData: d => {
      if (d.t === 'full') { toast('這個房間已經滿了'); leaveOnline(); show('home'); return; }
      if (d.t === 'start') { round = d.round; hostIs = d.hostIs; me = 3 - d.hostIs; mode = 'online'; reset(); setOnlineNames(); show('game'); if (round > 1) toast('新的一局開始'); return; }
      if (d.t === 'rematch' && net.role === 'host') { hostNewRound(); toast('對手要再來一局'); return; }
      if (d.t === 'move') {
        if (d.n !== S.moves) return;                                  // 重複或順序不對的訊息
        if (S.player === me || !isLegal(S, d.idx)) return;
        apply(d.idx);
      }
    },
    onClose: () => { toast('對手離開了', 3000); render(); },
    onError: e => { console.warn(e); },
  };
}
$('btnHost').onclick = async () => {
  leaveOnline(); show('lobby'); $('roomCode').textContent = '····'; $('qr').innerHTML = ''; $('lobbyStatus').textContent = '正在建立房間…';
  net = new Net(onlineHandlers());
  try {
    const code = await net.host(); $('roomCode').textContent = code; $('lobbyStatus').textContent = '等對手加入…';
    const qr = qrcode(0, 'M'); qr.addData(inviteURL(code)); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText(inviteURL(code)); toast('已複製邀請連結'); } catch (e) { toast(inviteURL(code), 5000); } };
  } catch (e) { $('lobbyStatus').textContent = '建立房間失敗,請檢查網路後再試一次'; }
};
async function joinRoom(code) {
  code = (code || '').trim().toUpperCase(); if (code.length !== 4) return toast('請輸入 4 碼房間號');
  leaveOnline(); show('lobby'); $('roomCode').textContent = code; $('qr').innerHTML = ''; $('lobbyStatus').textContent = '連線中…';
  net = new Net(onlineHandlers());
  try { await net.join(code); }
  catch (e) { toast(e.message === 'no-room' ? '找不到這個房間' : '連不上,請再試一次', 3000); leaveOnline(); show('home'); }
}
$('btnJoin').onclick = () => joinRoom($('joinCode').value);
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(e.target.value); });
$('btnLobbyBack').onclick = () => { leaveOnline(); show('home'); };

// 從邀請連結進來(?room=XXXX)就直接加入
const room = new URLSearchParams(location.search).get('room');
if (room) joinRoom(room);
render();
window.__uttt = { get S() { return S; }, play: i => onCell(i) };      // 測試用
