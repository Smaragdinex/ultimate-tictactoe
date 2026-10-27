// 電腦 AI:蒙地卡羅樹搜尋(MCTS),在 Web Worker 裡跑,算的時候畫面不會卡
// 每一輪:選擇(UCB1)→ 展開 → 隨機模擬到分出勝負 → 把結果回傳到路上的每個節點;時間到了選「被走最多次」的那一步
// 收到 { cells, macro, next, player, winner, last, moves, timeMs } → 回傳 { move, iterations, winRate }
import { cloneState, legalMoves, play } from './game.js';

const C = 1.41;                                                     // UCB1 的探索係數

function newNode(parent, move, playerJustMoved, state) {
  return { parent, move, pjm: playerJustMoved, children: [], untried: legalMoves(state), wins: 0, visits: 0 };
}

function uctSelect(node) {
  let best = null, bestV = -Infinity; const lnN = Math.log(node.visits);
  for (const ch of node.children) {
    const v = ch.wins / ch.visits + C * Math.sqrt(lnN / ch.visits);
    if (v > bestV) { bestV = v; best = ch; }
  }
  return best;
}

function rollout(s) {
  // 隨機下到分出勝負
  while (!s.winner) {
    const moves = legalMoves(s);
    play(s, moves[(Math.random() * moves.length) | 0]);
  }
  return s.winner;
}

function search(root0, timeMs) {
  const root = newNode(null, -1, 3 - root0.player, root0);
  if (root.untried.length === 1) return { move: root.untried[0], iterations: 0, winRate: .5 };
  const end = performance.now() + timeMs; let it = 0;
  while (performance.now() < end || it < 50) {
    let node = root; const s = cloneState(root0);
    while (node.untried.length === 0 && node.children.length) { node = uctSelect(node); play(s, node.move); }      // 選擇
    if (node.untried.length && !s.winner) {                                                                         // 展開
      const i = (Math.random() * node.untried.length) | 0, m = node.untried[i];
      node.untried[i] = node.untried[node.untried.length - 1]; node.untried.pop();
      const p = s.player; play(s, m);
      const ch = newNode(node, m, p, s); node.children.push(ch); node = ch;
    }
    const w = s.winner ? s.winner : rollout(s);                                                                    // 模擬
    for (let n = node; n; n = n.parent) { n.visits++; if (w === n.pjm) n.wins += 1; else if (w === 3) n.wins += .5; }  // 回傳
    it++;
  }
  let best = root.children[0];
  for (const ch of root.children) if (ch.visits > best.visits) best = ch;
  return { move: best.move, iterations: it, winRate: best.wins / best.visits };
}

self.onmessage = e => {
  const d = e.data;
  const s = { cells: Uint8Array.from(d.cells), macro: Uint8Array.from(d.macro), next: d.next, player: d.player, winner: d.winner, last: d.last, moves: d.moves };
  self.postMessage(search(s, d.timeMs));
};
