/*
 * Xiangqi AI: iterative-deepening negamax with alpha-beta, quiescence search,
 * MVV/LVA ordering and killer moves. Requires XQ (xiangqi.js).
 */
function XiangqiAIFactory(XQ) {
  'use strict';
  var VAL = { K: 6000, R: 900, N: 400, C: 450, A: 200, B: 200, P: 100 };
  var MATE = 100000;

  // Positional bonus, computed from Red's point of view (row 0 = enemy back rank).
  function pst(t, r, c) {
    var center = 4 - Math.abs(c - 4); // 0..4
    switch (t) {
      case 'P':
        if (r >= 5) return r === 6 ? 0 : 5;          // not crossed yet
        if (r === 0) return 20 + center * 2;          // bottom line pawn, less useful
        return 60 + (4 - Math.abs(r - 2)) * 12 + center * 8;
      case 'N':
        return center * 8 + (r <= 5 ? 20 : 0) + (r <= 3 ? 10 : 0) - (c === 0 || c === 8 ? 20 : 0);
      case 'C':
        return (c === 4 ? 25 : center * 3) + (r >= 7 ? 10 : 0);
      case 'R':
        return center * 4 + (r <= 3 ? 25 : 0) + (r === 9 && (c === 0 || c === 8) ? -10 : 0);
      case 'A': case 'B':
        return 0;
      case 'K':
        return c === 4 ? 8 : 0;
    }
    return 0;
  }
  var PST = {};
  ['r', 'b'].forEach(function (side) {
    'KARNCBP'.split('').forEach(function (t) {
      var a = new Array(90);
      for (var s = 0; s < 90; s++) {
        var r = (s / 9) | 0, c = s % 9;
        a[s] = VAL[t] + pst(t, side === 'r' ? r : 9 - r, c);
      }
      PST[side + t] = a;
    });
  });

  function evaluate(b, side) {
    var score = 0;
    for (var s = 0; s < 90; s++) {
      var p = b[s];
      if (p) score += p[0] === 'r' ? PST[p][s] : -PST[p][s];
    }
    return side === 'r' ? score : -score;
  }

  function Search(board, side, opts) {
    this.b = board.slice();
    this.side = side;
    this.deadline = Date.now() + (opts.timeMs || 1000);
    this.maxDepth = opts.depth || 4;
    this.noise = opts.noise || 0;
    this.nodes = 0;
    this.stop = false;
    this.killers = [];
  }

  Search.prototype.order = function (moves, ply) {
    var b = this.b, k = this.killers[ply] || [];
    var scored = moves.map(function (m) {
      var to = m % 100, from = (m / 100) | 0, cap = b[to], sc = 0;
      if (cap) sc = 10000 + VAL[cap[1]] * 10 - VAL[b[from][1]];
      else if (m === k[0]) sc = 9000;
      else if (m === k[1]) sc = 8000;
      return { m: m, s: sc };
    });
    scored.sort(function (x, y) { return y.s - x.s; });
    return scored.map(function (x) { return x.m; });
  };

  Search.prototype.timeUp = function () {
    if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) this.stop = true;
    return this.stop;
  };

  Search.prototype.quiesce = function (side, alpha, beta, qd) {
    if (this.timeUp()) return 0;
    var stand = evaluate(this.b, side);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd > 5) return stand;
    var b = this.b, moves = XQ.genMoves(b, side).filter(function (m) { return b[m % 100]; });
    moves = this.order(moves, 60);
    var o = XQ.opp(side);
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i], from = (m / 100) | 0, to = m % 100, cap = b[to], p = b[from];
      if (cap[1] === 'K') return MATE;
      b[to] = p; b[from] = null;
      if (XQ.inCheck(b, side)) { b[from] = p; b[to] = cap; continue; }
      var sc = -this.quiesce(o, -beta, -alpha, qd + 1);
      b[from] = p; b[to] = cap;
      if (this.stop) return 0;
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  };

  Search.prototype.negamax = function (side, depth, alpha, beta, ply) {
    if (this.timeUp()) return 0;
    var b = this.b;
    var check = XQ.inCheck(b, side);
    if (check) depth++; // check extension
    if (depth <= 0) return this.quiesce(side, alpha, beta, 0);
    var moves = this.order(XQ.genMoves(b, side), ply);
    var o = XQ.opp(side), legal = 0, best = -MATE;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i], from = (m / 100) | 0, to = m % 100, cap = b[to], p = b[from];
      b[to] = p; b[from] = null;
      if (XQ.inCheck(b, side)) { b[from] = p; b[to] = cap; continue; }
      legal++;
      var sc = -this.negamax(o, depth - 1, -beta, -alpha, ply + 1);
      b[from] = p; b[to] = cap;
      if (this.stop) return 0;
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (!cap) {
          var k = this.killers[ply] || (this.killers[ply] = []);
          if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
        }
        break;
      }
    }
    if (legal === 0) return -MATE + ply; // checkmated or stalemated: loss in Xiangqi
    return best;
  };

  Search.prototype.run = function () {
    var b = this.b, side = this.side, o = XQ.opp(side);
    var root = XQ.legalMoves(b, side);
    if (!root.length) return null;
    var bestMove = root[0], bestScore = -MATE;
    root = this.order(root, 0);
    for (var depth = 1; depth <= this.maxDepth; depth++) {
      var alpha = -MATE - 1, curBest = null, curScore = -MATE - 1;
      var scores = [];
      for (var i = 0; i < root.length; i++) {
        var m = root[i], from = (m / 100) | 0, to = m % 100, cap = b[to], p = b[from];
        b[to] = p; b[from] = null;
        var sc = -this.negamax(o, depth - 1, -MATE - 1, -alpha, 1);
        b[from] = p; b[to] = cap;
        if (this.stop) break;
        if (this.noise) sc += Math.floor((Math.random() - 0.5) * this.noise);
        scores.push({ m: m, s: sc });
        if (sc > curScore) { curScore = sc; curBest = m; }
        // with noise every root move gets an exact (full-window) score
        if (!this.noise && sc > alpha) alpha = sc;
      }
      if (this.stop && depth > 1) break;
      if (curBest !== null) { bestMove = curBest; bestScore = curScore; }
      // put best move first for next iteration
      root.sort(function (x, y) { return x === bestMove ? -1 : y === bestMove ? 1 : 0; });
      if (bestScore > MATE - 100) break;
      if (Date.now() > this.deadline) break;
    }
    return { from: (bestMove / 100) | 0, to: bestMove % 100, score: bestScore, nodes: this.nodes };
  };

  var LEVELS = {
    easy: { depth: 2, timeMs: 400, noise: 120 },
    medium: { depth: 3, timeMs: 1000, noise: 30 },
    hard: { depth: 6, timeMs: 2200, noise: 0 },
    master: { depth: 12, timeMs: 3000, noise: 0 }
  };

  function think(board, side, level) {
    var opts = LEVELS[level] || LEVELS.medium;
    return new Search(board, side, opts).run();
  }

  return { think: think, evaluate: evaluate, LEVELS: LEVELS };
}

(function (root) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = XiangqiAIFactory(require('./xiangqi.js'));
  } else if (root.XQ) {
    root.XQAI = XiangqiAIFactory(root.XQ);
  }
})(typeof self !== 'undefined' ? self : this);
