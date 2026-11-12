/*
 * Cờ Tướng 3D — online game server.
 * - WebSocket matchmaking (quick match + private 4-digit rooms)
 * - Server-side move validation using the shared rules engine
 * - Also serves the web client over HTTP (play from a browser at http://host:PORT)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const XQ = require('../web/js/xiangqi.js');

const PORT = process.env.PORT || 3000;
const WEB_ROOT = path.join(__dirname, '..', 'web');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

/* ---------------- static files ---------------- */
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, players: clients.size, rooms: rooms.size })); return; }
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(WEB_ROOT, url));
  if (!file.startsWith(WEB_ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ---------------- game state ---------------- */
const wss = new WebSocketServer({ server });
const clients = new Set();
const rooms = new Map();      // code -> room
let quickQueue = null;        // a client waiting for quick match

function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function newCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(code));
  return code;
}

function makeRoom(host, isPrivate) {
  const code = newCode();
  const room = { code, players: [host], private: isPrivate, game: null, colors: null, rematch: new Set(), round: 0 };
  rooms.set(code, room);
  host.room = room;
  return room;
}

function startRoom(room) {
  const [a, b] = room.players;
  // alternate colours every round; first round random
  const aRed = room.round === 0 ? Math.random() < 0.5 : room.colors.get(a) === 'b';
  room.colors = new Map([[a, aRed ? 'r' : 'b'], [b, aRed ? 'b' : 'r']]);
  room.game = new XQ.Game();
  room.rematch.clear();
  room.round++;
  room.over = false;
  for (const p of room.players) {
    const opp = room.players.find(x => x !== p);
    send(p, { t: 'start', color: room.colors.get(p), opp: opp.name, code: room.private ? room.code : null });
  }
  log(`room ${room.code} started round ${room.round}: ${a.name} vs ${b.name}`);
}

function finish(room, winner, reason) {
  if (!room || room.over) return;
  room.over = true;
  for (const p of room.players) send(p, { t: 'over', winner, reason });
}

function leaveRoom(ws, reason) {
  const room = ws.room;
  if (quickQueue === ws) quickQueue = null;
  if (!room) return;
  ws.room = null;
  room.players = room.players.filter(p => p !== ws);
  const other = room.players[0];
  if (other) {
    if (room.game && !room.over) {
      room.over = true;
      send(other, { t: 'over', winner: room.colors.get(other), reason: reason || 'left' });
    } else {
      send(other, { t: 'error', msg: 'Đối thủ đã rời phòng' });
    }
    other.room = null;
  }
  rooms.delete(room.code);
}

function log(...a) { console.log(new Date().toISOString(), ...a); }

wss.on('connection', (ws, req) => {
  ws.name = 'Kỳ thủ';
  ws.alive = true;
  ws.room = null;
  clients.add(ws);
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const room = ws.room;

    switch (m.t) {
      case 'hello':
        ws.name = String(m.name || 'Kỳ thủ').slice(0, 16);
        break;

      case 'quick':
        if (ws.room) leaveRoom(ws);
        if (m.name) ws.name = String(m.name).slice(0, 16);
        if (quickQueue && quickQueue !== ws && quickQueue.readyState === 1) {
          const host = quickQueue; quickQueue = null;
          const r = makeRoom(host, false);
          r.players.push(ws); ws.room = r;
          startRoom(r);
        } else {
          quickQueue = ws;
          send(ws, { t: 'waiting' });
        }
        break;

      case 'create': {
        if (ws.room) leaveRoom(ws);
        if (quickQueue === ws) quickQueue = null;
        const r = makeRoom(ws, true);
        send(ws, { t: 'waiting', code: r.code });
        break;
      }

      case 'join': {
        const r = rooms.get(String(m.code || ''));
        if (!r || !r.private) { send(ws, { t: 'error', msg: 'Không tìm thấy phòng ' + (m.code || ''), lobby: true }); break; }
        if (r.players.length >= 2) { send(ws, { t: 'error', msg: 'Phòng đã đủ người', lobby: true }); break; }
        if (r.players.includes(ws)) break;
        if (ws.room) leaveRoom(ws);
        if (quickQueue === ws) quickQueue = null;
        r.players.push(ws); ws.room = r;
        startRoom(r);
        break;
      }

      case 'cancel':
        if (quickQueue === ws) quickQueue = null;
        if (room && !room.game) leaveRoom(ws);
        break;

      case 'move': {
        if (!room || !room.game || room.over) break;
        const g = room.game, color = room.colors.get(ws);
        const from = m.from | 0, to = m.to | 0;
        if (g.turn !== color || !g.move(from, to)) {
          send(ws, { t: 'error', msg: 'Nước đi không hợp lệ' });
          send(ws, { t: 'sync', moves: g.history.map(h => [h.from, h.to]) });
          break;
        }
        const opp = room.players.find(p => p !== ws);
        send(opp, { t: 'move', from, to });
        if (g.result) finish(room, g.result.winner, g.result.reason);
        break;
      }

      case 'sync':
        if (room && room.game) send(ws, { t: 'sync', moves: room.game.history.map(h => [h.from, h.to]) });
        break;

      case 'resign':
        if (room && room.game && !room.over) finish(room, XQ.opp(room.colors.get(ws)), 'resign');
        break;

      case 'rematch':
        if (!room || !room.over || room.players.length < 2) { send(ws, { t: 'error', msg: 'Đối thủ không còn trong phòng' }); break; }
        room.rematch.add(ws);
        if (room.rematch.size >= 2) startRoom(room);
        else send(room.players.find(p => p !== ws), { t: 'rematchAsk' });
        break;

      case 'emote':
        if (room) {
          const opp = room.players.find(p => p !== ws);
          send(opp, { t: 'emote', e: String(m.e || '').slice(0, 24) });
        }
        break;

      case 'leave':
        leaveRoom(ws, 'left');
        break;
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    leaveRoom(ws, 'left');
  });
});

// keep-alive / dead connection cleanup
setInterval(() => {
  for (const ws of clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 30000);

server.listen(PORT, () => log(`Cờ Tướng server listening on :${PORT}`));
