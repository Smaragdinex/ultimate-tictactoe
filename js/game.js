// 超級井字棋(Ultimate Tic-Tac-Toe)規則
// 棋盤:81 格,索引 = 小棋盤編號 b(0~8)× 9 + 小棋盤裡的格子 c(0~8),都是由左到右、由上到下
// 玩家:1 = X(先手)、2 = O;小棋盤狀態 macro:0 = 還在下、1 = X 贏、2 = O 贏、3 = 平手(下滿)
// 規則:你下在小棋盤的第 c 格,對手下一手就要去第 c 個小棋盤;那個小棋盤已經分出勝負或下滿,就可以下在任何還能下的小棋盤

export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function newState() {
  return { cells: new Uint8Array(81), macro: new Uint8Array(9), next: -1, player: 1, winner: 0, last: -1, moves: 0 };
}

export function cloneState(s) {
  return { cells: s.cells.slice(), macro: s.macro.slice(), next: s.next, player: s.player, winner: s.winner, last: s.last, moves: s.moves };
}

/** 這一手可以下在哪些小棋盤 */
export function playableBoards(s) {
  if (s.winner) return [];
  if (s.next >= 0 && s.macro[s.next] === 0) return [s.next];
  const out = [];
  for (let b = 0; b < 9; b++) if (s.macro[b] === 0) out.push(b);
  return out;
}

export function legalMoves(s) {
  const out = [];
  for (const b of playableBoards(s)) {
    const base = b * 9;
    for (let c = 0; c < 9; c++) if (s.cells[base + c] === 0) out.push(base + c);
  }
  return out;
}

export function isLegal(s, idx) {
  if (s.winner || idx < 0 || idx > 80 || s.cells[idx] !== 0) return false;
  const b = (idx / 9) | 0;
  if (s.macro[b] !== 0) return false;
  return !(s.next >= 0 && s.macro[s.next] === 0 && b !== s.next);
}

function lineWinner(get) {
  for (const [a, b, c] of LINES) {
    const v = get(a);
    if (v && v !== 3 && v === get(b) && v === get(c)) return v;
  }
  return 0;
}

/** 下一手(直接改 s),回傳 s */
export function play(s, idx) {
  const b = (idx / 9) | 0, c = idx % 9, base = b * 9, p = s.player;
  s.cells[idx] = p;
  const w = lineWinner(i => s.cells[base + i]);
  if (w) s.macro[b] = w;
  else {
    let full = true;
    for (let i = 0; i < 9; i++) if (s.cells[base + i] === 0) { full = false; break; }
    if (full) s.macro[b] = 3;
  }
  if (s.macro[b]) {
    const W = lineWinner(i => s.macro[i]);
    if (W) s.winner = W;
    else {
      let done = true;
      for (let i = 0; i < 9; i++) if (s.macro[i] === 0) { done = false; break; }
      if (done) s.winner = 3;                                   // 大棋盤沒有連線、小棋盤都結束了:和局
    }
  }
  s.next = s.macro[c] === 0 ? c : -1;
  s.player = 3 - p;
  s.last = idx;
  s.moves++;
  return s;
}

/** 贏的那條大連線(畫線用),沒有就回傳 null */
export function winningLine(s) {
  if (s.winner !== 1 && s.winner !== 2) return null;
  for (const L of LINES) if (L.every(i => s.macro[i] === s.winner)) return L;
  return null;
}
