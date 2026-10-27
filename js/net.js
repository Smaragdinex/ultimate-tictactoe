// 線上對戰:PeerJS(WebRTC 點對點),免費的公開配對伺服器,不用自己架伺服器
// 開房的人(host)用 peer id = uttt-<房間號>;加入的人(guest)連過去。之後雙方直接傳訊息:
//   { t: 'hello', name }、{ t: 'start', hostIs: 1|2, round }、{ t: 'move', idx, n }(n = 這是第幾手,用來擋重複)、{ t: 'rematch' }、{ t: 'sync', moves: [...] }
const PREFIX = 'uttt-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';                   // 房間號不用 0 O 1 I,避免看錯

export function randomCode(n = 4) {
  let s = ''; for (let i = 0; i < n; i++) s += ALPHA[(Math.random() * ALPHA.length) | 0]; return s;
}

export class Net {
  constructor(handlers) { this.h = handlers; this.peer = null; this.conn = null; this.role = null; }

  _wire(conn) {
    this.conn = conn;
    conn.on('open', () => this.h.onOpen?.());
    conn.on('data', d => this.h.onData?.(d));
    conn.on('close', () => { this.h.onClose?.(); });
    conn.on('error', e => this.h.onError?.(e));
  }

  /** 開房間:回傳 Promise<房間號> */
  host() {
    this.role = 'host';
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt) => {
        const code = randomCode();
        const peer = new Peer(PREFIX + code, { debug: 1 });
        peer.on('open', () => { this.peer = peer; resolve(code); });
        peer.on('connection', conn => {
          if (this.conn && this.conn.open) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }   // 已經有對手了
          this._wire(conn);
        });
        peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
        peer.on('error', err => {
          if (err.type === 'unavailable-id' && attempt < 5) { peer.destroy(); tryOpen(attempt + 1); }                // 房間號撞到了,換一個
          else if (!this.peer) reject(err); else this.h.onError?.(err);
        });
      };
      tryOpen(0);
    });
  }

  /** 加入房間 */
  join(code) {
    this.role = 'guest';
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 1 });
      peer.on('open', () => {
        this.peer = peer;
        const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
        this._wire(conn);
        const t = setTimeout(() => reject(new Error('timeout')), 12000);
        conn.on('open', () => { clearTimeout(t); resolve(); });
      });
      peer.on('error', err => { if (err.type === 'peer-unavailable') reject(new Error('no-room')); else reject(err); });
    });
  }

  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
  get connected() { return !!(this.conn && this.conn.open); }
  close() { try { this.conn?.close(); } catch (e) { } try { this.peer?.destroy(); } catch (e) { } this.conn = null; this.peer = null; }
}
