/* Aviso de errores a Sentry, sin librerías externas y sin datos personales.
   Solo se envía el error técnico (tipo, mensaje recortado y dónde ocurrió en el código),
   la versión de la app y el tipo de navegador. Nunca libros, notas, correos ni direcciones IP
   (Sentry tiene además desactivado el guardado de IP). Máximo 10 avisos por visita. */
(function(){
  'use strict';
  var DSN = 'https://8cfb73d986eabe5f7e084c32e4d5195f@o4512415348555776.ingest.de.sentry.io/4512415367430224';
  if (!DSN || !/^https:$/.test(location.protocol)) { window.informarError = function(){}; return; }
  var m = DSN.match(/^https:\/\/([0-9a-f]+)@([^/]+)\/(\d+)$/);
  if (!m) { window.informarError = function(){}; return; }
  var KEY = m[1], HOST = m[2], PROJECT = m[3];
  var URL_ENV = 'https://' + HOST + '/api/' + PROJECT + '/envelope/?sentry_key=' + KEY + '&sentry_version=7&sentry_client=mibiblioteca%2F1.0';
  var sent = 0, seen = {};

  function limpia(t, max){
    return String(t == null ? '' : t)
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]')
      .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1')
      .replace(/\b(eyJ[\w-]{10,}\.[\w-]+\.[\w-]+)\b/g, '[token]')
      .slice(0, max || 300);
  }
  function id(){ var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function frames(stack){
    var out = [];
    String(stack || '').split('\n').slice(0, 30).forEach(function(l){
      var f = l.match(/at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/) || l.match(/^(.*?)@(.+?):(\d+):(\d+)\s*$/);
      if (f) out.push({ function: limpia(f[1] || '?', 80), filename: limpia(f[2], 200), lineno: +f[3], colno: +f[4], in_app: f[2].indexOf(location.origin) === 0 });
    });
    return out.reverse(); /* Sentry quiere el más antiguo primero */
  }
  function propio(stack, file){
    var s = String(file || '') + '\n' + String(stack || '');
    return s.indexOf(location.origin) !== -1; /* ignora errores de extensiones del navegador */
  }
  function envia(tipo, mensaje, stack, extra){
    if (sent >= 10) return;
    var clave = tipo + '|' + mensaje + '|' + String(stack || '').split('\n')[1];
    if (seen[clave]) return; seen[clave] = 1; sent++;
    var version = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '?';
    var ev = {
      event_id: id(), timestamp: Date.now() / 1000, platform: 'javascript', level: 'error',
      release: 'mi-biblioteca@' + version, environment: 'produccion',
      exception: { values: [{ type: limpia(tipo, 80) || 'Error', value: limpia(mensaje), stacktrace: { frames: frames(stack) } }] },
      request: { url: location.origin + location.pathname, headers: { 'User-Agent': navigator.userAgent } },
      tags: { instalada: String(matchMedia('(display-mode: standalone)').matches), conexion: navigator.onLine ? 'si' : 'no', donde: limpia(extra || 'global', 60) },
      user: { ip_address: null }
    };
    var body = JSON.stringify({ event_id: ev.event_id, sent_at: new Date().toISOString() }) + '\n' + JSON.stringify({ type: 'event' }) + '\n' + JSON.stringify(ev);
    try { fetch(URL_ENV, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).catch(function(){}); } catch (e) {}
  }
  window.addEventListener('error', function(e){
    var err = e.error;
    if (!propio(err && err.stack, e.filename)) return;
    envia(err && err.name || 'Error', err && err.message || e.message, err && err.stack || (e.filename + ':' + e.lineno + ':' + e.colno));
  });
  window.addEventListener('unhandledrejection', function(e){
    var r = e.reason || {};
    if (r && r.stack && !propio(r.stack)) return;
    envia(r.name || 'PromesaRechazada', r.message || r, r.stack);
  });
  /* Para avisar a mano desde la app: informarError(error, 'sincronizar') */
  window.informarError = function(err, donde){ try { envia(err && err.name || 'Error', err && err.message || err, err && err.stack, donde); } catch (e) {} };
  window.__erroresTest = { limpia: limpia, frames: frames };
})();
