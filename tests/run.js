#!/usr/bin/env node
/*
 * Pruebas de seguridad y de funcionamiento de Mi biblioteca.
 * Sin dependencias: `node tests/run.js` desde la raíz del repositorio.
 *
 *  1. Secretos: ninguna clave privada ni de servicio en el repositorio.
 *  2. CSP: sin JavaScript en línea en las páginas; cabeceras de seguridad presentes.
 *  3. Integridad: la librería externa se carga con versión fija y huella SRI.
 *  4. Saneado: los datos hostiles (copias, nube) se limpian antes de usarse.
 *  5. XSS: se pinta cada pantalla con datos maliciosos (propios y de las APIs externas)
 *     y se comprueba que nada se interpreta como HTML o JavaScript.
 *  6. Sincronización: dos dispositivos con la misma cuenta, borrados y conflictos.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const section = (t) => console.log('\n' + t);

/* ------------------------------------------------------------------ 1. Secretos */
section('1. Secretos en el repositorio');
function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p)); else out.push(p);
  }
  return out;
}
const files = listFiles(ROOT).filter((f) => !/\.(png|jpg|jpeg|gif|webp|ico)$/i.test(f));
const leaks = [];
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  if (rel === 'tests/run.js') continue;
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(t)) leaks.push(rel + ': clave secreta de Supabase');
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) leaks.push(rel + ': clave privada');
  if (/(SUPABASE_SERVICE_ROLE|service_role_key)\s*[:=]/i.test(t)) leaks.push(rel + ': variable de service_role');
  if (/\bphx_[A-Za-z0-9]{20,}/.test(t)) leaks.push(rel + ': clave personal de PostHog');
  if (/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(t)) leaks.push(rel + ': token de GitHub');
  for (const m of t.matchAll(/eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try { const p = JSON.parse(Buffer.from(m[1], 'base64').toString()); if (p.role && p.role !== 'anon') leaks.push(rel + ': JWT con rol ' + p.role); } catch {}
  }
}
ok(leaks.length === 0, 'No hay claves privadas, de servicio ni tokens', leaks.join('; '));
ok(!fs.existsSync(path.join(ROOT, '.env')), 'No hay archivo .env en el repositorio');
const gi = fs.existsSync(path.join(ROOT, '.gitignore')) ? read('.gitignore') : '';
ok(/^\.env$/m.test(gi) && /biblioteca-\*\.json/.test(gi), '.gitignore excluye .env y copias de seguridad');
const app = read('app.js');
ok(/sb_publishable_/.test(app) && !/sb_secret_/.test(app), 'La app solo usa la clave pública (publishable) de Supabase');

/* ------------------------------------------------------------------ 2. CSP y cabeceras */
section('2. Política de seguridad de contenido (CSP) y cabeceras');
for (const page of ['index.html', 'privacidad.html']) {
  const h = read(page);
  const inline = [...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].filter((m) => m[1].trim());
  ok(inline.length === 0, `${page}: sin <script> en línea`);
  ok(!/\son[a-z]+\s*=/i.test(h.replace(/<script[\s\S]*?<\/script>/gi, '')), `${page}: sin manejadores on*="" en línea`);
}
ok(!/\son(error|load|click|mouseover|focus|input|change)=/i.test(app.replace(/addEventListener\(['"][a-z]+['"]/g, '')), 'app.js no genera manejadores on*="" en el HTML');
const hdr = read('_headers');
const csp = (hdr.match(/Content-Security-Policy:\s*(.+)/) || [])[1] || '';
const scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || '';
ok(csp.length > 0, 'Hay CSP');
ok(!/unsafe-inline|unsafe-eval|\*/.test(scriptSrc), "script-src sin 'unsafe-inline', 'unsafe-eval' ni comodines", scriptSrc);
ok(/frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp), 'CSP impide iframes, plugins y cambio de base');
for (const hname of ['Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy', 'Permissions-Policy'])
  ok(hdr.includes(hname), 'Cabecera ' + hname.split(':')[0]);

/* ------------------------------------------------------------------ 3. Integridad */
section('3. Integridad de la librería externa');
ok(/supabase-js@\d+\.\d+\.\d+\//.test(app), 'supabase-js con versión exacta');
ok(/SB_SRI='sha384-[A-Za-z0-9+/=]{64}'/.test(app) && /s\.integrity=SB_SRI/.test(app) && /crossOrigin='anonymous'/.test(app), 'supabase-js con huella de integridad (SRI)');

/* ------------------------------------------------------------------ entorno de pruebas */
function makeEnv(opts = {}) {
  const store = {}, written = [];
  const els = {};
  const mkEl = (sel) => {
    const st = { innerHTML: '', value: '', hidden: false, open: false, dataset: {}, textContent: '' };
    return new Proxy(function () {}, {
      get(t, k) {
        if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
        if (k === 'querySelectorAll') return () => [];
        if (k in st) return st[k];
        if (k === Symbol.toPrimitive) return () => '';
        return () => mkEl();
      },
      set(t, k, v) { st[k] = v; if (k === 'innerHTML' || k === 'textContent') written.push({ sel, html: String(v) }); return true; },
      apply() { return mkEl(); },
    });
  };
  const ctx = {
    console, setTimeout: (f) => { if (opts.runTimers) f(); return 0; }, clearTimeout() {}, setInterval() {}, Promise, JSON, Date, Math, Object, Array, String,
    Number, Boolean, Set, Map, RegExp, Error, URL, URLSearchParams, encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN, isFinite, Symbol, Buffer,
    document: { querySelector: (s) => els[s] || (els[s] = mkEl(s)), querySelectorAll: () => [], addEventListener() {}, documentElement: { dataset: {} },
      createElement: () => mkEl(), head: mkEl(), body: { classList: { add() {}, remove() {}, toggle() {} } }, visibilityState: 'visible' },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
    sessionStorage: { getItem() {}, setItem() {} },
    location: { protocol: opts.http ? 'https:' : 'file:', hostname: 'x', origin: 'https://x', pathname: '/', search: '', hash: '' },
    navigator: { onLine: true, storage: {}, userAgent: 'test', serviceWorker: undefined },
    history: { pushState() {}, replaceState() {}, back() {} }, matchMedia: () => ({ matches: false }), addEventListener() {}, confirm: () => true,
    fetch: opts.fetch || (async () => ({ ok: false, status: 404 })), innerWidth: 1200, crypto: require('crypto').webcrypto,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(app + `
;globalThis.__t={get books(){return books},set books(v){books=v},get cfg(){return cfg},set cfg(v){cfg=v},
 get route(){return route},set route(v){route=v},set q(v){q=v},set current(v){current=v},
 render,renderBook,save,load,cleanBook,cleanCfg,safeUrl,cloud,cloudSync,mergeBook,getMeta,go,runCat,authorInfo,workInfo,viewAuthor,viewWork,catTile,authorCard,
 get cat(){return cat},set cat(v){cat=v}};`, ctx, { filename: 'app.js' });
  return { t: ctx.__t, written, store, ctx };
}

/* ------------------------------------------------------------------ 4. Saneado */
section('4. Saneado de datos de entrada');
{
  const { t } = makeEnv();
  const hostile = JSON.parse('{"__proto__":{"polluted":1},"id":"<x>","title":"' + 'A'.repeat(5000) + '","status":"admin","rating":99,"pages":-5,"cover":"javascript:alert(1)","notes":[{"text":"ok"},{"text":5},null,"x"],"extra":"<script>","fav":"yes"}');
  const b = t.cleanBook(hostile);
  ok(({}).polluted === undefined && b.polluted === undefined, 'Sin contaminación del prototipo (__proto__)');
  ok(b.title.length === 300 && b.status === 'read' && b.rating === 5 && b.pages === '' && b.cover === '', 'Longitudes, estados, números y portada saneados');
  ok(/^[\w-]+$/.test(b.id), 'El id malicioso se sustituye');
  ok(!('extra' in b) && b.fav === undefined, 'Se descartan campos desconocidos y tipos incorrectos');
  ok(b.notes.length === 2 && b.notes.every((n) => typeof n.text === 'string'), 'Notas no válidas descartadas');
  ok(t.cleanBook({ title: '' }) === null && t.cleanBook('x') === null && t.cleanBook([1]) === null, 'Libros vacíos o con formato incorrecto se rechazan');
  ok(t.safeUrl('javascript:alert(1)') === '' && t.safeUrl('data:text/html,x') === '' && t.safeUrl('http://x.com/a.jpg') === '' && t.safeUrl('https://x.com/a.jpg') === 'https://x.com/a.jpg', 'Solo se aceptan URLs https');
  const c = t.cleanCfg({ name: 1, theme: 'evil', goals: { '2026': '12', hack: 5 }, lists: [{ name: '<b>x</b>', ids: ['a', 3] }], favs: [1, 'a'] });
  ok(c.theme === '' && c.goals['2026'] === 12 && !('hack' in c.goals) && c.lists[0].ids.length === 1 && c.favs.length === 1, 'Ajustes saneados');
}

/* ------------------------------------------------------------------ 5. XSS */
section('5. XSS: pantallas pintadas con datos maliciosos');
const P = [
  '<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "'><svg onload=alert(1)>", 'javascript:alert(1)',
  '<a href="javascript:alert(1)">x</a>', '${alert(1)}', '<iframe src=//evil>', ' <b onmouseover=alert(1)>x</b>',
];
const evil = (i) => P[i % P.length];
const badBooks = [];
for (let i = 0; i < 16; i++) badBooks.push({
  id: 'b' + i, title: evil(i) + ' título', author: evil(i + 1), genre: evil(i + 2), status: ['reading', 'read', 'want'][i % 3], pages: 300, current: 10,
  start: '2026-01-0' + (1 + (i % 9)), end: i % 3 === 1 ? '2026-02-0' + (1 + (i % 9)) : '', rating: i % 6, summary: evil(i + 3), liked: evil(i + 4),
  cover: i % 2 ? 'javascript:alert(1)' : 'https://x.com/a.jpg"onerror="alert(1)', fav: !!(i % 2), reread: !!(i % 3),
  notes: [{ id: 'n' + i, page: 1, text: evil(i + 5), quote: true }],
});
// APIs externas que devuelven datos maliciosos
const evilFetch = async (u) => {
  u = String(u);
  const J = (o) => ({ ok: true, json: async () => o });
  const doc = (i) => ({ key: '/works/OL' + i + 'W', title: evil(i), author_name: [evil(i + 1)], author_key: ['OL1A'], cover_i: 1, subject: [evil(i + 2), 'Fiction'], first_publish_year: evil(i + 3) });
  if (u.includes('search/authors.json')) return J({ docs: [{ key: 'OL1A"><script>', name: evil(0), work_count: 5, top_work: evil(1), birth_date: evil(2) }] });
  if (u.includes('/authors/')) return J({ bio: evil(3), photos: [1], remote_ids: { wikidata: 'Q1' } });
  if (u.includes('/works/')) return J({ description: { value: evil(4) }, subjects: [evil(5)], first_publish_date: evil(6) });
  if (u.includes('wbgetentities')) return J({ entities: { Q1: { sitelinks: { eswiki: { title: evil(7) } } } } });
  if (u.includes('page/summary')) return J({ type: 'standard', title: evil(0) + ' x', description: evil(1) + ' escritor', extract: evil(2) + ' novela escritor', content_urls: { desktop: { page: 'javascript:alert(1)' } }, thumbnail: { source: 'javascript:alert(1)' }, wikibase_item: 'Q1' });
  if (u.includes('list=search')) return J({ query: { search: [{ title: evil(3) }] } });
  if (u.includes('wbgetclaims')) return J({ claims: { P179: [{ mainsnak: { datavalue: { value: { id: 'Q9' } } } }] } });
  if (u.includes('query.wikidata.org')) return J({ results: { bindings: [{ i: { value: 'x/Q1' }, iLabel: { value: evil(4) }, o: { value: '1' }, sLabel: { value: evil(5) } }, { i: { value: 'x/Q2' }, iLabel: { value: evil(6) }, o: { value: '2' } }] } });
  if (u.includes('search.json')) return J({ docs: [0, 1, 2, 3, 4, 5].map(doc) });
  return { ok: false, status: 404 };
};
(async () => {
  const { t, written } = makeEnv({ fetch: evilFetch, runTimers: true });
  t.books = badBooks.map((b) => t.cleanBook(b));
  t.cfg = t.cleanCfg({ name: evil(0), lists: [{ id: 'L1', name: evil(1), ids: ['b1'] }], favs: [evil(2)], searches: [{ q: evil(3), author: evil(4) }], goals: { 2026: 10 } });
  const views = [['home'], ['lib'], ['list', 'want'], ['list', 'reread'], ['list', 'L1'], ['authors'], ['quotes'], ['discover'], ['profile']];
  for (const [v, id] of views) { t.route = { v, id }; t.render(true); }
  for (let i = 0; i < 6; i++) { t.current = 'b' + i; t.renderBook(); }
  t.q = evil(0); t.route = { v: 'lib' }; t.render();
  t.q = 'gabriel'; t.route = { v: 'search' }; t.runCat(); await new Promise((r) => setTimeout(r, 30)); t.render();
  await t.authorInfo(evil(0), '').catch(() => {});
  t.route = { v: 'author', name: evil(0), key: '' }; await new Promise((r) => setTimeout(r, 30)); t.render();
  t.route = { v: 'work', it: { title: evil(1), author: evil(2) } }; await new Promise((r) => setTimeout(r, 50)); t.render();
  t.cloud.user = { id: 'u', email: evil(3), user_metadata: { full_name: evil(4), avatar_url: 'javascript:alert(1)' } }; t.cloud.mfa = { on: false };
  t.route = { v: 'profile' }; t.render();
  const html = written.map((w) => w.html).join('\n');
  ok(written.length > 30 && html.length > 50000, `Se han pintado ${written.length} fragmentos de interfaz`);
  const checks = [
    [/<script/i, 'ninguna etiqueta <script> inyectada'],
    [/<img[^>]+src=x/i, 'ninguna <img src=x> inyectada'],
    [/<iframe/i, 'ningún <iframe> inyectado'],
    [/\son[a-z]+\s*=/i, 'ningún atributo on*= (onerror, onload, onmouseover…)'],
    [/(href|src)\s*=\s*["']?\s*javascript:/i, 'ningún enlace o imagen javascript:'],
    [/<svg[^>]*onload/i, 'ningún <svg onload>'],
    [/<b onmouseover/i, 'ninguna etiqueta del usuario interpretada'],
  ];
  // Solo cuentan las etiquetas HTML reales: el texto escapado (&lt;…&gt;) se muestra pero nunca se ejecuta
  // y dentro de una etiqueta, los valores entre comillas son datos (esc() impide salir de ellos)
  const rawTags = html.match(/<[a-zA-Z][^<>]*>/g) || [];
  const tags = rawTags.map((t) => t.replace(/"[^"]*"/g, '""')).join('\n');
  ok(rawTags.every((t) => (t.match(/"/g) || []).length % 2 === 0), 'Ningún valor de atributo rompe sus comillas');
  const urls = rawTags.map((t) => (t.match(/\b(?:href|src)="([^"]*)"/i) || [])[1]).filter(Boolean);
  ok(urls.every((u) => !/^\s*javascript:/i.test(u.replace(/&#\d+;|&\w+;/g, ''))), 'Ningún href/src con javascript:', urls.find((u) => /javascript:/i.test(u)));
  for (const [re, name] of checks) { const m = tags.match(re); ok(!m, name, m ? '…' + tags.slice(Math.max(0, m.index - 80), m.index + 80) + '…' : ''); }
  ok(html.includes('&lt;img src=x onerror=alert(1)&gt;') || html.includes('&lt;img'), 'Los textos maliciosos se muestran como texto escapado');

  /* ---------------------------------------------------------------- 6. Sincronización */
  section('6. Sincronización entre dos dispositivos');
  let clock = 0; const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString();
  const server = { books: new Map(), settings: new Map() };
  const fakeSb = (uid) => ({
    from: (table) => {
      const st = { f: [] };
      const api = {
        select() { return api; }, gt(c, v) { st.f.push((r) => r[c] > v); return api; }, order() { return api; },
        range(a, b) { const rows = [...server.books.values()].filter((r) => r.user_id === uid && st.f.every((f) => f(r))).sort((x, y) => (x.updated_at < y.updated_at ? -1 : 1)); return Promise.resolve({ data: JSON.parse(JSON.stringify(rows.slice(a, b + 1))), error: null }); },
        maybeSingle() { const r = server.settings.get(uid); return Promise.resolve({ data: r ? JSON.parse(JSON.stringify(r)) : null, error: null }); },
        upsert(rows) { for (const r of [].concat(rows)) { const row = { ...JSON.parse(JSON.stringify(r)), user_id: uid, updated_at: now() }; if (table === 'books') server.books.set(uid + '|' + r.id, row); else server.settings.set(uid, row); } return Promise.resolve({ error: null }); },
      };
      return api;
    },
    auth: { signOut: async () => {}, refreshSession: async () => {} },
  });
  const dev = () => { const e = makeEnv(); e.t.cloud.sb = fakeSb('U1'); e.t.cloud.user = { id: 'U1', email: 'a@b.c' }; return e.t; };
  const A = dev(), B = dev();
  A.books = [A.cleanBook({ id: 'x1', title: 'Dune', status: 'read' }), A.cleanBook({ id: 'x2', title: 'Patria', status: 'reading' })];
  A.cfg = { ...A.cfg, name: 'Ana', goals: { 2026: 12 }, theme: 'dark' }; A.save();
  await A.cloudSync(); await B.cloudSync();
  ok(B.books.length === 2 && B.cfg.name === 'Ana', 'Un dispositivo nuevo recibe libros y ajustes');
  ok(B.cfg.theme !== 'dark', 'El tema es de cada dispositivo (no se sincroniza)');
  B.books.push(B.cleanBook({ id: 'y1', title: 'Rayuela', status: 'want' })); B.books.find((b) => b.id === 'x1').rating = 5; B.save(); await B.cloudSync();
  A.books = A.books.filter((b) => b.id !== 'x2'); A.save(); await A.cloudSync(); await B.cloudSync();
  const titles = (d) => d.books.map((b) => b.title + (b.rating ? '★' + b.rating : '')).sort().join(',');
  ok(titles(A) === 'Dune★5,Rayuela' && titles(B) === titles(A), 'Altas, cambios y borrados llegan a los dos', titles(A) + ' | ' + titles(B));
  A.books.find((b) => b.id === 'x1').notes.push({ id: 'n1', text: 'nota de A' }); A.save();
  B.books.find((b) => b.id === 'x1').rating = 3; B.save();
  await A.cloudSync(); await B.cloudSync(); await A.cloudSync();
  const xa = A.books.find((b) => b.id === 'x1'), xb = B.books.find((b) => b.id === 'x1');
  ok(xa.rating === 3 && xa.notes.length === 1 && JSON.stringify(xa) === JSON.stringify(xb), 'Cambios simultáneos en el mismo libro se mezclan sin perder nada');
  // fila hostil en la nube
  server.books.set('U1|evil', { user_id: 'U1', id: 'evil', data: { title: '<img src=x onerror=alert(1)>', cover: 'javascript:alert(1)', status: 'x' }, deleted: false, updated_at: now() });
  await A.cloudSync();
  const ev = A.books.find((b) => b.id === 'evil');
  ok(ev && ev.cover === '' && ev.status === 'read', 'Lo que llega de la nube también se sanea');
  A.cloud.needMfa = true; const before = server.books.size; A.books.push(A.cleanBook({ id: 'z', title: 'Z' })); A.save(); await A.cloudSync();
  ok(server.books.size === before, 'Sin verificar la segunda capa (2FA) no se sincroniza nada');

  console.log(`\n${passed} correctas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
