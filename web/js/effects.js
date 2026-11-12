/* Visual effects: 3D piece shatter on capture, shockwave, sparks, screen shake. */
var FX = (function () {
  var canvas, g, parts = [], running = false, dpr = 1;

  function initCanvas() {
    canvas = document.getElementById('sparks');
    g = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ---- canvas particle sparks (screen space) ---- */
  function sparks(x, y, scale) {
    if (!canvas) initCanvas();
    var colors = ['#fff6c8', '#ffd36a', '#ffae3a', '#ff7a1a', '#ff4b1f'];
    for (var i = 0; i < 70; i++) {
      var a = rand(0, Math.PI * 2), sp = rand(2, 11) * scale;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(1, 4) * scale,
        life: rand(30, 60), max: 60, c: colors[(Math.random() * colors.length) | 0], w: rand(1.2, 3.2) * scale, kind: 0 });
    }
    // wood chips
    for (i = 0; i < 18; i++) {
      a = rand(0, Math.PI * 2); sp = rand(2, 7) * scale;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(3, 6) * scale,
        life: rand(40, 70), max: 70, c: Math.random() < .5 ? '#c9925a' : '#8a5a2a', w: rand(3, 6) * scale,
        rot: rand(0, 6), vr: rand(-.4, .4), kind: 1 });
    }
    // smoke puffs
    for (i = 0; i < 10; i++) {
      a = rand(0, Math.PI * 2); sp = rand(.3, 1.5) * scale;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - .6, life: rand(40, 70), max: 70,
        c: 'rgba(255,230,200,', w: rand(10, 20) * scale, kind: 2 });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function tick() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life--;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      var k = p.life / p.max;
      if (p.kind === 0) {
        p.vx *= .94; p.vy = p.vy * .94 + .28;
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = p.c; g.globalAlpha = Math.min(1, k * 1.5); g.lineWidth = p.w; g.lineCap = 'round';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); g.stroke();
      } else if (p.kind === 1) {
        p.vx *= .97; p.vy += .35; p.rot += p.vr;
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.min(1, k * 2);
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); g.restore();
      } else {
        p.vx *= .96; p.vy *= .96; p.w += .5;
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.fillStyle = p.c + (k * .22).toFixed(3) + ')';
        g.beginPath(); g.arc(p.x, p.y, p.w, 0, Math.PI * 2); g.fill();
      }
      p.x += p.vx; p.y += p.vy;
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (parts.length) requestAnimationFrame(tick); else { running = false; g.clearRect(0, 0, canvas.width, canvas.height); }
  }

  /* ---- 3D shatter inside the (tilted) board layer ----
   * pieceEl: the captured piece element (will be removed)
   * layer:   3D fx container (inside the board, preserve-3d)
   * x, y:    piece top-left in board pixels; ps: piece size in px
   */
  function shatter(pieceEl, layer, x, y, ps) {
    var side = pieceEl.classList.contains('r') ? 'r' : 'b';
    var face = pieceEl.querySelector('.face');
    var ch = pieceEl.textContent;
    pieceEl.remove();

    var N = 10, base = 'translate3d(' + x + 'px,' + y + 'px,0px)';
    var liftZ = ps * 1.3;
    var spinX = rand(-30, -15), spinY = rand(330, 390) * (Math.random() < .5 ? -1 : 1);
    var lift = 'translate3d(' + x + 'px,' + (y - ps * .5) + 'px,' + liftZ + 'px) rotateX(' + spinX + 'deg) rotateY(' + spinY + 'deg) scale(1.25)';

    for (var i = 0; i < N; i++) {
      var a0 = (i / N) * Math.PI * 2 + rand(-.1, .1), a1 = ((i + 1) / N) * Math.PI * 2 + rand(-.1, .1);
      var am = (a0 + a1) / 2, R = 80;
      var poly = 'polygon(50% 50%,' +
        (50 + Math.cos(a0) * R).toFixed(1) + '% ' + (50 + Math.sin(a0) * R).toFixed(1) + '%,' +
        (50 + Math.cos(am) * R * 1.1).toFixed(1) + '% ' + (50 + Math.sin(am) * R * 1.1).toFixed(1) + '%,' +
        (50 + Math.cos(a1) * R).toFixed(1) + '% ' + (50 + Math.sin(a1) * R).toFixed(1) + '%)';
      var s = document.createElement('div');
      s.className = 'piece shard ' + side;
      s.style.color = side === 'r' ? '#b3121a' : '#1a1612';
      var f = face.cloneNode(true);
      f.style.transform = 'none';
      s.appendChild(f);
      s.style.clipPath = s.style.webkitClipPath = poly;
      s.style.transform = base;
      layer.appendChild(s);

      var dist = ps * rand(1.8, 3.4);
      var dx = Math.cos(am) * dist, dy = Math.sin(am) * dist;
      var end = 'translate3d(' + (x + dx) + 'px,' + (y + dy + ps * .3) + 'px,' + (liftZ * rand(.2, 1.6)) + 'px) ' +
        'rotateX(' + (spinX + rand(-540, 540)) + 'deg) rotateY(' + (spinY + rand(-540, 540)) + 'deg) rotateZ(' + rand(-360, 360) + 'deg) scale(' + rand(.7, 1.1) + ')';
      var anim = s.animate([
        { transform: base, opacity: 1, offset: 0, easing: 'cubic-bezier(.2,.9,.3,1)' },
        { transform: lift, opacity: 1, offset: .3, easing: 'cubic-bezier(.1,.7,.3,1)' },
        { opacity: 1, offset: .72 },
        { transform: end, opacity: 0, offset: 1 }
      ], { duration: 1400 + rand(-100, 200), fill: 'forwards' });
      anim.onfinish = (function (el) { return function () { el.remove(); }; })(s);
    }

    // shockwave ring and flash, slightly above the board plane
    var cx = x + ps / 2, cy = y + ps / 2;
    var ring = document.createElement('div');
    ring.className = 'shock';
    ring.style.width = ring.style.height = ps + 'px';
    layer.appendChild(ring);
    ring.animate([
      { transform: 'translate3d(' + (cx - ps / 2) + 'px,' + (cy - ps / 2) + 'px,2px) scale(.2)', opacity: 0 },
      { transform: 'translate3d(' + (cx - ps / 2) + 'px,' + (cy - ps / 2) + 'px,2px) scale(.6)', opacity: 1, offset: .25 },
      { transform: 'translate3d(' + (cx - ps / 2) + 'px,' + (cy - ps / 2) + 'px,2px) scale(3.2)', opacity: 0 }
    ], { delay: 420, duration: 650, easing: 'ease-out', fill: 'both' }).onfinish = function () { ring.remove(); };

    var flash = document.createElement('div');
    flash.className = 'flash';
    var fs = ps * 3;
    flash.style.width = flash.style.height = fs + 'px';
    layer.appendChild(flash);
    flash.animate([
      { transform: 'translate3d(' + (cx - fs / 2) + 'px,' + (cy - fs / 2) + 'px,' + liftZ + 'px) scale(.2)', opacity: 0 },
      { transform: 'translate3d(' + (cx - fs / 2) + 'px,' + (cy - fs / 2) + 'px,' + liftZ + 'px) scale(1)', opacity: 1, offset: .3 },
      { transform: 'translate3d(' + (cx - fs / 2) + 'px,' + (cy - fs / 2) + 'px,' + liftZ + 'px) scale(1.3)', opacity: 0 }
    ], { delay: 400, duration: 500, easing: 'ease-out', fill: 'both' }).onfinish = function () { flash.remove(); };

    // the captured character rises as a glowing ghost
    var gh = document.createElement('div');
    gh.className = 'ghost-char';
    gh.textContent = ch;
    gh.style.width = gh.style.height = (ps * 2) + 'px';
    gh.style.fontSize = (ps * .8) + 'px';
    var gx = x - ps / 2, gy = y - ps / 2;
    layer.appendChild(gh);
    gh.animate([
      { transform: 'translate3d(' + gx + 'px,' + gy + 'px,' + liftZ + 'px) scale(.5)', opacity: 0 },
      { transform: 'translate3d(' + gx + 'px,' + (gy - ps * .6) + 'px,' + (liftZ * 1.6) + 'px) scale(1.5)', opacity: 1, offset: .35 },
      { transform: 'translate3d(' + gx + 'px,' + (gy - ps * 1.6) + 'px,' + (liftZ * 2.4) + 'px) scale(2)', opacity: 0 }
    ], { delay: 420, duration: 1100, easing: 'ease-out', fill: 'both' }).onfinish = function () { gh.remove(); };

    return 420; // ms until the burst moment
  }

  function shake(el, strength) {
    var s = strength || 6, kf = [];
    for (var i = 0; i < 8; i++) {
      var k = 1 - i / 8;
      kf.push({ transform: 'translate(' + (rand(-s, s) * k).toFixed(1) + 'px,' + (rand(-s, s) * k).toFixed(1) + 'px)' });
    }
    kf.push({ transform: 'none' });
    el.animate(kf, { duration: 380, easing: 'linear' });
  }

  return { sparks: sparks, shatter: shatter, shake: shake, initCanvas: initCanvas };
})();
