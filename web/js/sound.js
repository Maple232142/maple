/* Synthesised sound effects (WebAudio) — no audio files needed. */
var Sound = (function () {
  var ctx = null, enabled = true, master = null;

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noise(dur) {
    var c = ctx, len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var s = c.createBufferSource(); s.buffer = buf; return s;
  }

  function tone(freq, start, dur, type, vol, endFreq) {
    var c = ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(master);
    o.start(start); o.stop(start + dur + 0.05);
  }

  function clack(t, vol, freq) {
    var n = noise(0.08), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = freq || 1800; f.Q.value = 3;
    g.gain.value = vol;
    n.connect(f); f.connect(g); g.connect(master);
    n.start(t);
    tone((freq || 1800) / 2.2, t, 0.07, 'triangle', vol * 0.6);
  }

  var api = {
    unlock: function () { if (enabled) ac(); },
    setEnabled: function (v) { enabled = v; },
    select: function () {
      if (!enabled || !ac()) return;
      tone(900, ctx.currentTime, 0.06, 'sine', 0.12, 1300);
    },
    move: function () {
      if (!enabled || !ac()) return;
      clack(ctx.currentTime, 0.9, 1600);
    },
    capture: function () {
      if (!enabled || !ac()) return;
      var t = ctx.currentTime;
      clack(t, 1.0, 1200);
      tone(140, t, 0.45, 'sine', 0.9, 40);         // boom
      var n = noise(0.5), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = 2500;
      g.gain.value = 0.35;
      n.connect(f); f.connect(g); g.connect(master); n.start(t + 0.02); // shatter
      for (var i = 0; i < 5; i++) tone(2500 + Math.random() * 3000, t + 0.04 + i * 0.035, 0.08, 'sine', 0.06);
    },
    check: function () {
      if (!enabled || !ac()) return;
      var t = ctx.currentTime;
      tone(220, t, 1.2, 'triangle', 0.4); tone(331, t, 1.0, 'sine', 0.25); tone(662, t + 0.02, 0.6, 'sine', 0.1);
      tone(220, t + 0.25, 1.2, 'triangle', 0.3);
    },
    win: function () {
      if (!enabled || !ac()) return;
      var t = ctx.currentTime, notes = [523, 659, 784, 1046];
      notes.forEach(function (f, i) { tone(f, t + i * 0.12, 0.5, 'triangle', 0.3); });
    },
    lose: function () {
      if (!enabled || !ac()) return;
      var t = ctx.currentTime, notes = [392, 330, 262, 196];
      notes.forEach(function (f, i) { tone(f, t + i * 0.16, 0.5, 'sine', 0.25); });
    },
    notify: function () {
      if (!enabled || !ac()) return;
      var t = ctx.currentTime; tone(880, t, 0.15, 'sine', 0.2); tone(1320, t + 0.1, 0.2, 'sine', 0.2);
    }
  };
  return api;
})();
