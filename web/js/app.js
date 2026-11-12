/* Cờ Tướng 3D — main application (UI, game flow, AI and online modes). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var CH = { rK: '帥', rA: '仕', rB: '相', rN: '傌', rR: '俥', rC: '炮', rP: '兵',
             bK: '將', bA: '士', bB: '象', bN: '馬', bR: '車', bC: '砲', bP: '卒' };
  var LEVEL_NAME = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' };
  var SIDE_NAME = { r: 'Đỏ', b: 'Đen' };

  /* ---------------- settings ---------------- */
  var opt = { sound: true, vibrate: true, tilt: true, hints: true, name: '', server: '', level: 'medium', color: 'r' };
  function load() { try { var s = JSON.parse(localStorage.getItem('xq.settings') || '{}'); for (var k in s) opt[k] = s[k]; } catch (e) {} }
  function save() { try { localStorage.setItem('xq.settings', JSON.stringify(opt)); } catch (e) {} }
  load();

  /* ---------------- state ---------------- */
  var S = {
    mode: null,             // 'ai' | 'local' | 'online'
    game: new XQ.Game(),
    me: 'r',
    flipped: false,
    sel: -1, hints: [],
    busy: false, ended: false,
    aiThinking: false, token: 0,
    oppName: '', room: null,
    els: {},                // square -> piece element
    cell: 40, ps: 36
  };

  /* ---------------- screens ---------------- */
  var stack = ['home'];
  function show(id, push) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    if (push !== false) stack.push(id);
    if (id === 'game') requestAnimationFrame(layout);
    if (id === 'online') enterLobby();
  }
  function back() {
    if (stack.length > 1) stack.pop();
    var id = stack[stack.length - 1];
    show(id, false);
  }
  function goHome() { stack = ['home']; show('home', false); }

  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () { Sound.unlock(); show(b.getAttribute('data-go')); });
  });
  document.querySelectorAll('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.closest('#online')) leaveLobby();
      back();
    });
  });

  /* ---------------- UI helpers ---------------- */
  var toastTimer;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2200);
  }
  function banner(big, small) {
    var b = $('banner');
    b.querySelector('b').textContent = big; b.querySelector('span').textContent = small;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function modal(o) {
    var m = $('modal');
    var ic = $('mIcon');
    ic.textContent = o.icon || '帥';
    ic.className = 'modal-icon' + (o.iconSide === 'b' ? ' b' : '');
    $('mTitle').textContent = o.title || '';
    $('mText').textContent = o.text || '';
    var acts = $('mActions'); acts.innerHTML = '';
    var inp = null;
    if (o.input) {
      inp = document.createElement('input');
      inp.className = 'modal-input';
      inp.type = 'password'; inp.inputMode = 'numeric'; inp.maxLength = 8;
      inp.placeholder = o.input;
      acts.appendChild(inp);
      setTimeout(function () { inp.focus(); }, 350);
    }
    (o.actions || []).forEach(function (a) {
      var bt = document.createElement('button');
      bt.className = 'btn ' + (a.cls || 'dark');
      bt.textContent = a.label;
      bt.addEventListener('click', function () { hideModal(); if (a.fn) a.fn(inp ? inp.value : undefined); });
      acts.appendChild(bt);
    });
    m.classList.add('show');
  }
  function hideModal() { $('modal').classList.remove('show'); }
  function modalOpen() { return $('modal').classList.contains('show'); }
  function vibrate(ms) {
    if (!opt.vibrate) return;
    try {
      if (window.Android && window.Android.vibrate) window.Android.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  }

  /* ---------------- board construction ---------------- */
  function buildGrid() {
    var svg = $('gridSvg'), h = [];
    function L(x1, y1, x2, y2, cls) { h.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"' + (cls ? ' class="' + cls + '"' : '') + '/>'); }
    var X = function (c) { return 50 + c * 100; }, Y = function (r) { return 50 + r * 100; };
    for (var r = 0; r < 10; r++) L(X(0), Y(r), X(8), Y(r));
    L(X(0), Y(0), X(0), Y(9), 'outer'); L(X(8), Y(0), X(8), Y(9), 'outer');
    for (var c = 1; c < 8; c++) { L(X(c), Y(0), X(c), Y(4)); L(X(c), Y(5), X(c), Y(9)); }
    L(X(3), Y(0), X(5), Y(2)); L(X(5), Y(0), X(3), Y(2));
    L(X(3), Y(7), X(5), Y(9)); L(X(5), Y(7), X(3), Y(9));
    // outer double frame
    h.push('<path class="outer" d="M30 30 H870 V970 H30 Z"/>');
    // position markers for cannons & pawns
    var marks = [[2, 1], [2, 7], [7, 1], [7, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]];
    marks.forEach(function (m) {
      var x = X(m[1]), y = Y(m[0]), d = 9, l = 16;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
        if ((m[1] === 0 && s[0] < 0) || (m[1] === 8 && s[0] > 0)) return;
        var px = x + s[0] * d, py = y + s[1] * d;
        h.push('<path class="mk" d="M' + (px + s[0] * l) + ' ' + py + ' H' + px + ' V' + (py + s[1] * l) + '"/>');
      });
    });
    h.push('<text x="160" y="522" text-anchor="start">楚 河</text>');
    h.push('<text x="740" y="522" text-anchor="end">漢 界</text>');
    h.push('<text class="vn" x="450" y="508" text-anchor="middle">SÔNG</text>');
    svg.innerHTML = h.join('');

    var spots = $('spots');
    for (var s = 0; s < 90; s++) {
      var d = document.createElement('div');
      d.className = 'spot'; d.dataset.sq = s;
      spots.appendChild(d);
    }
    spots.addEventListener('click', function (e) {
      var t = e.target.closest('.spot');
      if (t) onTap(+t.dataset.sq);
    });
  }

  function view(s) {
    var r = XQ.rowOf(s), c = XQ.colOf(s);
    return S.flipped ? { r: 9 - r, c: 8 - c } : { r: r, c: c };
  }
  function pos(s) {
    var v = view(s), off = (S.cell - S.ps) / 2;
    return { x: v.c * S.cell + off, y: v.r * S.cell + off };
  }
  function T(p, z) { return 'translate3d(' + p.x + 'px,' + p.y + 'px,' + (z || 0) + 'px)'; }

  function layout() {
    var st = $('stage'), W = st.clientWidth, H = st.clientHeight;
    if (!W || !H) return;
    var tilt = opt.tilt ? 22 : 0;
    var cell = Math.min(W / 9.6, H / (10.6 * (opt.tilt ? 0.86 : 1)), 84);
    cell = Math.floor(cell);
    S.cell = cell; S.ps = Math.round(cell * 0.9);
    var root = document.documentElement.style;
    root.setProperty('--cell', cell + 'px');
    root.setProperty('--ps', S.ps + 'px');
    root.setProperty('--tilt', tilt + 'deg');
    var spots = $('spots').children;
    for (var s = 0; s < 90; s++) {
      var v = view(s);
      spots[s].style.left = v.c * cell + 'px';
      spots[s].style.top = v.r * cell + 'px';
    }
    for (var k in S.els) S.els[k].style.transform = T(pos(+k));
  }
  window.addEventListener('resize', function () { if ($('game').classList.contains('active')) layout(); });

  function makePiece(p) {
    var el = document.createElement('div');
    el.className = 'piece ' + p[0];
    el.innerHTML = '<div class="face"><span>' + CH[p] + '</span></div>';
    return el;
  }

  function renderPieces() {
    var layer = $('pieces'); layer.innerHTML = '';
    $('fx3d').innerHTML = '';
    S.els = {};
    var b = S.game.board;
    for (var s = 0; s < 90; s++) {
      if (!b[s]) continue;
      var el = makePiece(b[s]);
      el.style.transform = T(pos(s));
      layer.appendChild(el);
      S.els[s] = el;
    }
    markState();
  }

  function markState() {
    var g = S.game, last = g.history[g.history.length - 1];
    var spots = $('spots').children;
    for (var s = 0; s < 90; s++) spots[s].classList.remove('last-from', 'adm-from', 'adm-to');
    for (var k in S.els) S.els[k].classList.remove('last', 'danger');
    if (last) {
      spots[last.from].classList.add('last-from');
      if (S.els[last.to]) S.els[last.to].classList.add('last');
    }
    if (!g.result && g.inCheck(g.turn)) {
      var ks = g.kingSquare(g.turn);
      if (S.els[ks]) S.els[ks].classList.add('danger');
    }
    renderBars();
    adminAdvise();
  }

  /* ---------------- hidden admin assistant ----------------
   * Unlock: tap the spinning logo on the home screen 7 times, then enter the PIN
   * (the first time you choose the PIN). When on, the strongest engine level
   * quietly marks the best move whenever it is your turn.
   * In game: long-press your own avatar (bottom bar) to hide/show the marks.
   */
  var admin = { on: false, visible: true, tok: 0 };
  try { admin.on = localStorage.getItem('xq.adm') === '1'; } catch (e) {}
  function pinHash(p) { var h = 5381; p = 'xq#' + p; for (var i = 0; i < p.length; i++) h = ((h * 33) ^ p.charCodeAt(i)) >>> 0; return h.toString(36); }
  function adminSet(on) {
    admin.on = on;
    try { localStorage.setItem('xq.adm', on ? '1' : '0'); } catch (e) {}
    toast(on ? '✓' : '✕', 900);
    if ($('game').classList.contains('active')) markState();
  }
  function adminUnlock() {
    var stored = null;
    try { stored = localStorage.getItem('xq.admPin'); } catch (e) {}
    if (!stored) {
      modal({ icon: '🔒', title: 'Tạo mã PIN', text: 'Mã PIN 4–8 chữ số để bật/tắt chế độ ẩn.', input: 'PIN mới',
        actions: [{ label: 'Lưu', cls: 'gold', fn: function (v) {
          if (!/^\d{4,8}$/.test(v || '')) { toast('PIN phải gồm 4–8 chữ số'); return; }
          try { localStorage.setItem('xq.admPin', pinHash(v)); } catch (e) {}
          adminSet(true);
        } }, { label: 'Huỷ' }] });
      return;
    }
    modal({ icon: '🔒', title: 'Nhập mã PIN', text: '', input: 'PIN',
      actions: [{ label: 'OK', cls: 'gold', fn: function (v) {
        if (pinHash(v || '') !== stored) { toast('Sai mã PIN'); return; }
        adminSet(!admin.on);
      } }, { label: 'Huỷ' }] });
  }
  function adminMyTurn() {
    var g = S.game;
    if (!admin.on || !admin.visible || S.ended || g.result || !S.mode) return false;
    if (S.mode === 'local') return true;
    return g.turn === S.me;
  }
  function adminAdvise() {
    var tok = ++admin.tok;
    if (!adminMyTurn()) return;
    var g = S.game, plies = g.history.length;
    think(g.board.slice(), g.turn, 'master').then(function (res) {
      if (!res || tok !== admin.tok || g !== S.game || g.history.length !== plies || !adminMyTurn()) return;
      var spots = $('spots').children;
      spots[res.from].classList.add('adm-from');
      spots[res.to].classList.add('adm-to');
    });
  }

  /* ---------------- players / trays ---------------- */
  function sideName(side) {
    if (S.mode === 'ai') return side === S.me ? (opt.name || 'Bạn') : 'Máy · ' + LEVEL_NAME[opt.level];
    if (S.mode === 'online') return side === S.me ? (opt.name || 'Bạn') : (S.oppName || 'Đối thủ');
    return 'Quân ' + SIDE_NAME[side];
  }
  function renderBars() {
    var bottom = S.flipped ? 'b' : 'r', top = XQ.opp(bottom), g = S.game;
    [[$('pTop'), top], [$('pBot'), bottom]].forEach(function (x) {
      var el = x[0], side = x[1];
      el.classList.toggle('red', side === 'r'); el.classList.toggle('black', side === 'b');
      el.querySelector('.avatar span').textContent = side === 'r' ? '帥' : '將';
      el.querySelector('.pname').textContent = sideName(side);
      var turn = !S.ended && !g.result && g.turn === side;
      el.classList.toggle('turn', turn);
      var st = '';
      if (turn) st = (S.mode === 'ai' && side !== S.me) ? 'Đang suy nghĩ…' : (S.mode !== 'local' && side === S.me ? 'Đến lượt bạn' : 'Đến lượt đi');
      else st = 'Quân ' + SIDE_NAME[side];
      el.querySelector('.pstate').textContent = st;
      var tray = el.querySelector('.tray'), caps = [];
      g.history.forEach(function (h) { if (h.captured && h.piece[0] === side) caps.push(h.captured); });
      if (tray.childElementCount !== caps.length) {
        tray.innerHTML = '';
        caps.forEach(function (c) {
          var m = document.createElement('span'); m.className = 'mini ' + c[0]; m.textContent = CH[c]; tray.appendChild(m);
        });
      }
    });
    $('btnUndo').disabled = S.mode === 'online' || !g.history.length || S.ended;
    $('btnHint').disabled = S.mode === 'online' || S.ended || !!g.result;
    $('btnChat').classList.toggle('hidden', S.mode !== 'online');
    $('btnHint').classList.toggle('hidden', S.mode === 'online');
    $('btnUndo').classList.toggle('hidden', S.mode === 'online');
  }

  /* ---------------- selection & input ---------------- */
  function clearSel() {
    if (S.sel >= 0 && S.els[S.sel]) S.els[S.sel].classList.remove('sel');
    S.sel = -1; S.hints = [];
    var spots = $('spots').children;
    for (var s = 0; s < 90; s++) spots[s].classList.remove('hint', 'cap', 'best');
  }
  function select(sq) {
    clearSel();
    S.sel = sq; S.hints = S.game.legalFrom(sq);
    if (S.els[sq]) S.els[sq].classList.add('sel');
    if (opt.hints) {
      var spots = $('spots').children, b = S.game.board;
      S.hints.forEach(function (t) { spots[t].classList.add('hint'); if (b[t]) spots[t].classList.add('cap'); });
    }
    Sound.select();
  }
  function canControl() {
    if (S.ended || S.busy || S.game.result) return false;
    if (S.mode === 'local') return true;
    if (S.mode === 'ai') return S.game.turn === S.me && !S.aiThinking;
    if (S.mode === 'online') return S.game.turn === S.me;
    return false;
  }
  function onTap(sq) {
    Sound.unlock();
    $('emojiBar').classList.add('hidden');
    if (!canControl()) {
      if (S.mode === 'online' && !S.ended && S.game.turn !== S.me) toast('Chưa đến lượt bạn');
      return;
    }
    var p = S.game.board[sq];
    if (S.sel >= 0 && S.hints.indexOf(sq) >= 0) { var f = S.sel; clearSel(); playerMove(f, sq); return; }
    if (p && p[0] === S.game.turn) { if (S.sel === sq) clearSel(); else select(sq); return; }
    if (S.sel >= 0 && p) {
      // tapped an enemy piece that cannot be taken
      toast('Không thể đi nước này');
    }
    clearSel();
  }

  function playerMove(from, to) {
    var rec = applyMove(from, to);
    if (rec && S.mode === 'online') Net.send({ t: 'move', from: from, to: to });
  }

  /* ---------------- moves & animation ---------------- */
  function applyMove(from, to, cb) {
    var g = S.game, el = S.els[from], victim = S.els[to];
    var rec = g.move(from, to);
    if (!rec) return null;
    S.busy = true;
    delete S.els[from];
    S.els[to] = el;
    var a = pos(from), b = pos(to);
    var dist = Math.hypot(a.x - b.x, a.y - b.y) / S.cell;
    var dur = Math.min(520, 230 + dist * 40);
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    el.classList.remove('sel');
    el.parentNode.appendChild(el); // render above others
    var anim = el.animate([
      { transform: T(a, 0) },
      { transform: T(mid, S.cell * (victim ? 1.1 : 0.7)), offset: 0.5 },
      { transform: T(b, 0) }
    ], { duration: dur, easing: 'cubic-bezier(.35,.0,.25,1)' });
    el.style.transform = T(b);
    var done = false;
    function land() {
      if (done) return; done = true;
      var face = el.querySelector('.face');
      if (face) face.animate([{ transform: 'scale(1.18,0.86)' }, { transform: 'scale(.96,1.04)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
      if (victim) {
        var burst = FX.shatter(victim, $('fx3d'), b.x, b.y, S.ps);
        Sound.move();
        setTimeout(function () {
          Sound.capture();
          var r = $('spots').children[to].getBoundingClientRect();
          FX.sparks(r.left + r.width / 2, r.top + r.height / 2 - S.ps * 0.6, Math.max(0.6, S.cell / 50));
          FX.shake($('stage'), Math.max(5, S.cell / 7));
          vibrate(rec.captured[1] === 'R' ? 90 : 55);
        }, burst);
      } else {
        Sound.move();
      }
      markState();
      afterMove(rec);
      setTimeout(function () { S.busy = false; if (cb) cb(rec); maybeAI(); }, victim ? 420 : 60);
    }
    anim.onfinish = land;
    setTimeout(land, dur + 80); // safety if onfinish does not fire
    return rec;
  }

  function afterMove(rec) {
    if (rec.result) {
      setTimeout(function () { endGame(rec.result); }, rec.captured ? 1300 : 700);
      if (rec.result.reason === 'checkmate') { banner('將 死', 'CHIẾU BÍ!'); Sound.check(); }
      return;
    }
    if (rec.check) { setTimeout(function () { banner('將 軍', 'CHIẾU TƯỚNG!'); Sound.check(); vibrate(40); }, rec.captured ? 500 : 80); }
  }

  /* ---------------- AI ---------------- */
  var worker = null, workerFailed = false, jobs = {}, jobId = 0;
  function getWorker() {
    if (worker || workerFailed) return worker;
    try {
      var src = XiangqiFactory.toString() + '\n' + XiangqiAIFactory.toString() +
        '\nvar XQ = XiangqiFactory(); var XQAI = XiangqiAIFactory(XQ);' +
        '\nonmessage = function (e) { var d = e.data; postMessage({ id: d.id, res: XQAI.think(d.board, d.side, d.level) }); };';
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = function (e) { var j = jobs[e.data.id]; delete jobs[e.data.id]; if (j) j.resolve(e.data.res); };
      worker.onerror = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        workerFailed = true; worker = null;
        var pend = jobs; jobs = {};
        Object.keys(pend).forEach(function (k) { var j = pend[k]; j.resolve(XQAI.think(j.board, j.side, j.level)); });
      };
    } catch (e) { workerFailed = true; worker = null; }
    return worker;
  }
  function think(board, side, level) {
    return new Promise(function (resolve) {
      var w = getWorker();
      if (w) {
        var id = ++jobId;
        jobs[id] = { resolve: resolve, board: board, side: side, level: level };
        w.postMessage({ id: id, board: board, side: side, level: level });
      } else {
        setTimeout(function () { resolve(XQAI.think(board, side, level)); }, 30);
      }
    });
  }
  function maybeAI() {
    var g = S.game;
    if (S.mode !== 'ai' || S.ended || g.result || g.turn === S.me || S.aiThinking || S.busy) return;
    S.aiThinking = true;
    var tok = S.token, t0 = Date.now();
    renderBars();
    think(g.board.slice(), g.turn, opt.level).then(function (res) {
      var wait = Math.max(0, 550 - (Date.now() - t0));
      setTimeout(function () {
        if (tok !== S.token) return;
        S.aiThinking = false;
        if (res && !S.ended) applyMove(res.from, res.to);
      }, wait);
    });
  }

  /* ---------------- game lifecycle ---------------- */
  function startGame(mode, o) {
    o = o || {};
    S.mode = mode;
    S.token++;
    S.game = new XQ.Game();
    S.me = o.me || 'r';
    S.flipped = S.me === 'b';
    S.ended = false; S.busy = false; S.aiThinking = false;
    S.oppName = o.oppName || '';
    clearSel();
    hideModal();
    $('modeTitle').textContent = mode === 'ai' ? 'Đấu với máy · ' + LEVEL_NAME[opt.level]
      : mode === 'online' ? 'Online' + (o.room ? ' · Phòng ' + o.room : '') : 'Hai người';
    $('emojiBar').classList.add('hidden');
    if (!$('game').classList.contains('active')) { stack = ['home', 'game']; show('game', false); }
    layout();
    renderPieces();
    setTimeout(function () { banner(S.mode === 'local' ? '開 局' : (S.me === 'r' ? '紅 先' : '黑 方'),
      S.mode === 'local' ? 'BẮT ĐẦU' : (S.me === 'r' ? 'BẠN CẦM ĐỎ · ĐI TRƯỚC' : 'BẠN CẦM ĐEN')); }, 250);
    setTimeout(maybeAI, 900);
  }

  var REASON = {
    checkmate: 'Chiếu bí', stalemate: 'Hết nước đi', resign: 'Xin thua', left: 'Đối thủ đã rời trận',
    draw: 'Hoà cờ — 60 nước không ăn quân', repetition: 'Hoà cờ — lặp lại nước đi', disconnect: 'Mất kết nối'
  };

  function endGame(res) {
    if (S.ended) return;
    S.ended = true; S.aiThinking = false; S.token++;
    clearSel();
    renderBars();
    var title, text = REASON[res.reason] || '', icon = '和', side = null, win = null;
    if (!res.winner) title = 'Hoà cờ';
    else {
      side = res.winner; icon = side === 'r' ? '帥' : '將';
      if (S.mode === 'local') title = 'Quân ' + SIDE_NAME[side] + ' thắng!';
      else { win = res.winner === S.me; title = win ? 'Chiến thắng!' : 'Thất bại'; }
      if (res.reason === 'resign') text = (S.mode === 'local' ? 'Quân ' + SIDE_NAME[XQ.opp(side)] + ' xin thua' : (win ? 'Đối thủ xin thua' : 'Bạn đã xin thua'));
    }
    if (win === false) Sound.lose(); else Sound.win();
    var actions = S.mode === 'online'
      ? [{ label: 'Đấu lại', cls: 'gold', fn: function () { Net.send({ t: 'rematch' }); toast('Đã gửi lời mời đấu lại…', 3000); } },
         { label: 'Về sảnh', fn: function () { Net.send({ t: 'leave' }); stack = ['home', 'online']; show('online', false); } }]
      : [{ label: 'Chơi ván mới', cls: 'gold', fn: function () { startGame(S.mode, { me: S.me }); } },
         { label: 'Xem lại bàn cờ', fn: function () {} },
         { label: 'Về menu', fn: goHome }];
    modal({ icon: icon, iconSide: side, title: title, text: text, actions: actions });
  }

  function confirmBox(title, text, yes, fn) {
    modal({ icon: '?', title: title, text: text, actions: [{ label: yes, cls: 'red', fn: fn }, { label: 'Huỷ' }] });
  }

  function exitGame() {
    var inProgress = !S.ended && S.game.history.length > 0;
    function leave() {
      S.token++; S.aiThinking = false;
      if (S.mode === 'online') { Net.send({ t: 'leave' }); S.ended = true; stack = ['home', 'online']; show('online', false); }
      else goHome();
    }
    if (inProgress || (S.mode === 'online' && !S.ended)) confirmBox('Rời ván cờ?', S.mode === 'online' ? 'Bạn sẽ bị xử thua.' : 'Ván đang chơi sẽ bị huỷ.', 'Rời ván', leave);
    else leave();
  }

  /* ---------------- controls ---------------- */
  $('btnLocal').addEventListener('click', function () { Sound.unlock(); startGame('local'); });
  function bindSeg(id, key) {
    var seg = $(id);
    seg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.v === opt[key]);
      b.addEventListener('click', function () {
        seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        opt[key] = b.dataset.v; save();
      });
    });
  }
  bindSeg('segLevel', 'level');
  bindSeg('segColor', 'color');
  $('btnStartAI').addEventListener('click', function () { Sound.unlock(); startGame('ai', { me: opt.color }); });

  $('btnExit').addEventListener('click', exitGame);
  $('btnUndo').addEventListener('click', function () {
    var g = S.game;
    if (S.busy || S.ended || !g.history.length) return;
    S.token++; S.aiThinking = false;
    clearSel();
    if (S.mode === 'ai') {
      g.undo();
      while (g.history.length && g.turn !== S.me) g.undo();
      if (g.turn !== S.me) { renderPieces(); maybeAI(); return; }
    } else g.undo();
    renderPieces();
    Sound.move();
  });
  $('btnHint').addEventListener('click', function () {
    if (!canControl()) return;
    var tok = S.token;
    toast('Đang tìm nước hay…', 1200);
    think(S.game.board.slice(), S.game.turn, 'medium').then(function (res) {
      if (!res || tok !== S.token || !canControl()) return;
      select(res.from);
      $('spots').children[res.to].classList.add('best', 'hint');
    });
  });
  $('btnFlip').addEventListener('click', function () {
    S.flipped = !S.flipped;
    var layer = $('pieces');
    layer.classList.add('flipping');
    for (var k in S.els) S.els[k].style.transition = 'transform .5s cubic-bezier(.3,.8,.3,1)';
    layout();
    renderBars();
    setTimeout(function () { for (var k in S.els) S.els[k].style.transition = ''; layer.classList.remove('flipping'); }, 550);
  });
  $('btnResign').addEventListener('click', function () {
    if (S.ended) return;
    confirmBox('Xin thua?', 'Bạn chắc chắn muốn chịu thua ván này?', 'Xin thua', function () {
      if (S.mode === 'online') { Net.send({ t: 'resign' }); return; }
      var loser = S.mode === 'ai' ? S.me : S.game.turn;
      endGame({ winner: XQ.opp(loser), reason: 'resign' });
    });
  });
  $('btnMenu').addEventListener('click', function () {
    var acts = [];
    if (S.mode !== 'online') acts.push({ label: 'Ván mới', cls: 'gold', fn: function () { startGame(S.mode, { me: S.me }); } });
    acts.push({ label: (opt.tilt ? 'Tắt' : 'Bật') + ' bàn cờ 3D', fn: function () { opt.tilt = !opt.tilt; $('optTilt').checked = opt.tilt; save(); layout(); } });
    acts.push({ label: (opt.sound ? 'Tắt' : 'Bật') + ' âm thanh', fn: function () { opt.sound = !opt.sound; $('optSound').checked = opt.sound; Sound.setEnabled(opt.sound); save(); } });
    acts.push({ label: 'Đóng' });
    modal({ icon: '⚙', title: 'Tuỳ chọn', text: '', actions: acts });
  });
  $('btnChat').addEventListener('click', function () { $('emojiBar').classList.toggle('hidden'); });
  $('emojiBar').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Net.send({ t: 'emote', e: b.textContent });
    showEmote('Bạn: ' + b.textContent);
    $('emojiBar').classList.add('hidden');
  });
  function showEmote(txt) {
    var e = $('emote'); e.textContent = txt; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
  }

  /* settings */
  [['optSound', 'sound'], ['optVibrate', 'vibrate'], ['optTilt', 'tilt'], ['optHints', 'hints']].forEach(function (x) {
    var el = $(x[0]); el.checked = !!opt[x[1]];
    el.addEventListener('change', function () {
      opt[x[1]] = el.checked; save();
      if (x[1] === 'sound') Sound.setEnabled(opt.sound);
      if (x[1] === 'tilt') layout();
    });
  });
  Sound.setEnabled(opt.sound);

  /* ---------------- online lobby ---------------- */
  function defaultServer() {
    if (opt.server) return opt.server;
    if (/^https?:/.test(location.protocol) && location.host) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    return '';
  }
  function setLobbyWaiting(on, text, code) {
    $('lobbyIdle').classList.toggle('hidden', on);
    $('lobbyWait').classList.toggle('hidden', !on);
    if (text) $('waitText').textContent = text;
    $('roomCode').classList.toggle('hidden', !code);
    $('roomCode').textContent = code || '';
  }
  function enterLobby() {
    $('inName').value = opt.name || '';
    $('inServer').value = defaultServer();
    setLobbyWaiting(false);
  }
  function leaveLobby() { if (!$('lobbyWait').classList.contains('hidden')) Net.send({ t: 'cancel' }); setLobbyWaiting(false); }
  function lobbySend(msg) {
    opt.name = $('inName').value.trim().slice(0, 16);
    var srv = $('inServer').value.trim();
    if (!srv) { toast('Hãy nhập địa chỉ máy chủ (vd: ws://192.168.1.10:3000)', 3000); $('inServer').focus(); return; }
    opt.server = srv; save();
    Net.connect(srv);
    msg.name = opt.name || 'Kỳ thủ';
    Net.send({ t: 'hello', name: msg.name });
    Net.send(msg);
  }
  $('btnQuick').addEventListener('click', function () { Sound.unlock(); setLobbyWaiting(true, 'Đang tìm đối thủ…'); lobbySend({ t: 'quick' }); });
  $('btnCreate').addEventListener('click', function () { Sound.unlock(); setLobbyWaiting(true, 'Đang tạo phòng…'); lobbySend({ t: 'create' }); });
  $('btnJoin').addEventListener('click', function () {
    Sound.unlock();
    var code = $('inCode').value.trim();
    if (!/^\d{4}$/.test(code)) { toast('Mã phòng gồm 4 chữ số'); return; }
    setLobbyWaiting(true, 'Đang vào phòng ' + code + '…');
    lobbySend({ t: 'join', code: code });
  });
  $('btnCancel').addEventListener('click', function () { Net.send({ t: 'cancel' }); setLobbyWaiting(false); });

  Net.on('status', function (s) {
    var el = $('netStatus');
    el.className = 'net-status' + (s.state === 'open' ? ' ok' : s.state === 'error' || s.state === 'closed' ? ' err' : '');
    el.textContent = { connecting: 'Đang kết nối…', open: '● Đã kết nối máy chủ', error: 'Không kết nối được máy chủ', closed: 'Đã ngắt kết nối' }[s.state];
    if (s.state === 'error' || s.state === 'closed') {
      setLobbyWaiting(false);
      if (S.mode === 'online' && !S.ended && $('game').classList.contains('active')) {
        S.ended = true;
        modal({ icon: '⚠', title: 'Mất kết nối', text: 'Không còn kết nối tới máy chủ.', actions: [{ label: 'Về sảnh', cls: 'gold', fn: function () { stack = ['home', 'online']; show('online', false); } }] });
      }
    }
  });
  Net.on('waiting', function (m) {
    if (m.code) setLobbyWaiting(true, 'Gửi mã phòng này cho bạn bè:', m.code);
    else setLobbyWaiting(true, 'Đang tìm đối thủ…');
  });
  Net.on('start', function (m) {
    Sound.notify();
    setLobbyWaiting(false);
    S.room = m.code || null;
    startGame('online', { me: m.color, oppName: m.opp, room: m.code });
  });
  Net.on('move', function (m) {
    if (S.mode !== 'online' || S.ended) return;
    var run = function () {
      if (!S.game.canMove(m.from, m.to)) { Net.send({ t: 'sync' }); return; }
      clearSel();
      applyMove(m.from, m.to);
    };
    if (S.busy) setTimeout(run, 500); else run();
  });
  Net.on('sync', function (m) {
    if (S.mode !== 'online') return;
    var g = new XQ.Game();
    (m.moves || []).forEach(function (mv) { g.move(mv[0], mv[1]); });
    S.game = g; clearSel(); renderPieces();
  });
  Net.on('over', function (m) {
    if (S.mode !== 'online') return;
    var delay = S.busy ? 1300 : 200;
    setTimeout(function () { endGame({ winner: m.winner, reason: m.reason }); }, delay);
  });
  Net.on('rematchAsk', function () { toast('Đối thủ muốn đấu lại!', 3000); Sound.notify(); });
  Net.on('emote', function (m) { showEmote(m.e); Sound.notify(); });
  Net.on('error', function (m) { toast(m.msg || 'Lỗi', 3000); if (m.lobby) setLobbyWaiting(false); });

  /* ---------------- Android back button ---------------- */
  window.onAndroidBack = function () {
    if (modalOpen()) { hideModal(); return true; }
    var cur = stack[stack.length - 1];
    if (cur === 'home') return false;
    if (cur === 'game') { exitGame(); return true; }
    if (cur === 'online') leaveLobby();
    back();
    return true;
  };

  (function () {
    var taps = 0, timer = null;
    document.querySelector('.coin-stage').addEventListener('click', function () {
      taps++;
      clearTimeout(timer); timer = setTimeout(function () { taps = 0; }, 2500);
      if (taps >= 7) { taps = 0; adminUnlock(); }
    });
    var press = null, av = $('pBot').querySelector('.avatar');
    function start() {
      if (!admin.on) return;
      press = setTimeout(function () {
        admin.visible = !admin.visible; vibrate(30);
        markState();
      }, 600);
    }
    function cancel() { clearTimeout(press); }
    av.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { av.addEventListener(ev, cancel); });
    av.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  })();

  /* ---------------- boot ---------------- */
  buildGrid();
  FX.initCanvas();
  document.addEventListener('touchstart', function () { Sound.unlock(); }, { once: true, passive: true });
  // Debug/testing hook
  window.__xq = { S: S, startGame: startGame, applyMove: applyMove };
})();
