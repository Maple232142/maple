/*
 * Xiangqi (Cờ tướng) rules engine.
 * Board: 90 squares, index = row * 9 + col. Row 0 is the top (Black side),
 * row 9 is the bottom (Red side). Pieces are strings: side + type,
 * side in {r, b}; type in K (Tướng), A (Sĩ), B (Tượng), N (Mã), R (Xe), C (Pháo), P (Tốt).
 * Works in the browser (window.XQ), Web Workers (self.XQ) and Node (module.exports).
 */
function XiangqiFactory() {
  'use strict';
  var COLS = 9, ROWS = 10;
  var BACK = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'];
  var ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var HORSE = [[-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
               [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]];

  function sq(r, c) { return r * COLS + c; }
  function rowOf(s) { return (s / COLS) | 0; }
  function colOf(s) { return s % COLS; }
  function onBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
  function opp(side) { return side === 'r' ? 'b' : 'r'; }
  function inPalace(side, r, c) {
    if (c < 3 || c > 5 || r < 0 || r > 9) return false;
    return side === 'r' ? r >= 7 : r <= 2;
  }
  function ownHalf(side, r) { return side === 'r' ? r >= 5 : r <= 4; }

  function initialBoard() {
    var b = new Array(90).fill(null);
    for (var c = 0; c < 9; c++) {
      b[sq(0, c)] = 'b' + BACK[c];
      b[sq(9, c)] = 'r' + BACK[c];
    }
    b[sq(2, 1)] = 'bC'; b[sq(2, 7)] = 'bC';
    b[sq(7, 1)] = 'rC'; b[sq(7, 7)] = 'rC';
    for (c = 0; c < 9; c += 2) { b[sq(3, c)] = 'bP'; b[sq(6, c)] = 'rP'; }
    return b;
  }

  /* Pseudo-legal moves for the piece on square s (does not check self-check). */
  function pieceMoves(b, s, out) {
    var p = b[s];
    if (!p) return out;
    var side = p[0], t = p[1];
    var r = rowOf(s), c = colOf(s);
    var i, nr, nc, ns, q;
    function add(to) {
      var x = b[to];
      if (!x || x[0] !== side) out.push(s * 100 + to);
    }
    switch (t) {
      case 'K':
        for (i = 0; i < 4; i++) {
          nr = r + ORTHO[i][0]; nc = c + ORTHO[i][1];
          if (inPalace(side, nr, nc)) add(sq(nr, nc));
        }
        break;
      case 'A':
        for (i = 0; i < 4; i++) {
          nr = r + DIAG[i][0]; nc = c + DIAG[i][1];
          if (inPalace(side, nr, nc)) add(sq(nr, nc));
        }
        break;
      case 'B':
        for (i = 0; i < 4; i++) {
          nr = r + DIAG[i][0] * 2; nc = c + DIAG[i][1] * 2;
          if (onBoard(nr, nc) && ownHalf(side, nr) && !b[sq(r + DIAG[i][0], c + DIAG[i][1])]) add(sq(nr, nc));
        }
        break;
      case 'N':
        for (i = 0; i < 8; i++) {
          nr = r + HORSE[i][0]; nc = c + HORSE[i][1];
          if (onBoard(nr, nc) && !b[sq(r + HORSE[i][2], c + HORSE[i][3])]) add(sq(nr, nc));
        }
        break;
      case 'R':
        for (i = 0; i < 4; i++) {
          nr = r + ORTHO[i][0]; nc = c + ORTHO[i][1];
          while (onBoard(nr, nc)) {
            ns = sq(nr, nc);
            if (b[ns]) { if (b[ns][0] !== side) out.push(s * 100 + ns); break; }
            out.push(s * 100 + ns);
            nr += ORTHO[i][0]; nc += ORTHO[i][1];
          }
        }
        break;
      case 'C':
        for (i = 0; i < 4; i++) {
          nr = r + ORTHO[i][0]; nc = c + ORTHO[i][1];
          var jumped = false;
          while (onBoard(nr, nc)) {
            ns = sq(nr, nc); q = b[ns];
            if (!jumped) {
              if (q) jumped = true; else out.push(s * 100 + ns);
            } else if (q) {
              if (q[0] !== side) out.push(s * 100 + ns);
              break;
            }
            nr += ORTHO[i][0]; nc += ORTHO[i][1];
          }
        }
        break;
      case 'P':
        var fwd = side === 'r' ? -1 : 1;
        if (onBoard(r + fwd, c)) add(sq(r + fwd, c));
        if (!ownHalf(side, r)) {
          if (c > 0) add(sq(r, c - 1));
          if (c < 8) add(sq(r, c + 1));
        }
        break;
    }
    return out;
  }

  function genMoves(b, side) {
    var out = [];
    for (var s = 0; s < 90; s++) if (b[s] && b[s][0] === side) pieceMoves(b, s, out);
    return out;
  }

  function findKing(b, side) {
    var k = side + 'K';
    for (var s = 0; s < 90; s++) if (b[s] === k) return s;
    return -1;
  }

  /* Is square s attacked by side `by`? (intended for king squares; includes flying general). */
  function isAttacked(b, s, by) {
    var r = rowOf(s), c = colOf(s), i, nr, nc, q;
    // Lines: chariot, cannon, flying general
    for (i = 0; i < 4; i++) {
      var dr = ORTHO[i][0], dc = ORTHO[i][1];
      nr = r + dr; nc = c + dc;
      var screens = 0;
      while (onBoard(nr, nc)) {
        q = b[sq(nr, nc)];
        if (q) {
          if (screens === 0) {
            if (q[0] === by && (q[1] === 'R' || (q[1] === 'K' && dc === 0))) return true;
            screens = 1;
          } else {
            if (q[0] === by && q[1] === 'C') return true;
            break;
          }
        }
        nr += dr; nc += dc;
      }
    }
    // Horses: a horse at s + (dr,dc) moving to s; its leg is relative to the horse
    for (i = 0; i < 8; i++) {
      var hr = r - HORSE[i][0], hc = c - HORSE[i][1];
      if (!onBoard(hr, hc)) continue;
      q = b[sq(hr, hc)];
      if (q && q[0] === by && q[1] === 'N' && !b[sq(hr + HORSE[i][2], hc + HORSE[i][3])]) return true;
    }
    // Pawns
    var back = by === 'r' ? 1 : -1; // pawn of `by` sits "behind" s from its own perspective
    if (onBoard(r + back, c)) { q = b[sq(r + back, c)]; if (q === by + 'P') return true; }
    if (!ownHalf(by, r)) {
      if (c > 0 && b[sq(r, c - 1)] === by + 'P') return true;
      if (c < 8 && b[sq(r, c + 1)] === by + 'P') return true;
    }
    return false;
  }

  function inCheck(b, side) {
    var k = findKing(b, side);
    return k < 0 || isAttacked(b, k, opp(side));
  }

  function isLegal(b, m, side) {
    var from = (m / 100) | 0, to = m % 100;
    var cap = b[to], p = b[from];
    b[to] = p; b[from] = null;
    var ok = !inCheck(b, side);
    b[from] = p; b[to] = cap;
    return ok;
  }

  function legalMoves(b, side) {
    var all = genMoves(b, side), out = [];
    for (var i = 0; i < all.length; i++) if (isLegal(b, all[i], side)) out.push(all[i]);
    return out;
  }

  /* ---- Game wrapper with history ---- */
  function Game() { this.reset(); }
  Game.prototype.reset = function () {
    this.board = initialBoard();
    this.turn = 'r';
    this.history = [];
    this.quiet = 0; // plies since last capture
    this.result = null;
  };
  Game.prototype.legalFrom = function (from) {
    var b = this.board, p = b[from];
    if (!p || p[0] !== this.turn || this.result) return [];
    var out = pieceMoves(b, from, []), res = [];
    for (var i = 0; i < out.length; i++) if (isLegal(b, out[i], this.turn)) res.push(out[i] % 100);
    return res;
  };
  Game.prototype.canMove = function (from, to) {
    return this.legalFrom(from).indexOf(to) >= 0;
  };
  Game.prototype.move = function (from, to) {
    if (!this.canMove(from, to)) return null;
    var b = this.board;
    var rec = { from: from, to: to, piece: b[from], captured: b[to], quiet: this.quiet };
    b[to] = b[from]; b[from] = null;
    this.quiet = rec.captured ? 0 : this.quiet + 1;
    this.turn = opp(this.turn);
    this.history.push(rec);
    rec.check = inCheck(b, this.turn);
    this.result = this.computeResult();
    rec.result = this.result;
    return rec;
  };
  Game.prototype.undo = function () {
    var rec = this.history.pop();
    if (!rec) return null;
    this.board[rec.from] = rec.piece;
    this.board[rec.to] = rec.captured;
    this.turn = rec.piece[0];
    this.quiet = rec.quiet;
    this.result = null;
    return rec;
  };
  Game.prototype.computeResult = function () {
    if (legalMoves(this.board, this.turn).length === 0) {
      return { winner: opp(this.turn), reason: inCheck(this.board, this.turn) ? 'checkmate' : 'stalemate' };
    }
    if (this.quiet >= 120) return { winner: null, reason: 'draw' };
    // threefold repetition => draw
    if (this.history.length >= 8) {
      var key = this.board.join(',') + this.turn, count = 0;
      // replay backwards cheaply by undoing on a copy
      var bb = this.board.slice(), t = this.turn;
      for (var i = this.history.length - 1; i >= 0; i--) {
        var h = this.history[i];
        bb[h.from] = h.piece; bb[h.to] = h.captured; t = h.piece[0];
        if (h.captured) break;
        if (bb.join(',') + t === key) count++;
      }
      if (count >= 2) return { winner: null, reason: 'repetition' };
    }
    return null;
  };
  Game.prototype.inCheck = function (side) { return inCheck(this.board, side || this.turn); };
  Game.prototype.kingSquare = function (side) { return findKing(this.board, side); };

  return {
    COLS: COLS, ROWS: ROWS,
    sq: sq, rowOf: rowOf, colOf: colOf, opp: opp,
    initialBoard: initialBoard, pieceMoves: pieceMoves, genMoves: genMoves,
    legalMoves: legalMoves, isLegal: isLegal, isAttacked: isAttacked,
    inCheck: inCheck, findKing: findKing, Game: Game
  };
}

(function (root) {
  var api = XiangqiFactory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XQ = api;
})(typeof self !== 'undefined' ? self : this);
