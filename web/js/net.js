/* Online client: thin WebSocket wrapper with JSON messages. */
var Net = (function () {
  var ws = null, handlers = {}, url = null, pending = [];

  function emit(type, data) { (handlers[type] || []).forEach(function (fn) { fn(data); }); }

  function normalize(u) {
    u = (u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) u = u.replace(/^http/i, 'ws');
    if (!/^wss?:\/\//i.test(u)) u = 'ws://' + u;
    return u;
  }

  var api = {
    on: function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    isOpen: function () { return ws && ws.readyState === 1; },
    connect: function (u) {
      u = normalize(u);
      if (ws && url === u && (ws.readyState === 0 || ws.readyState === 1)) return;
      api.close();
      url = u;
      emit('status', { state: 'connecting' });
      try { ws = new WebSocket(u); } catch (e) { emit('status', { state: 'error', error: e.message }); return; }
      var sock = ws;
      ws.onopen = function () {
        emit('status', { state: 'open' });
        var q = pending; pending = [];
        q.forEach(function (m) { sock.send(m); });
      };
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        emit('msg', m); emit(m.t, m);
      };
      ws.onerror = function () { if (sock === ws) emit('status', { state: 'error' }); };
      ws.onclose = function () { if (sock === ws) { ws = null; pending = []; emit('status', { state: 'closed' }); } };
    },
    send: function (obj) {
      var s = JSON.stringify(obj);
      if (ws && ws.readyState === 1) ws.send(s);
      else if (ws && ws.readyState === 0) pending.push(s);
      else return false;
      return true;
    },
    close: function () {
      if (ws) { var w = ws; ws = null; try { w.close(); } catch (e) {} }
      pending = [];
    },
    normalize: normalize
  };
  return api;
})();
