/* Smoke test: two clients join a private room, play moves, an illegal move is rejected, then resign. */
'use strict';
process.env.PORT = process.env.PORT || 3999;
require('./server.js');
const WebSocket = require('ws');
const assert = require('assert');
const url = 'ws://127.0.0.1:' + process.env.PORT;

function client(name) {
  const ws = new WebSocket(url), q = [], waiters = [];
  ws.on('message', d => { const m = JSON.parse(d); const w = waiters.findIndex(x => x.t === m.t); if (w >= 0) waiters.splice(w, 1)[0].res(m); else q.push(m); });
  return {
    ws,
    open: () => new Promise(r => ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', name })); r(); })),
    send: o => ws.send(JSON.stringify(o)),
    wait: t => new Promise((res, rej) => {
      const i = q.findIndex(m => m.t === t); if (i >= 0) return res(q.splice(i, 1)[0]);
      waiters.push({ t, res }); setTimeout(() => rej(new Error('timeout waiting ' + t)), 3000);
    })
  };
}

// rules engine: perft from the initial position must match known values
{
  const XQ = require('../web/js/xiangqi.js');
  const perft = (b, side, d) => { if (!d) return 1; let n = 0; for (const m of XQ.legalMoves(b, side)) { const f = (m / 100) | 0, t = m % 100, c = b[t], p = b[f]; b[t] = p; b[f] = null; n += perft(b, XQ.opp(side), d - 1); b[f] = p; b[t] = c; } return n; };
  const b = XQ.initialBoard();
  assert.deepStrictEqual([1, 2, 3].map(d => perft(b, 'r', d)), [44, 1920, 79666]);
  const AI = require('../web/js/ai.js');
  const g = new XQ.Game(); const mv = AI.think(g.board, 'r', 'easy');
  assert(g.move(mv.from, mv.to), 'AI move must be legal');
  console.log('rules/AI tests passed');
}

(async () => {
  const a = client('An'), b = client('Bình');
  await a.open(); await b.open();
  a.send({ t: 'create' });
  const w = await a.wait('waiting');
  assert(/^\d{4}$/.test(w.code));
  b.send({ t: 'join', code: w.code });
  const sa = await a.wait('start'), sb = await b.wait('start');
  assert.notStrictEqual(sa.color, sb.color);
  assert.strictEqual(sa.opp, 'Bình');
  const red = sa.color === 'r' ? a : b, black = red === a ? b : a;
  // red: central cannon 64 -> 67 (row7 col1 -> row7 col4)
  red.send({ t: 'move', from: 64, to: 67 });
  const mv = await black.wait('move');
  assert.deepStrictEqual([mv.from, mv.to], [64, 67]);
  // illegal: red moves again
  red.send({ t: 'move', from: 70, to: 69 });
  const err = await red.wait('error'); assert(err.msg);
  await red.wait('sync');
  // black resigns
  black.send({ t: 'resign' });
  const o1 = await red.wait('over'); assert.strictEqual(o1.winner, 'r'); assert.strictEqual(o1.reason, 'resign');
  // rematch swaps colours
  red.send({ t: 'rematch' }); await black.wait('rematchAsk'); black.send({ t: 'rematch' });
  const r1 = await red.wait('start'); assert.strictEqual(r1.color, 'b');
  // quick match
  const c = client('C'), d = client('D'); await c.open(); await d.open();
  c.send({ t: 'quick' }); await c.wait('waiting'); d.send({ t: 'quick' });
  await c.wait('start'); await d.wait('start');
  // leaving gives the other player the win
  c.ws.close();
  const o2 = await d.wait('over'); assert.strictEqual(o2.reason, 'left');
  console.log('server tests passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
