/* Mi biblioteca — lógica de la aplicación */
'use strict';
/*PURE-START*/
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const xmlUn=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&amp;/g,'&');

function parseDate(v){
  v=String(v??'').trim(); if(!v) return '';
  if(/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10);
  let m=v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if(m){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}
  if(/^(19|20)\d{2}$/.test(v)) return v;
  if(/^\d{5}(\.\d+)?$/.test(v)) return new Date(Math.round((+v-25569)*864e5)).toISOString().slice(0,10);
  return '';
}

function parseCSV(text){
  const first=text.split(/\r?\n/,1)[0];
  const cnt=c=>first.split(c).length-1;
  const d=cnt('\t')?'\t':(cnt(';')>cnt(',')?';':',');
  const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++} else q=false } else cur+=c }
    else if(c==='"') q=true;
    else if(c===d){row.push(cur);cur=''}
    else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur=''}
    else if(c!=='\r') cur+=c;
  }
  if(cur||row.length){row.push(cur);rows.push(row)}
  return rows;
}

function parseLines(text){
  const rows=[];
  for(let line of text.split(/\r?\n/)){
    line=line.replace(/^\s*(?:[-*•·]+|\d+[.)]|\[[ xX]?\])\s*/,'').trim();
    if(!line||/^#/.test(line)) continue;
    let m;
    if((m=line.match(/^(.+?)\s+[-–—|]\s+(.+)$/))) rows.push([m[1],m[2]]);
    else if((m=line.match(/^(.+?)\s*\(([^()]+)\)$/))&&!/^\d{4}$/.test(m[2].trim())) rows.push([m[1],m[2]]);
    else if((m=line.match(/^(.+?)\s*;\s*(.+)$/))) rows.push([m[1],m[2]]);
    else if((m=line.match(/^([^,]+),\s+([^,]+)$/))) rows.push([m[1],m[2]]);
    else rows.push([line]);
  }
  return rows;
}

const HEAD={
  title:['titulo','title','libro','nombre','obra'],
  author:['autor','author','autora','autores','autor/a','escritor'],
  genre:['genero','genre','categoria','tipo'],
  start:['inicio','empezado','start','comienzo'],
  end:['fin','terminado','leido','fecha','finalizado','end','final','fecha lectura','año','ano'],
  rating:['valoracion','nota','puntuacion','rating','estrellas'],
  pages:['paginas','pages','pag','pags','nº paginas','numero de paginas'],
  summary:['resumen','comentario','comentarios','opinion','notas','review','reseña','resena']
};
function headKey(h){
  h=norm(h).replace(/^fecha (de )?(?=\S)/,m=>/^fecha (de )?$/.test(m)?'':m);
  for(const k in HEAD) if(HEAD[k].includes(h)) return k;
  const h2=h.replace(/^fecha (de )?/,'');
  for(const k in HEAD) if(HEAD[k].includes(h2)) return k;
  return null;
}
function rowsToBooks(rows){
  rows=rows.map(r=>r.map(c=>String(c??'').trim())).filter(r=>r.some(c=>c));
  if(!rows.length) return [];
  let map=rows[0].map(headKey);
  if(map.includes('title')) rows=rows.slice(1);
  else{ map=['title','author']; const c2=rows.find(r=>r[2]); if(c2) map[2]=parseDate(c2[2])?'end':'genre' }
  const out=[];
  for(const r of rows){
    const b={};
    map.forEach((k,i)=>{ if(k&&r[i]&&!b[k]) b[k]=r[i] });
    if(!b.title) continue;
    if(b.start) b.start=parseDate(b.start);
    if(b.end) b.end=parseDate(b.end);
    if(b.pages) b.pages=parseInt(b.pages)||'';
    if(b.rating){let n=parseFloat(String(b.rating).replace(',','.'));if(n>5)n=n/2;b.rating=isNaN(n)?0:Math.max(0,Math.min(5,Math.round(n)))}
    out.push(b);
  }
  return out;
}

async function unzip(buf){
  const dv=new DataView(buf),u8=new Uint8Array(buf),td=new TextDecoder();
  let e=buf.byteLength-22;
  while(e>=0&&dv.getUint32(e,true)!==0x06054b50) e--;
  if(e<0) throw new Error('No es un archivo .xlsx válido');
  const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const files={};
  for(let i=0;i<n;i++){
    const nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true);
    files[td.decode(u8.subarray(p+46,p+46+nl))]={method:dv.getUint16(p+10,true),size:dv.getUint32(p+20,true),off:dv.getUint32(p+42,true)};
    p+=46+nl+el+cl;
  }
  return {names:Object.keys(files),async text(name){
    const f=files[name]; if(!f) return '';
    const s=f.off+30+dv.getUint16(f.off+26,true)+dv.getUint16(f.off+28,true);
    const data=u8.subarray(s,s+f.size);
    if(f.method===0) return td.decode(data);
    return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }};
}
async function xlsxRows(buf){
  const z=await unzip(buf);
  const ss=[];const sx=await z.text('xl/sharedStrings.xml');
  const tx=s=>[...s.replace(/<rPh[\s\S]*?<\/rPh>/g,'').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m=>xmlUn(m[1])).join('');
  for(const m of sx.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) ss.push(tx(m[1]||''));
  const sheet=z.names.filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a,b)=>parseInt(a.match(/\d+/))-parseInt(b.match(/\d+/)))[0];
  if(!sheet) throw new Error('El Excel no tiene hojas');
  const xml=await z.text(sheet);const rows=[];
  for(const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
    const row=[];
    for(const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const ref=(cm[1].match(/\br="([A-Z]+)\d+"/)||[])[1];
      const t=(cm[1].match(/\bt="(\w+)"/)||[])[1];
      let col=row.length;
      if(ref){col=0;for(const ch of ref) col=col*26+ch.charCodeAt(0)-64;col--}
      const inner=cm[2]||'';const v=(inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)||[])[1];
      let val='';
      if(t==='s') val=ss[+v]||'';
      else if(t==='inlineStr') val=tx(inner);
      else if(v!=null) val=xmlUn(v);
      row[col]=val;
    }
    rows.push(Array.from(row,c=>c??''));
  }
  return rows;
}
/*PURE-END*/

const APP_VERSION='35';let swReg=null,checking=false;
const KEY='biblioteca.v1';
const GENRES=['Novela','Ficción','Fantasía','Ciencia ficción','Misterio','Thriller','Romance','Histórica','Terror','Clásicos','Juvenil','Poesía','Teatro','Cómic','Ensayo','Historia','Biografía','Filosofía','Ciencia','Psicología','Economía','Autoayuda','Tecnología','Viajes'];
const GMAP=[['science fiction','Ciencia ficción'],['ciencia ficcion','Ciencia ficción'],['fantasy','Fantasía'],['fantasia','Fantasía'],['mystery','Misterio'],['detective','Misterio'],['misterio','Misterio'],['thriller','Thriller'],['suspense','Thriller'],['horror','Terror'],['terror','Terror'],['romance','Romance'],['love stories','Romance'],['historical fiction','Histórica'],['novela historica','Histórica'],['poetry','Poesía'],['poesia','Poesía'],['drama','Teatro'],['comics','Cómic'],['graphic novels','Cómic'],['biography','Biografía'],['biografia','Biografía'],['autobiography','Biografía'],['philosophy','Filosofía'],['filosofia','Filosofía'],['psychology','Psicología'],['self-help','Autoayuda'],['economics','Economía'],['business','Economía'],['computers','Tecnología'],['programming','Tecnología'],['science','Ciencia'],['history','Historia'],['historia','Historia'],['travel','Viajes'],['essays','Ensayo'],['juvenile','Juvenil'],['young adult','Juvenil'],['classic','Clásicos'],['novela','Novela'],['fiction','Ficción'],['ficcion','Ficción']];
const GREV={'Fantasía':'fantasy','Ciencia ficción':'science fiction','Misterio':'mystery','Thriller':'thriller','Terror':'horror','Romance':'romance','Histórica':'historical fiction','Poesía':'poetry','Teatro':'drama','Cómic':'graphic novels','Biografía':'biography','Filosofía':'philosophy','Psicología':'psychology','Autoayuda':'self-help','Economía':'economics','Tecnología':'computers','Ciencia':'science','Historia':'history','Viajes':'travel','Ensayo':'essays','Juvenil':'young adult','Clásicos':'classic literature','Novela':'fiction','Ficción':'fiction'};
const NAV=[['home','🏠','Inicio'],['lib','📚','Biblioteca'],['authors','✍️','Autores'],['quotes','❝','Citas'],['discover','✨','Descubrir'],['friends','🤝','Amigos'],['profile','👤','Perfil']];
const MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESL=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const TRASH='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>';
const emptyF=()=>({genre:'',author:'',rating:0,year:'',from:'',to:''});
let fOpen=false,SF={from:'',genre:'',author:'',st:''};
let books=[],cfg={name:'',theme:'',goals:{},favs:[],lists:[],searches:[]};
let cat={q:'',state:'idle',items:[],authors:[]},catT,catSeq=0,prevRoute={v:'home'};
const ONLINE=['home','discover','search','author','work'];
let route={v:'home'},q='',sort='recent',status='all',F=emptyF(),statYear=null,authorTab='all';
let current=null,editing=null,finRating=0,editNote=null,impBooks=[],listEdit=null,toastFn=null;
let sug={key:null,state:'idle',groups:[]};
const $=s=>document.querySelector(s);
const track=(ev,props)=>{try{if(window.__phOn)window.posthog?.capture?.(ev,props)}catch{}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const curYear=()=>String(new Date().getFullYear());
const get=id=>books.find(b=>b.id===id);
const hash=s=>{let h=0;for(const c of String(s)) h=(h*31+c.charCodeAt(0))>>>0;return h};
const pl=(n,s,p)=>`${n} ${n===1?s:(p||s+'s')}`;
function fmt(d){ if(!d) return ''; if(d.length===4) return d; const [y,m,dd]=d.split('-'); return `${+dd} ${MES[+m-1]} ${y}` }
function days(b){ if(b.start?.length===10&&b.end?.length===10){const d=Math.round((new Date(b.end)-new Date(b.start))/864e5)+1;return d>0?d:0} return 0 }
const rk=b=>b.end||b.start||'';
const SORTS={
  recent:(a,b)=>rk(b).localeCompare(rk(a))||(b.added||0)-(a.added||0),
  oldest:(a,b)=>(rk(a)||'9999').localeCompare(rk(b)||'9999'),
  title:(a,b)=>a.title.localeCompare(b.title,'es'),
  author:(a,b)=>(a.author||'zzz').localeCompare(b.author||'zzz','es')||a.title.localeCompare(b.title,'es'),
  rating:(a,b)=>(b.rating||0)-(a.rating||0)||a.title.localeCompare(b.title,'es')
};

/* ---------- Saneado: todo lo que entra (copias, nube, catálogo) pasa por aquí ---------- */
const S=(v,n)=>typeof v==='string'?v.slice(0,n):(typeof v==='number'&&isFinite(v)?String(v).slice(0,n):'');
const NUM=(v,max)=>{const x=parseInt(v,10);return Number.isFinite(x)&&x>0?Math.min(x,max):0};
const DATE=v=>typeof v==='string'&&/^\d{4}(-\d{2}-\d{2})?$/.test(v)?v:'';
const ID=v=>{const s=S(v,64);return /^[\w-]{1,64}$/.test(s)?s:''};
function safeUrl(u){ if(typeof u!=='string'||!u)return ''; try{const x=new URL(u);return x.protocol==='https:'?x.href:''}catch{return ''} }
function safeImg(u){ if(typeof u==='string'&&/^data:image\/(svg\+xml|png|jpeg|gif|webp)[;,]/i.test(u)&&u.length<200000)return u; return safeUrl(u) }
function cleanBook(b){
  if(!b||typeof b!=='object'||Array.isArray(b))return null;
  const title=S(b.title,300).trim(); if(!title)return null;
  const o={id:ID(b.id)||uid(),added:NUM(b.added,9e15)||Date.now(),title,author:S(b.author,200).trim(),genre:S(b.genre,60).trim(),
    pages:NUM(b.pages,100000)||'',cover:safeUrl(b.cover),status:['reading','read','want'].includes(b.status)?b.status:'read',
    start:DATE(b.start),end:DATE(b.end),rating:Math.min(5,NUM(b.rating,5)),summary:S(b.summary,20000),liked:S(b.liked,20000),
    notes:(Array.isArray(b.notes)?b.notes:[]).slice(0,5000).map(n=>n&&typeof n==='object'?{id:ID(n.id)||uid(),page:NUM(n.page,100000)||null,text:S(n.text,10000),quote:!!n.quote,date:DATE(n.date)}:null).filter(n=>n&&n.text.trim())};
  if(NUM(b.current,100000))o.current=NUM(b.current,100000);
  if(b.fav===true)o.fav=true; if(b.reread===true)o.reread=true;
  return o;
}
function cleanCfg(c){
  c=c&&typeof c==='object'&&!Array.isArray(c)?c:{};
  const goals={};if(c.goals&&typeof c.goals==='object')for(const [y,v] of Object.entries(c.goals))if(/^\d{4}$/.test(y))goals[y]=Math.min(999,NUM(v,999));
  const strs=(a,n,m)=>(Array.isArray(a)?a:[]).filter(x=>typeof x==='string').slice(0,n).map(x=>x.slice(0,m));
  return {shareProg:c.shareProg!==false,name:S(c.name,40),theme:['light','dark'].includes(c.theme)?c.theme:'',goals,favs:strs(c.favs,1000,200),
    lists:(Array.isArray(c.lists)?c.lists:[]).slice(0,200).map(l=>l&&typeof l==='object'?{id:ID(l.id)||uid(),name:S(l.name,40).trim()||'Lista',ids:strs(l.ids,20000,64)}:null).filter(Boolean),
    searches:(Array.isArray(c.searches)?c.searches:[]).slice(0,6).map(s=>s&&typeof s==='object'?{q:S(s.q,100),title:S(s.title,300),author:S(s.author,200),genre:S(s.genre,60)}:null).filter(x=>x&&x.q)};
}
const cleanBooks=a=>{const seen=new Set();return (Array.isArray(a)?a:[]).map(cleanBook).filter(b=>b&&!seen.has(b.id)&&seen.add(b.id)).slice(0,20000)};

/* ---------- Datos ---------- */
function load(){
  try{books=JSON.parse(localStorage.getItem(KEY))||[]}catch{books=[]}
  books=cleanBooks(books);
  let c=null; try{c=JSON.parse(localStorage.getItem(KEY+'.cfg'))}catch{}
  if(!c){ c={}; try{c.favs=JSON.parse(localStorage.getItem(KEY+'.favs'))||[]}catch{} try{c.goals=JSON.parse(localStorage.getItem(KEY+'.goals'))||{}}catch{} }
  cfg=cleanCfg(c);
}
function save(){ try{localStorage.setItem(KEY,JSON.stringify(books));localStorage.setItem(KEY+'.cfg',JSON.stringify(cfg))}catch{toast('No se han podido guardar los cambios')} try{cloudDirty()}catch{} }
function applyTheme(){ const t=cfg.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'); document.documentElement.dataset.theme=t; return t }
function listBooks(id){ if(id==='want') return books.filter(b=>b.status==='want'); if(id==='reread') return books.filter(b=>b.reread); const l=cfg.lists.find(l=>l.id===id); return l?l.ids.map(get).filter(Boolean):[] }
function listName(id){ return id==='want'?'Próximas lecturas':id==='reread'?'Para releer':(cfg.lists.find(l=>l.id===id)?.name||'Lista') }

/* ---------- Utilidades de interfaz ---------- */
let tt;
function toast(m,o){const t=$('#toast');toastFn=o?.fn||null;t.innerHTML=`<span>${esc(m)}</span>${o?.label?`<button data-act="toastAct">${esc(o.label)}</button>`:''}`;t.classList.add('on');clearTimeout(tt);if(!o?.keep)tt=setTimeout(()=>t.classList.remove('on'),o?.fn?6000:2800)}
const stars=n=>n?'★'.repeat(n)+'☆'.repeat(5-n):'';
function cover(b){return `<div class="cover" style="--h:${hash(b.title)%360}"><span class="ct">${esc(b.title)}</span><span class="ca">${esc(b.author||'')}</span>${safeUrl(b.cover)?`<img src="${esc(safeUrl(b.cover))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-rm>`:''}</div>`}
function tile(b,i=0,extra=''){return `<div class="tile" data-open="${b.id}" style="--i:${Math.min(i,24)}"><div class="cvw">${cover(b)}${b.fav?'<span class="favbadge">♥</span>':''}<div class="tact">${extra}<button class="ib heart ${b.fav?'on':''}" data-act="favBook" data-id="${b.id}" title="${b.fav?'Quitar de favoritos':'Añadir a favoritos'}">♥</button><button class="ib" data-act="delBook" data-id="${b.id}" title="Eliminar libro">${TRASH}</button></div></div>
  <div class="t">${esc(b.title)}</div><div class="a">${esc(b.author||'')}</div>
  ${b.status==='want'?'<div class="tag">Próxima lectura</div>':b.status==='reading'?'<div class="tag">Leyendo</div>':`<div class="stars">${stars(b.rating)}</div>`}${b.reread?'<div class="tag">↻ Para releer</div>':''}</div>`}
function go(v,id,extra){ track('seccion',{seccion:v}); if(isDetail(v)){hist.push(route);try{history.pushState({d:1},'')}catch{}} else hist=[]; route={v,id,...(extra||{})}; render(true); $('#main').scrollTop=0 }
function inDates(b){ if(!F.from&&!F.to&&!F.year) return true; const d=rk(b); if(!d) return false;
  if(F.year&&d.slice(0,4)!==F.year) return false;
  if(d.length===4) return (!F.from||d>=F.from.slice(0,4))&&(!F.to||d<=F.to.slice(0,4));
  return (!F.from||d>=F.from)&&(!F.to||d<=F.to) }
function filt(list,useStatus){
  const nq=norm(q);
  return list.filter(b=>(!useStatus||status==='all'||(status==='fav'?b.fav:b.status===status))
    &&(!nq||norm([b.title,b.author,b.genre,b.summary,b.liked,...b.notes.map(n=>n.text)].join(' ')).includes(nq))
    &&(!F.genre||b.genre===F.genre)&&(!F.author||norm(b.author)===F.author)
    &&(F.rating>0?(b.rating||0)>=F.rating:F.rating<0?!b.rating:true)&&inDates(b)).sort(SORTS[sort]);
}
function authorsData(){
  const am=new Map();
  for(const b of books){ if(!b.author) continue; const k=norm(b.author),a=am.get(k)||{name:b.author,k,n:0,read:0,sum:0,rated:0};a.n++;if(b.status==='read')a.read++;if(b.rating){a.sum+=b.rating;a.rated++}am.set(k,a) }
  return [...am.values()].sort((a,b)=>cfg.favs.includes(b.k)-cfg.favs.includes(a.k)||b.n-a.n||a.name.localeCompare(b.name,'es'));
}
function filterBar(withStatus){
  const sel=(k,opts,all,label)=>`<label class="fl ${F[k]?'act':''}"><span>${label}</span><select data-f="${k}"><option value="">${all}</option>${opts.map(([v,t])=>`<option value="${esc(v)}" ${String(F[k])===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
  const genres=[...new Set(books.map(b=>b.genre).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')).map(g=>[g,g]);
  const auths=authorsData().sort((a,b)=>a.name.localeCompare(b.name,'es')).map(a=>[a.k,a.name]);
  const years=[...new Set(books.map(b=>rk(b).slice(0,4)).filter(Boolean))].sort().reverse().map(y=>[y,y]);
  const any=Object.values(F).some(Boolean)||q;
  return fWrap(Object.values(F).filter(Boolean).length,withStatus?`<div class="chips">${[['all','Todos'],['reading','Leyendo'],['read','Leídos'],['want','Próximas'],['fav','♥ Favoritos']].map(([s,t])=>`<button class="chip ${status===s?'on':''}" data-act="status" data-s="${s}">${t}</button>`).join('')}</div>`:'',`<div class="fbar">${withStatus?`<div class="chips">${[['all','Todos'],['reading','Leyendo'],['read','Leídos'],['want','Próximas'],['fav','♥ Favoritos']].map(([s,t])=>`<button class="chip ${status===s?'on':''}" data-act="status" data-s="${s}">${t}</button>`).join('')}</div>`:''}
    ${sel('genre',genres,'Todos','Género')}${sel('author',auths,'Todos','Autor')}
    ${sel('rating',[[5,'★★★★★'],[4,'★★★★ o más'],[3,'★★★ o más'],[2,'★★ o más'],[-1,'Sin valorar']],'Cualquiera','Valoración')}
    ${sel('year',years,'Todos','Año')}
    <label class="fl ${F.from?'act':''}"><span>Desde</span><input type="date" data-f="from" value="${F.from}"></label>
    <label class="fl ${F.to?'act':''}"><span>Hasta</span><input type="date" data-f="to" value="${F.to}"></label>
    <label class="fl"><span>Orden</span><select id="sort">${[['recent','Más recientes'],['oldest','Más antiguos'],['title','Título'],['author','Autor'],['rating','Valoración']].map(([v,t])=>`<option value="${v}" ${sort===v?'selected':''}>${t}</option>`).join('')}</select></label>
    ${any?'<button class="btn small ghost" data-act="clearF">✕ Limpiar</button>':''}</div>`);
}
/* En el móvil los filtros se pliegan tras un botón «Filtros» (las pestañas de estado siguen a la vista) */
function fWrap(n,tabs,bar){
  return `<div class="fwrap ${fOpen?'open':''}"><div class="ftop">${tabs?`<div class="ftabs monly">${tabs}</div>`:''}<button class="ftog monly ${n?'act':''}" data-act="ftog">⚙️ Filtros${n?` <b>${n}</b>`:''} <span>${fOpen?'▴':'▾'}</span></button></div>${bar}</div>`;
}
const emptyBox=(icon,title,text,btns='')=>`<div class="empty"><div class="big">${icon}</div><h2>${title}</h2><div>${text}</div>${btns}</div>`;

/* ---------- Vistas ---------- */
function goalCard(edit){
  const yr=curYear(),n=books.filter(b=>b.status==='read'&&(b.end||'').startsWith(yr)).length,g=+cfg.goals[yr]||0;
  const pct=g?Math.min(100,Math.round(n/g*100)):0,C=2*Math.PI*48;
  const ring=`<div class="ring"><svg width="118" height="118"><circle cx="59" cy="59" r="48"/><circle class="p" cx="59" cy="59" r="48" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct/100)}"/></svg><div>${g?pct+'%':'🎯'}</div></div>`;
  const msg=!g?'Aún no tienes un reto para este año.':n>=g?'¡Reto conseguido! 🎉':`Te ${g-n===1?'falta 1 libro':`faltan ${g-n} libros`}. ¡Vas bien!`;
  if(!edit) return `<div class="card goalc">${ring}<div style="flex:1"><h3>Reto ${yr}</h3>
    <p class="goalbig">${g?`<b>${n}</b> de ${g} libros`:`<b>${n}</b> ${n===1?'libro leído':'libros leídos'}`}</p>
    <span class="muted" style="font-size:14px">${msg}</span><div><a class="goallink" data-nav="profile">${g?'Cambiar objetivo':'Ponerme un reto'} →</a></div></div></div>`;
  return `<div class="card goalc">${ring}<div style="flex:1"><h3>Reto ${yr}</h3><p class="muted" style="margin:4px 0 12px;font-size:14px">${n} ${n===1?'libro leído':'libros leídos'} este año · ${msg}</p>
    <div class="stepper"><button data-act="goalStep" data-d="-1" aria-label="Uno menos" ${g<=0?'disabled':''}>−</button><span class="sv">${g||'—'}</span><button data-act="goalStep" data-d="1" aria-label="Uno más">+</button><span class="muted" style="font-size:14px">libros</span></div>
    <div class="presets">${[6,12,24,36,52].map(v=>`<button class="chip ${g===v?'on':''}" data-act="goalSet" data-v="${v}">${v}</button>`).join('')}${g?'<button class="chip dash" data-act="goalSet" data-v="0">Quitar reto</button>':''}</div></div></div>`;
}
function readingCard(b){
  const pct=b.pages&&b.current?Math.min(100,Math.round(b.current/b.pages*100)):0;
  return `<article class="card rcard" data-open="${b.id}">${cover(b)}<div class="info">
    <h3>${esc(b.title)}</h3><div class="muted">${esc(b.author||'')}</div>
    <div class="prog">Pág. <input type="number" min="0" ${b.pages?`max="${b.pages}"`:''} data-cur="${b.id}" value="${b.current||''}" placeholder="0">${b.pages?`<span>de ${b.pages}</span><div class="bar"><i style="width:${pct}%"></i></div><b>${pct}%</b>`:''}</div>
    <div class="muted" style="font-size:13px;margin-top:8px">${b.start?'Desde el '+fmt(b.start)+' · ':''}${pl(b.notes.length,'nota')}</div>
    <div class="acts"><button class="btn small" data-act="note" data-id="${b.id}">＋ Nota</button><button class="btn small primary" data-act="finish" data-id="${b.id}">Finalizar lectura</button></div>
  </div></article>`;
}
function signupCard(){
  if(cloud.user||!location.protocol.startsWith('http'))return '';
  let until=0;try{until=+localStorage.getItem('biblioteca.signupHide')||0}catch{}
  if(Date.now()<until)return '';
  return `<div class="card signup"><div class="si">☁️</div><div style="flex:1;min-width:220px"><b>Crea tu cuenta gratis</b><div class="muted" style="font-size:14px;margin-top:2px">Tus libros se guardarán en la nube y se sincronizarán solos entre el móvil y el ordenador. Si cambias de móvil, no perderás nada.</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small ghost" data-act="signupLater">Ahora no</button><button class="btn small primary" data-act="login">Crear cuenta</button></div></div>`;
}
/* Recordatorio de copia de seguridad: si hay libros y hace más de 30 días de la última copia (por dispositivo) */
function backupCard(){
  if(books.length<5||signupCard())return '';
  let last=0,until=0;try{last=+localStorage.getItem('biblioteca.lastBackup')||0;until=+localStorage.getItem('biblioteca.backupHide')||0}catch{}
  if(!last){try{localStorage.setItem('biblioteca.lastBackup',String(Date.now()));}catch{}return ''}
  if(Date.now()-last<30*864e5||Date.now()<until)return '';
  return `<div class="card signup"><div class="si">💾</div><div style="flex:1;min-width:220px"><b>Guarda una copia de tu biblioteca</b><div class="muted" style="font-size:14px;margin-top:2px">Hace más de un mes que no descargas una copia en este dispositivo. Tarda un segundo y te protege si algo falla.</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small ghost" data-act="backupLater">Más tarde</button><button class="btn small primary" data-act="export">Guardar copia</button></div></div>`;
}
/* Aviso en Inicio cuando alguien te ha enviado una solicitud de amistad */
function friendReqCard(){
  if(!cloud.user||!soc.incoming.length)return '';
  const r=soc.incoming[0],more=soc.incoming.length-1;
  return `<div class="card signup">${avatar(r.name||r.email,'')}<div style="flex:1;min-width:200px"><b>${esc(r.name||r.email)} quiere ser tu amigo</b><div class="muted" style="font-size:14px;margin-top:2px">${esc(r.email)}${more?` · y ${pl(more,'solicitud más','solicitudes más')}`:''}. Si aceptas, podréis sugeriros libros.</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${more?'<button class="btn small ghost" data-nav="friends">Ver todas</button>':''}<button class="btn small ghost" data-act="friendNo" data-id="${r.id}">Rechazar</button><button class="btn small primary" data-act="friendYes" data-id="${r.id}">Aceptar</button></div></div>`;
}
function viewHome(){
  const h=new Date().getHours(),hi=h<6?'Buenas noches':h<13?'Buenos días':h<21?'Buenas tardes':'Buenas noches';
  const yr=curYear(),read=books.filter(b=>b.status==='read'),ry=read.filter(b=>(b.end||'').startsWith(yr));
  const reading=books.filter(b=>b.status==='reading').sort((a,b)=>(b.start||'').localeCompare(a.start||''));
  const want=listBooks('want'),last=[...read].sort(SORTS.recent).slice(0,14);
  const nq=books.reduce((s,b)=>s+b.notes.filter(n=>n.quote).length,0);
  loadSug();
  const sgRow=(kind,msg)=>{const sg=sug.groups.flatMap((g,gi)=>g.kind===kind?g.items.map((it,ii)=>({it,gi,ii})):[]).slice(0,14);
    return sg.length?`<div class="hrow">${sg.map(({it,gi,ii},i)=>sugTile(it,gi,ii,i)).join('')}</div>`:`<div class="dashed">${msg}</div>`};
  const row=(title,link,html)=>`<div class="sec"><div class="sech"><h2>${title}</h2>${link}</div>${html}</div>`;
  return `${friendReqCard()}${sentNewsCard()}${signupCard()}${backupCard()}<div class="hero"><div class="hello"><h1>${hi}${cfg.name?', '+esc(cfg.name):''} 👋</h1>
      <p>${reading.length?`Tienes ${pl(reading.length,'lectura')} en marcha.`:'¿Qué vas a leer hoy?'}</p>
      <div class="hk"><div><b>${ry.length}</b><span>leídos en ${yr}</span></div><div><b>${ry.reduce((s,b)=>s+(+b.pages||0),0).toLocaleString('es-ES')}</b><span>páginas este año</span></div><div><b>${read.length}</b><span>leídos en total</span></div><div><b>${nq}</b><span>citas guardadas</span></div></div></div>
    ${goalCard()}</div>
    ${row('Leyendo ahora','',reading.length?`<div class="reading">${reading.map(readingCard).join('')}</div>`:'<div class="dashed">No estás leyendo nada ahora mismo.<br><button class="btn primary" data-act="add">＋ Empezar a leer</button><button class="btn" data-act="random">🎲 ¿Qué leo ahora?</button></div>')}
    ${row('Próximas lecturas','<a data-nav="list" data-id="want">Ver todas →</a>',want.length?`<div class="hrow">${want.slice(0,14).map((b,i)=>tile(b,i)).join('')}</div>`:'<div class="dashed">Apunta aquí los libros que quieres leer.<br><button class="btn" data-act="addWant">＋ Añadir a próximas lecturas</button></div>')}
    ${row('Últimos leídos','<a data-nav="lib">Ver biblioteca →</a>',last.length?`<div class="hrow">${last.map((b,i)=>tile(b,i)).join('')}</div>`:'<div class="dashed">Cuando termines un libro aparecerá aquí.<br><button class="btn" data-act="import">Importar los que ya he leído</button></div>')}
    ${row('Sugerencias por tus búsquedas','<a data-nav="discover">Ver más →</a>',sgRow('search',sugMsg('search')))}
    ${row('Sugerencias por tus últimas lecturas','<a data-nav="discover">Ver más →</a>',sgRow('read',sugMsg('read')))}`;
}
function sugMsg(kind){return sug.state==='loading'?'Buscando libros que te puedan gustar…':sug.state==='error'?'No se han podido cargar las sugerencias (hace falta conexión a internet).':kind==='search'&&(cfg.searches||[]).length?'No he encontrado libros nuevos para tus búsquedas recientes. Prueba a buscar otro autor o libro.':kind==='search'?'Busca cualquier libro desde el buscador de arriba y aquí te propondré otros parecidos a lo que buscas.':'Añade algunos libros con autor o género y aquí aparecerán recomendaciones basadas en tus últimas lecturas.'}
function catTile(it,i=0){const w=regW(it),own=inLib(it);return `<div class="tile ${it.here?'here':''}" data-work="${w}" style="--i:${Math.min(i,24)}"><div class="cvw">${cover(it)}${(it.langs||[]).length&&!it.langs.includes('spa')&&it.langs.includes('eng')?'<span class="lbadge" title="Solo en inglés">EN</span>':''}${own?'':`<div class="tact"><button class="ib add" data-act="addW" data-w="${w}" data-s="want" title="Añadir a próximas lecturas">＋</button></div>`}</div>
  <div class="t">${esc(it.title)}</div><div class="a">${esc([it.author,it.year].filter(Boolean).join(' · '))}</div>${it.here?'<div class="tag">Este libro</div>':own?'<div class="tag">✓ En tu biblioteca</div>':`<button class="btn small" style="margin-top:8px" data-act="addW" data-w="${w}" data-s="want">＋ Quiero leerlo</button>`}</div>`}
const sugTile=(it,gi,ii,i)=>catTile(it,i);
function viewDiscover(){
  loadSug();
  const part=(kind,title)=>{const gs=sug.groups.filter(g=>g.kind===kind&&g.items.length);
    return `<div class="sec" style="margin-top:30px"><div class="sech"><h2 style="font-size:26px">${title}</h2></div>${gs.length?gs.map(g=>{const gi=sug.groups.indexOf(g);return `<h3 class="muted" style="font-size:16px;font-weight:500;margin:18px 0 10px">${esc(g.title)}</h3><div class="hrow">${g.items.map((it,ii)=>sugTile(it,gi,ii,ii)).join('')}</div>`}).join(''):`<div class="dashed">${sugMsg(kind)}</div>`}</div>`};
  const rs=(cfg.searches||[]);
  return `<div class="vh"><h1>Descubrir</h1><button class="btn small" data-act="reloadSug">↻ Actualizar</button></div>`+
    (rs.length?`<div class="chiprow"><span class="muted">Tus búsquedas recientes:</span>${rs.map(s=>`<button class="chip" data-act="redoSearch" data-q="${esc(s.q)}">${esc(s.q)}</button>`).join('')}<button class="btn small ghost" data-act="clearSearches">Borrar</button></div>`:'')+
    part('search','Por tus búsquedas')+part('read','Por tus últimas lecturas');
}
function inLib(it){const k=norm(it.title),a=norm(it.author);return books.some(b=>norm(b.title)===k&&(!a||!norm(b.author)||norm(b.author)===a))}
function authorCard(a,big){const inf=big?cached('a:'+norm(a.name)+'|'+(a.key||''),()=>authorInfo(a.name,a.key)).d:null;if(inf){a={...a,photo:inf.photo,desc:inf.desc}}
  return `<div class="acard ${big?'big':''}" data-act="openAuthor" data-n="${esc(a.name)}" data-k="${esc(a.key||'')}">${avatar(a.name,a.photo||(a.key?olAuthorPhoto(a.key):''))}
  <div style="min-width:0"><b>${esc(a.name)}</b><small>${esc([a.desc?a.desc[0].toUpperCase()+a.desc.slice(1):'Autor/a',a.birth&&!/\d{4}/.test(a.desc||'')&&(a.birth+(a.death?' – '+a.death:'')),a.works?pl(a.works,'obra'):''].filter(Boolean).join(' · '))}</small>${a.top?`<small>Conocido por «${esc(a.top)}»</small>`:''}</div><span class="go">Ver perfil →</span></div>`}
function mainAuthor(){
  const term=norm(cat.q||''),toks=term.split(' ').filter(t=>t.length>1);if(!toks.length)return null;
  const has=n=>toks.every(t=>norm(n).includes(t));
  let a=(cat.authors||[]).find(x=>has(x.name));
  const byItems=(cat.items||[]).filter(x=>x.author&&has(x.author));
  if(!a&&byItems.length>=2){const it=byItems[0];a={name:it.author,key:it.akey||'',works:byItems.length}}
  return a||null;
}
function viewSearch(){
  const own=filt(books,false),ma=mainAuthor();
  const mine=ma?cat.items.filter(x=>norm(x.author)===norm(ma.name)):[],rest=ma?cat.items.filter(x=>norm(x.author)!==norm(ma.name)):cat.items;
  const res=cat.state==='loading'&&!cat.items.length?'<div class="dashed">Buscando…</div>'
    :cat.state==='error'?'<div class="dashed">No se ha podido buscar en el catálogo (hace falta conexión a internet).</div>'
    :cat.state==='idle'?'<div class="dashed">Escribe al menos 3 letras para buscar en el catálogo.</div>'
    :!cat.items.length?'<div class="dashed">No se ha encontrado ningún libro con ese texto.</div>'
    :rest.length?`<div class="grid">${rest.map((it,i)=>catTile(it,i)).join('')}</div>`:'';
  return `<div class="vh"><h1>Buscar<small>«${esc(q.trim())}»</small></h1></div>
    ${ma?`<div class="sech"><h2>Autor</h2></div><div style="max-width:640px">${authorCard(ma,true)}</div>
      ${mine.length?`<div class="sec" style="margin-top:22px"><div class="sech"><h2>Libros de ${esc(ma.name)}</h2><a data-act="openAuthor" data-n="${esc(ma.name)}" data-k="${esc(ma.key||'')}">Ver perfil →</a></div><div class="hrow">${mine.map((it,i)=>catTile(it,i)).join('')}</div></div>`:''}`:''}
    ${own.length?`<div class="sec" style="margin-top:${ma?26:0}px"><div class="sech"><h2>En tu biblioteca</h2></div><div class="hrow">${own.slice(0,14).map((b,i)=>tile(b,i)).join('')}</div></div>`:''}
    ${rest.length||!ma||cat.state!=='done'?`<div class="sec" style="margin-top:${own.length||ma?26:0}px"><div class="sech"><h2>${ma?'Otros resultados':'Libros'}</h2><span class="muted" style="font-size:14px">${cat.state==='loading'?'Buscando…':''}</span></div>${res}</div>`:''}`;
}
async function searchAuthors(term){
  const r=await getJSON(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(term)}&limit=8`);
  const toks=norm(term).split(' ').filter(t=>t.length>1);
  return (r.docs||[]).filter(a=>a.name&&(a.work_count||0)>0&&toks.every(t=>norm(a.name).includes(t)))
    .sort((a,b)=>(b.work_count||0)-(a.work_count||0)).slice(0,3)
    .map(a=>({name:a.name,key:a.key||'',top:a.top_work||'',works:a.work_count||0,birth:a.birth_date||'',death:a.death_date||''}));
}
function runCat(){
  clearTimeout(catT);const term=q.trim();
  if(term.length<3){catSeq++;cat={q:term,state:'idle',items:[],authors:[]};return}
  cat={q:term,state:'loading',items:cat.items,authors:cat.authors||[]};
  catT=setTimeout(async()=>{const my=++catSeq;
    try{const [bk,au]=await Promise.all([olq(`q=${encodeURIComponent(term)}`,30),searchAuthors(term).catch(()=>[])]);
      const r=dedupe(bk);if(my!==catSeq)return;cat={q:term,state:'done',items:r,authors:au};
      setTimeout(()=>{if(my===catSeq&&q.trim()===term)recSearch()},1500)}
    catch{if(my!==catSeq)return;cat={q:term,state:'error',items:[],authors:[]}}
    if(route.v==='search')render()},450);
}
function recSearch(it){
  const term=q.trim(); if(term.length<3) return;
  const a=cat.authors&&cat.authors[0]; it=it||(a?{title:'',author:a.name,genre:''}:cat.items[0]); if(!it) return;
  const before=JSON.stringify(cfg.searches||[]);
  cfg.searches=[{q:term,title:it.title||'',author:it.author||'',genre:it.genre||''},...(cfg.searches||[]).filter(s=>norm(s.q)!==norm(term))].slice(0,6);
  if(JSON.stringify(cfg.searches)!==before) save();
}

/* ---------- Fichas de autor y de libro (catálogo) ---------- */
const CACHE={},REG=[];let hist=[];
const isDetail=v=>v==='author'||v==='work';
const regW=it=>{REG.push(it);return REG.length-1};
const initials=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const olAuthorPhoto=k=>`https://covers.openlibrary.org/a/olid/${encodeURIComponent(k)}-M.jpg?default=false`;
function avatar(name,photo,cls=''){return `<div class="av ${cls}" style="--h:${hash(norm(name))%360}">${esc(initials(name))}${safeImg(photo)?`<img src="${esc(safeImg(photo))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-rm>`:''}</div>`}
async function getJSON(u){const r=await fetch(u);if(!r.ok)throw new Error(r.status);return r.json()}
/* Texto de Open Library sin formato: quita enlaces markdown, direcciones web, separadores y notas de fuente */
const txt=v=>{let t=typeof v==='string'?v:(v&&v.value)||'';
  return t.replace(/\[([^\]]*)\]\((?:https?:)?[^)]*\)/g,'$1').replace(/\[\d+\]:\s*\S+/g,'').replace(/\(\s*\[?(source|fuente)[^)]*\)/gi,'')
    .replace(/https?:\/\/\S+/g,'').replace(/^\s*[-*_=]{3,}\s*$/gm,'').replace(/^\s*(Contains|Includes|Incluye)\s*:?\s*$/gim,'').replace(/^\s*[-*•]\s+/gm,'')
    .replace(/[ \t]+/g,' ').split('\n').map(l=>l.trim()).filter(Boolean).map(l=>/[.!?:;…»"')]$/.test(l)?l:l+'.').join(' ').trim()};
function dedupe(l){const seen=new Set();return l.filter(d=>{const k=norm(d.title)+'|'+norm(d.author);if(!d.title||seen.has(k))return false;seen.add(k);return true})}
function short(t,n){t=String(t||'').replace(/\[\d+\]:\s*\S+/g,'').replace(/\[([^\]]+)\]\[\d+\]/g,'$1').replace(/\(\s*\[?source\]?[^)]*\)/gi,'').replace(/-{3,}[\s\S]*$/,'').replace(/\s+/g,' ').trim();
  if(t.length<=n)return t;const c=t.slice(0,n),p=c.lastIndexOf('. ');return p>n*.5?c.slice(0,p+1):c.replace(/\s\S*$/,'')+'…'}
function cached(k,fn){ if(!CACHE[k]){CACHE[k]={s:'loading'};fn().then(d=>{CACHE[k]={s:'ok',d}},()=>{CACHE[k]={s:'err'}}).then(()=>{if(isDetail(route.v)||route.v==='search')render()})} return CACHE[k] }
const WRITER=/escrit|novelist|poeta|poetisa|autor|autora|dramaturg|ensayist|periodist|fil[oó]sof|historiador|guionist|writer|author|poet|essayist|playwright|journalist|philosopher|historian/i;
const BOOKRX=/novela|libro|obra|ensayo|saga|serie|poemario|cuento|relato|trilog|c[oó]mic|novel|book|series/i;
const wikiSum=(t,l)=>getJSON(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g,'_'))}`);
async function wikiFind(query,ok,l){
  const s=await getJSON(`https://${l}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`);
  for(const x of (s.query?.search||[])){try{const d=await wikiSum(x.title,l);if(ok(d))return d}catch{}}
  return null;
}
async function esFromQid(q){
  if(!/^Q\d+$/.test(q||''))return null;
  const e=await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${q}&props=sitelinks&sitefilter=eswiki&format=json&origin=*`);
  const t=e.entities?.[q]?.sitelinks?.eswiki?.title; if(!t) return null;
  const d=await wikiSum(t,'es'); return d&&d.type==='standard'?d:null;
}
/* ---------- Todo en español ----------
   1) se busca un texto escrito en español (Wikipedia ES, Google Books en español);
   2) si solo existe en inglés, se traduce con el traductor de la propia web (/api/traducir, Workers AI)
      y se guarda en este dispositivo para no volver a pedirlo. */
const TRK='biblioteca.tr';let TR=null;
function trStore(){if(!TR){try{TR=JSON.parse(localStorage.getItem(TRK)||'{}')}catch{TR={}}}return TR}
function hashT(t){let h=5381;for(let i=0;i<t.length;i++)h=(h*33^t.charCodeAt(i))>>>0;return h.toString(36)+t.length}
async function toES(text){
  text=String(text||'').replace(/\s+/g,' ').trim(); if(!text) return '';
  const st=trStore(),k=hashT(text); if(st[k]) return st[k];
  const r=await fetch('/api/traducir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text.slice(0,2400)})});
  if(!r.ok) throw new Error('traducir '+r.status);
  const es=String((await r.json()).es||'').slice(0,4000); if(!es) throw new Error('vacío');
  st[k]=es; const keys=Object.keys(st); if(keys.length>400) delete st[keys[0]];
  try{localStorage.setItem(TRK,JSON.stringify(st))}catch{}
  return es;
}
const STOPW=new Set(['the','and','los','las','del','una','para','with','from','that','este','esta']);
async function gbES(title,author){ // descripción escrita en español (ediciones españolas en Google Books)
  const q=encodeURIComponent(`${title} ${author||''}`.trim());
  const r=await getJSON(`https://www.googleapis.com/books/v1/volumes?q=${q}&langRestrict=es&printType=books&maxResults=8&fields=items(volumeInfo(title,authors,description,language))`);
  const last=norm(author||'').split(' ').pop(),tw=norm(title).split(' ').filter(w=>w.length>3&&!STOPW.has(w));
  for(const it of r.items||[]){const v=it.volumeInfo||{};
    if(v.language!=='es'||!v.description||v.description.length<80)continue;
    if(last&&!norm((v.authors||[]).join(' ')).includes(last))continue;
    const vt=norm(v.title||'');if(tw.length&&!tw.some(w=>vt.includes(w)))continue;
    return {desc:txt(v.description),title:v.title||''};
  }
  return null;
}
async function authorInfo(name,key){
  if(!key){try{const r=await getJSON(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(name)}&limit=6`);const nn=norm(name),docs=r.docs||[];
    const best=docs.filter(d=>norm(d.name)===nn).sort((a,b)=>(b.work_count||0)-(a.work_count||0))[0]||docs.sort((a,b)=>(b.work_count||0)-(a.work_count||0))[0];key=best?.key||''}catch{}}
  const last=norm(name).split(' ').pop();
  const ok=d=>d&&d.type==='standard'&&norm(d.title).includes(last)&&WRITER.test((d.description||'')+' '+(d.extract||'').slice(0,400));
  let w=null,ol={};
  if(key)try{ol=await getJSON(`https://openlibrary.org/authors/${key}.json`)}catch{}
  /* 1) Si Open Library conoce su ficha de Wikidata, de ahí sale la página exacta en español */
  const qid=/^Q\d+$/.test(ol.remote_ids?.wikidata||'')?ol.remote_ids.wikidata:'';
  if(qid)try{const d=await esFromQid(qid);if(d&&d.type==='standard')w=d}catch{}
  /* 2) Búsqueda directa en la Wikipedia en español */
  if(!w)try{const d=await wikiSum(name,'es');if(ok(d))w=d}catch{}
  if(!w)try{w=await wikiFind(name+' escritor',ok,'es')}catch{}
  /* 3) Si solo aparece en inglés, se salta a su versión en español a través de Wikidata */
  if(!w)try{const en=await wikiFind(name+' writer',ok,'en');if(en){w=(en.wikibase_item&&await esFromQid(en.wikibase_item).catch(()=>null))||en}}catch{}
  let all=[];
  try{all=dedupe(await olq(key?`author_key=${encodeURIComponent(key)}&sort=already_read`:`author=${encodeURIComponent(name)}&sort=already_read`,40))}catch{}
  const works=all.slice(0,10);
  const ph=(ol.photos||[]).find(x=>x>0);
  let bio=short(w?.extract||txt(ol.bio),520),bioLang=w?(w.lang||'es'):'en',desc=w?.description||'',auto=false;
  if(bio&&bioLang!=='es')try{bio=short(await toES(bio),560);bioLang='es';auto=true}catch{}
  if(desc&&w&&w.lang&&w.lang!=='es')try{desc=await toES(desc)}catch{}
  return {name,key,desc,bio,bioLang,auto,wiki:w?.content_urls?.desktop?.page||'',
    photo:w?.thumbnail?.source||(ph?`https://covers.openlibrary.org/a/id/${ph}-L.jpg`:(key?olAuthorPhoto(key):'')),birth:ol.birth_date||'',death:ol.death_date||'',works,all};
}
async function sagaOf(qid,author){
  const c=await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=P179&format=json&origin=*`);
  const sid=c.claims?.P179?.[0]?.mainsnak?.datavalue?.value?.id; if(!sid) return null;
  const sp=`SELECT ?i ?iLabel ?o ?sLabel WHERE { ?i wdt:P179 wd:${sid}. OPTIONAL{?i p:P179 ?st. ?st ps:P179 wd:${sid}; pq:P1545 ?o.} BIND(wd:${sid} AS ?s) SERVICE wikibase:label{bd:serviceParam wikibase:language "es,mul,en".} } LIMIT 60`;
  const r=await getJSON(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sp)}`);
  const rows=r.results?.bindings||[];if(rows.length<2) return null;
  const seen=new Set(),list=rows.map(x=>({q:x.i.value.split('/').pop(),t:x.iLabel?.value||'',o:parseFloat(x.o?.value)})).filter(x=>x.t&&!/^Q\d+$/.test(x.t)&&!seen.has(norm(x.t))&&seen.add(norm(x.t)))
    .sort((a,b)=>(isNaN(a.o)?999:a.o)-(isNaN(b.o)?999:b.o)).slice(0,14);
  const items=await Promise.all(list.map(async x=>{let d=null;try{d=(await lookup(x.t,author,1))[0];if(!d||!d.cover)d=(await lookup(`${x.t} ${author||''}`.trim(),'',1))[0]||d}catch{}return {...(d||{author}),title:x.t,author:(d&&d.author)||author||'',here:x.q===qid}}));
  let name=rows[0].sLabel?.value||'';
  if(!name||/^Q\d+$/.test(name))try{const e=await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${sid}&props=labels&format=json&origin=*`);const l=e.entities?.[sid]?.labels||{};name=(l.es||l.mul||l.en||{}).value||''}catch{name=''}
  return {name,items};
}
const GENERIC=/^(fiction|ficcion|general|novela|novels?|literature|literatura|fiction, general|.*fiction, general|english fiction|spanish fiction|american fiction|nyt:.*|new york times.*|reading level.*|juvenile fiction|large type books|ebook|ebooks|fiction in english|translations.*)$/i;
function subjectsOf(d,ol){const all=[...(ol.subjects||[]),...(d.subjects||[])],g=d.genre||genreOf(all),seen=new Set();
  const sp=all.filter(s=>{const x=norm(s);if(seen.has(x))return false;seen.add(x);return s.length>3&&s.length<35&&!GENERIC.test(s.trim())&&!GMAP.some(([k])=>x===k||x.startsWith(k+' ')||x.endsWith(' '+k))&&!/accessible|protected|daisy|in library|open library|award|prize|premio|\d{4}|fiction|ficci|imaginary|literature|literatura|"/i.test(s)}).slice(0,3);
  return {sp,genre:g&&GREV[g]||''}}
async function similarTo(d,ol){
  const {sp,genre}=subjectsOf(d,ol),Q=s=>`subject:"${s}"`,out=[],add=l=>{for(const x of l)if(x.cover&&norm(x.title)!==norm(d.title)&&!out.some(y=>norm(y.title)===norm(x.title)))out.push(x)};
  const run=async qq=>{try{add(await olq(`q=${encodeURIComponent(qq)}&sort=already_read`,30))}catch{}};
  if(sp.length>=2) await run(sp.slice(0,2).map(Q).join(' AND '));
  if(out.length<8&&sp.length) await run(Q(sp[0]));
  if(out.length<8&&genre) await run(`subject:"${genre}"`);
  if(!out.length&&d.author) await run(`author:"${d.author}"`);
  return out.slice(0,14);
}
async function workInfo(it){
  let d={...it};
  if(!d.key){try{const r=(await lookup(it.title,it.author,1))[0];if(r)d={...r,...Object.fromEntries(Object.entries(it).filter(([,v])=>v))}}catch{}}
  let ol={};if(d.key)try{ol=await getJSON(`https://openlibrary.org${d.key}.json`)}catch{}
  const tw=norm(d.title).replace(/^(el|la|los|las|un|una|the|a|an) /,'').split(' ').find(t=>t.length>2)||norm(d.title);
  const ok=w=>w&&w.type==='standard'&&norm(w.title).includes(tw)&&BOOKRX.test((w.description||'')+' '+(w.extract||'').slice(0,300));
  let w=null;try{w=await wikiFind(`${d.title} ${d.author||''}`.trim(),ok,'es')}catch{}
  if(!w)try{const en=await wikiFind(`${d.title} ${d.author||''} novel`.trim(),ok,'en');if(en){w=(en.wikibase_item&&await esFromQid(en.wikibase_item).catch(()=>null))||en}}catch{}
  let saga=null;if(w?.wikibase_item)try{saga=await sagaOf(w.wikibase_item,d.author)}catch{}
  let similar=[];
  if(!saga) similar=await similarTo(d,ol);
  if(!d.langs&&d.key)try{const r=(await olq(`q=${encodeURIComponent('key:'+d.key)}`,1))[0];if(r)d.langs=r.langs}catch{}
  let summary=short(w?.extract||txt(ol.description),900),sumLang=w?(w.lang||'es'):'en',auto=false,gb=null;
  if(!w||sumLang!=='es'){try{gb=await gbES(d.title,d.author)}catch{}
    if(gb){summary=short(gb.desc,900);sumLang='es'}
    else if(summary)try{summary=short(await toES(summary),960);sumLang='es';auto=true}catch{}}
  const hasES=(d.langs||[]).includes('spa')||!!gb||(w&&w.lang==='es');
  const onlyEN=!hasES&&(d.langs||[]).length?((d.langs||[]).includes('eng')?'en':'otro'):'';
  return {d,summary,sumLang,auto,onlyEN,wiki:w?.content_urls?.desktop?.page||'',date:ol.first_publish_date||d.year||'',saga,similar};
}
/* Libros del autor que aún no tienes, ordenados según tus gustos:
   géneros que más lees y valoras + temas de los libros de este autor que te han gustado + popularidad */
function tasteGenres(){
  const G={};
  for(const b of books){ if(!b.genre)continue;
    const w=b.status==='read'?(b.rating?b.rating-2.5:1):b.status==='reading'?1:0.5;
    G[b.genre]=(G[b.genre]||0)+w }
  return G;
}
function authorPicks(a){
  const all=a.all||[]; if(!all.length) return {list:[],why:[]};
  const ownT=new Set(books.map(b=>norm(b.title))),G=tasteGenres(),S={};
  const ok=s=>s.length>3&&s.length<40&&!GENERIC.test(s)&&!/fiction|ficci|literat|\d{4}|award|prize|premio|in library|accessible|protected|daisy|open library/i.test(s);
  for(const x of all){ if(!ownT.has(norm(x.title)))continue;
    const b=books.find(y=>norm(y.title)===norm(x.title)); const w=b?.rating>=4?2:(b?.rating&&b.rating<=2?-1.5:1);
    for(const sub of x.subjects||[]){const k=norm(sub);if(ok(k))S[k]=(S[k]||0)+w} }
  const shown=new Set((a.works||[]).map(x=>norm(x.title)));
  const pack=/\(series\)|\bbox(ed)? ?set|\bcollection\b|omnibus|colecci[oó]n|estuche|pack\b|\b\d+\s*-\s*\d+\s*$|books? \d+ ?(-|to|y|&) ?\d+|trilog[iy]a? completa|complete (series|works)|obras completas/i;
  const scored=all.map((x,i)=>{ if(ownT.has(norm(x.title))||!x.cover||pack.test(x.title)) return null;
    const sub=(x.subjects||[]).reduce((t,y)=>t+(S[norm(y)]||0),0);
    return {x,score:(G[x.genre]||0)*1.2+Math.min(sub,8)*0.7+(all.length-i)/all.length*1.5,shown:shown.has(norm(x.title))} }).filter(Boolean);
  let list=scored.filter(o=>!o.shown).sort((p,q)=>q.score-p.score).slice(0,10).map(o=>o.x);
  if(list.length<3) list=scored.sort((p,q)=>q.score-p.score).slice(0,10).map(o=>o.x);
  const why=Object.entries(G).filter(([,v])=>v>0).sort((p,q)=>q[1]-p[1]).slice(0,2).map(([g])=>g);
  return {list,why};
}
function viewAuthor(){
  const {name,key}=route,c=cached('a:'+norm(name)+'|'+(key||''),()=>authorInfo(name,key)),a=c.d||{};
  const mine=books.filter(b=>norm(b.author)===norm(name)),readN=mine.filter(b=>b.status==='read').length,fav=cfg.favs.includes(norm(name));
  const dates=[a.birth,a.death].filter(Boolean).join(' – ');
  const works=c.s==='loading'?'<div class="dashed">Buscando sus libros…</div>':(a.works||[]).length?`<div class="hrow">${a.works.map((it,i)=>catTile(it,i)).join('')}</div>`:'<div class="dashed">No se han encontrado libros suyos en el catálogo.</div>';
  return `<button class="back" data-act="back">← Volver</button>
  <div class="ahead">${avatar(name,a.photo||(key?olAuthorPhoto(key):''),'xl')}<div style="flex:1;min-width:240px"><h1>${esc(name)}</h1>
    <div class="sub">${esc([a.desc,dates].filter(Boolean).join(' · '))}</div>
    <div class="acts2">${readN?`<button class="btn primary" data-act="authorBooks" data-k="${esc(norm(name))}" data-s="read">📚 Ver mis ${pl(readN,'libro leído','libros leídos')}</button>`:mine.length?`<button class="btn primary" data-act="authorBooks" data-k="${esc(norm(name))}" data-s="all">📚 Ver sus ${pl(mine.length,'libro')} en mi biblioteca</button>`:''}
      <button class="btn ${fav?'':'ghost'}" data-act="fav" data-k="${esc(norm(name))}">${fav?'♥ Favorito':'♡ Marcar como favorito'}</button></div></div></div>
  <p class="bio">${c.s==='loading'?'<span class="skel">Buscando su biografía…</span>':a.bio?esc(a.bio)+(a.bioLang!=='es'?' <span class="muted">(en inglés)</span>':a.auto?' <span class="muted">(traducido automáticamente)</span>':'')+(safeUrl(a.wiki)?` <a href="${esc(safeUrl(a.wiki))}" target="_blank" rel="noopener noreferrer">Leer más</a>`:''):'<span class="muted">No se ha encontrado una biografía.</span>'}</p>
  ${mine.length?`<div class="sec"><div class="sech"><h2>${readN?'Los que has leído':'En tu biblioteca'}</h2></div><div class="hrow">${[...mine].sort((x,y)=>(x.status==='read'?0:1)-(y.status==='read'?0:1)||(y.end||'').localeCompare(x.end||'')).map((b,i)=>tile(b,i)).join('')}</div></div>`:''}
  <div class="sec"><div class="sech"><h2>Sus libros más conocidos</h2></div>${works}</div>
  ${(()=>{if(c.s!=='ok')return '';const p=authorPicks(a);if(!p.list.length)return '';
    return `<div class="sec"><div class="sech"><h2>Te pueden gustar</h2></div><p class="muted" style="margin:-6px 0 12px;font-size:14px">${mine.length?'Elegidos a partir de lo que has leído de '+esc(name):'Libros suyos que aún no tienes'}${p.why.length?' y de tus géneros favoritos ('+esc(p.why.join(', '))+')':''}.</p><div class="hrow">${p.list.map((it,i)=>catTile(it,i)).join('')}</div></div>`})()}`;
}
function viewWork(){
  const it=route.it||{},c=cached('w:'+(it.key||norm(it.title+'|'+it.author)),()=>workInfo(it)),w=c.d||{},d=w.d||it;
  const own=books.find(b=>norm(b.title)===norm(d.title)&&(!d.author||!b.author||norm(b.author)===norm(d.author)));
  const id=regW(d),date=w.date||d.year||'';
  const bottom=c.s==='loading'?'<div class="dashed">Buscando recomendaciones…</div>':w.saga?`<div class="sec"><div class="sech"><h2>Saga${w.saga.name?': '+esc(w.saga.name):''}</h2></div><div class="hrow">${w.saga.items.map((x,i)=>catTile(x,i)).join('')}</div></div>`
    :(w.similar||[]).length?`<div class="sec"><div class="sech"><h2>Libros parecidos</h2></div><div class="hrow">${w.similar.map((x,i)=>catTile(x,i)).join('')}</div></div>`:'';
  return `<button class="back" data-act="back">← Volver</button>
  <div class="bk wk">${cover(d)}<div class="main">
    <h2>${esc(d.title)}</h2><div class="au">${d.author?`<a data-act="openAuthor" data-n="${esc(d.author)}" data-k="${esc(d.akey||'')}">${esc(d.author)}</a>`:'Autor desconocido'}</div>
    <div class="pills">${date?`<span class="pill">📅 ${esc(date)}</span>`:''}${d.pages?`<span class="pill">${d.pages} págs.</span>`:''}${d.genre?`<span class="pill">${esc(d.genre)}</span>`:''}${own?'<span class="pill st">En tu biblioteca</span>':''}${w.onlyEN==='en'?'<span class="pill lang">🇬🇧 Solo en inglés</span>':w.onlyEN?'<span class="pill lang">Sin edición en español</span>':''}</div>
    <div class="acts">${own?`<button class="btn small primary" data-open="${own.id}">Abrir mi ficha</button>`:`<button class="btn small primary" data-act="addW" data-w="${id}" data-s="want">＋ Quiero leerlo</button><button class="btn small" data-act="addW" data-w="${id}" data-s="reading">Empezar a leerlo</button><button class="btn small" data-act="addW" data-w="${id}" data-s="read">Ya lo he leído</button>`}${cloud.user&&own?`<button class="btn small" data-act="suggestOwn" data-id="${own.id}">🎁 Sugerir a un amigo</button>`:''}</div>
    <h4>Resumen</h4><p class="bio" style="margin:0">${c.s==='loading'?'<span class="skel">Buscando información del libro…</span>':w.summary?esc(w.summary)+(w.sumLang!=='es'?' <span class="muted">(en inglés)</span>':w.auto?' <span class="muted">(traducido automáticamente)</span>':'')+(safeUrl(w.wiki)?` <a href="${esc(safeUrl(w.wiki))}" target="_blank" rel="noopener noreferrer">Leer más</a>`:''):'<span class="muted">No se ha encontrado un resumen de este libro.</span>'}</p>
    ${d.author?`<h4>Autor</h4><div style="max-width:520px">${authorCard({name:d.author,key:d.akey||''})}</div>`:''}
  </div></div>${bottom}`;
}
function viewLib(){
  const list=filt(books,true);
  const any=q||Object.values(F).some(Boolean);
  const group=(st,title,icon,emptyMsg)=>{const l=list.filter(b=>b.status===st);
    if(!l.length&&(any||st==='want'))return '';
    return `<section class="libsec"><div class="libh"><span class="libi">${icon}</span><h2>${title}</h2><span class="libn">${l.length}</span></div>${l.length?`<div class="grid">${l.map((b,i)=>tile(b,i)).join('')}</div>`:`<div class="dashed">${emptyMsg}</div>`}</section>`};
  const grouped=status==='all'&&books.length?group('reading','Leyendo','📖','No estás leyendo nada ahora mismo.<br><button class="btn primary" data-act="add">＋ Empezar a leer</button>')+group('read','Leídos','✅','Cuando termines un libro aparecerá aquí.<br><button class="btn" data-act="import">Importar los que ya he leído</button>')+group('want','Próximas lecturas','🔖',''):'';
  return `<div class="vh"><h1>Biblioteca<small>${pl(list.length,'libro')}</small></h1></div>${filterBar(true)}`+
    (grouped&&(list.length||!any)?grouped:list.length?`<div class="grid">${list.map((b,i)=>tile(b,i)).join('')}</div>`
    :books.length?emptyBox('🔎','Nada por aquí','No hay libros que coincidan con la búsqueda o los filtros.','<button class="btn" data-act="clearF">Limpiar filtros</button>')
    :emptyBox('📚','Tu biblioteca está vacía','Añade el libro que estás leyendo o importa de golpe los que ya has leído.','<button class="btn primary" data-act="add">＋ Añadir libro</button><button class="btn" data-act="import">Importar lista</button>'));
}
function viewList(){
  const id=route.id,custom=id!=='want'&&id!=='reread',all=listBooks(id),list=filt(all,false);
  const rm=custom?`<button class="ib" data-act="unlist" data-id="%ID%" title="Quitar de la lista">✕</button>`:'';
  const hint=id==='want'?['🔖','Los libros que quieres leer. Añádelos aquí y «¿Qué leo ahora?» te propondrá uno al azar.','<button class="btn primary" data-act="addWant">＋ Añadir a próximas lecturas</button>']
    :id==='reread'?['↻','Abre la ficha de un libro que ya hayas leído y pulsa «Para releer».','<button class="btn" data-nav="lib">Ir a la biblioteca</button>']
    :['📁','Abre la ficha de cualquier libro y pulsa el nombre de esta lista para añadirlo.','<button class="btn" data-nav="lib">Ir a la biblioteca</button>'];
  return `<div class="vh"><h1>${esc(listName(id))}<small>${pl(all.length,'libro')}</small></h1>${id==='want'?'<button class="btn small primary" data-act="addWant">＋ Añadir</button>':''}${custom?'<button class="btn small" data-act="renameList">Renombrar</button><button class="btn small danger" data-act="delList">Eliminar lista</button>':''}</div>`+
    (all.length?filterBar(false)+(list.length?`<div class="grid">${list.map((b,i)=>tile(b,i,rm.replace('%ID%',b.id))).join('')}</div>`:emptyBox('🔎','Nada por aquí','Ningún libro de esta lista coincide con los filtros.','<button class="btn" data-act="clearF">Limpiar filtros</button>'))
    :emptyBox(hint[0],'Esta lista está vacía',hint[1],hint[2]));
}
function viewAuthors(){
  const nq=norm(q),all=authorsData(),af=authorTab;
  const al=all.filter(a=>(!nq||a.k.includes(nq))&&(af==='all'||(af==='read'?a.read>0:cfg.favs.includes(a.k))));
  const cnt={all:all.length,read:all.filter(a=>a.read>0).length,fav:all.filter(a=>cfg.favs.includes(a.k)).length};
  const tabs=`<div class="fbar"><div class="chips">${[['all','Todos'],['read','Leídos'],['fav','♥ Favoritos']].map(([s,t])=>`<button class="chip ${af===s?'on':''}" data-act="authorTab" data-s="${s}">${t} <span class="muted">${cnt[s]}</span></button>`).join('')}</div></div>`;
  if(!al.length&&all.length) return `<div class="vh"><h1>Autores</h1></div>${tabs}`+(af==='fav'?emptyBox('♥','Aún no tienes autores favoritos','Pulsa el corazón de un autor (aquí o en su perfil) para tenerlo a mano.'):af==='read'?emptyBox('✍️','Aún no has terminado ningún libro','Aquí saldrán los autores de los libros que hayas leído.'):emptyBox('🔎','Nada por aquí','Ningún autor coincide con la búsqueda.'));
  return `<div class="vh"><h1>Autores<small>${al.length} ${al.length===1?'autor':'autores'}${af==='all'&&cfg.favs.length?' · favoritos primero':''}</small></h1></div>${all.length?tabs:''}`+
    (al.length?`<div class="authors">${al.map((a,i)=>`<div class="acard" data-act="openAuthor" data-n="${esc(a.name)}" style="--i:${Math.min(i,24)}"><div class="av" style="--h:${hash(a.k)%360}">${esc(a.name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
      <div><b>${esc(a.name)}</b><small>${pl(a.n,'libro')}${a.read&&a.read!==a.n?` · ${a.read} leído${a.read===1?'':'s'}`:''}${a.rated?` · ★ ${(a.sum/a.rated).toFixed(1).replace('.',',')}`:''}</small></div>
      <button class="fav ${cfg.favs.includes(a.k)?'on':''}" data-act="fav" data-k="${esc(a.k)}" title="Autor favorito">♥</button></div>`).join('')}</div>`
    :emptyBox('✍️','Sin autores todavía','Aparecerán solos a partir de los libros que añadas. Marca tus favoritos con el corazón.'));
}
function viewQuotes(){
  const nq=norm(q),qs=[];for(const b of books)for(const n of b.notes)if(n.quote&&(!nq||norm(n.text+' '+b.title+' '+b.author).includes(nq)))qs.push({b,n});
  return `<div class="vh"><h1>Citas<small>${pl(qs.length,'cita')}</small></h1></div>`+(qs.length?`<div class="quotes">${qs.map(({b,n},i)=>`<blockquote class="qc" data-open="${b.id}" style="--i:${Math.min(i,24)}">${esc(n.text)}<cite>${esc(b.title)}${b.author?' — '+esc(b.author):''}${n.page?' · p. '+n.page:''}</cite></blockquote>`).join('')}</div>`
    :emptyBox('❝','Todavía no hay citas','Al escribir una nota en un libro marca «Cita», o pulsa ❝ en una nota que ya tengas, y aparecerá aquí.'));
}
function statsHTML(){
  const read=books.filter(b=>b.status==='read'),cy=curYear();
  const years=[...new Set(read.map(b=>(b.end||'').slice(0,4)).filter(Boolean))].sort().reverse();
  if(statYear===null||(statYear!=='all'&&statYear!==cy&&!years.includes(statYear))) statYear=years.includes(cy)||!years.length?cy:'all';
  const all=statYear==='all',set=all?read:read.filter(b=>(b.end||'').startsWith(statYear));
  const pages=set.reduce((s,b)=>s+(+b.pages||0),0),rated=set.filter(b=>b.rating),timed=set.filter(days);
  const avg=rated.length?(rated.reduce((s,b)=>s+b.rating,0)/rated.length).toFixed(1).replace('.',','):'—';
  const avgD=timed.length?Math.round(timed.reduce((s,b)=>s+days(b),0)/timed.length):'—';
  const top=f=>{const m=new Map();for(const b of set){const k=f(b);if(k)m.set(k,(m.get(k)||0)+1)}return [...m].sort((a,b)=>b[1]-a[1])};
  const genres=top(b=>b.genre).slice(0,7),auths=top(b=>b.author).slice(0,7);
  let cols,noDate=0;
  if(all){cols=[...years].reverse().map(y=>[y,read.filter(b=>(b.end||'').startsWith(y)).length]);noDate=read.filter(b=>!b.end).length}
  else{cols=MES.map((m,i)=>[m,set.filter(b=>b.end.length===10&&+b.end.slice(5,7)===i+1).length]);noDate=set.filter(b=>b.end.length===4).length}
  const mx=Math.max(1,...cols.map(c=>c[1]));
  const hb=l=>l.length?l.map(([k,n])=>`<div class="hb"><span title="${esc(k)}">${esc(k)}</span><div class="bar"><i style="width:${n/l[0][1]*100}%"></i></div><b>${n}</b></div>`).join(''):'<p class="muted">Sin datos todavía.</p>';
  const hl=[];
  if(!all){const bm=cols.map((c,i)=>[i,c[1]]).sort((a,b)=>b[1]-a[1])[0];if(bm&&bm[1]>0)hl.push(`<div class="card hlc"><small>Tu mejor mes</small><b>${MESL[bm[0]]}</b><span>${pl(bm[1],'libro')}</span></div>`)}
  if(auths[0]&&auths[0][1]>1)hl.push(`<div class="card hlc"><small>Autor más leído</small><b>${esc(auths[0][0])}</b><span>${auths[0][1]} libros</span></div>`);
  const lg=[...set].filter(b=>b.pages).sort((a,b)=>b.pages-a.pages)[0];if(lg)hl.push(`<div class="card hlc" data-open="${lg.id}"><small>El más largo</small><b>${esc(lg.title)}</b><span>${lg.pages} páginas</span></div>`);
  const fs=[...timed].sort((a,b)=>days(a)-days(b))[0];if(fs)hl.push(`<div class="card hlc" data-open="${fs.id}"><small>El que más rápido leíste</small><b>${esc(fs.title)}</b><span>${pl(days(fs),'día')}</span></div>`);
  const nq=set.reduce((s,b)=>s+b.notes.filter(n=>n.quote).length,0);if(nq)hl.push(`<div class="card hlc" data-nav="quotes"><small>Citas guardadas</small><b>${nq}</b><span>Ver todas</span></div>`);
  const best=[...rated].filter(b=>b.rating>=4).sort((a,b)=>b.rating-a.rating||(b.end||'').localeCompare(a.end||'')).slice(0,14);
  return `<div class="sech" style="margin-top:36px"><h2 style="font-size:26px">${all?'Todas tus lecturas':`Tu ${statYear} en libros`}</h2>
    <label class="fl"><span>Periodo</span><select id="statYear"><option value="all">Todos los años</option>${[...new Set([cy,...years])].sort().reverse().map(y=>`<option ${y===statYear?'selected':''}>${y}</option>`).join('')}</select></label></div>
    <div class="kpis"><div class="card kpi"><b>${set.length}</b><span>${set.length===1?'libro leído':'libros leídos'}</span></div><div class="card kpi"><b>${pages.toLocaleString('es-ES')}</b><span>páginas</span></div><div class="card kpi"><b>${avg}</b><span>valoración media</span></div><div class="card kpi"><b>${avgD}</b><span>días de media por libro</span></div></div>
    ${hl.length?`<div class="kpis">${hl.join('')}</div>`:''}
    <div class="panels"><div class="card panel"><h3>${all?'Libros por año':'Libros por mes'}</h3><div class="chart">${cols.length?cols.map(([l,n])=>`<div>${n||''}<i style="height:${n/mx*140}px"></i>${l}</div>`).join(''):'<p class="muted">Sin datos todavía.</p>'}</div>${noDate?`<p class="muted" style="font-size:13px;margin:10px 0 0">${noDate} sin ${all?'fecha':'mes concreto'} no ${noDate===1?'aparece':'aparecen'} en el gráfico.</p>`:''}</div>
    <div class="card panel"><h3>Géneros</h3>${hb(genres)}</div><div class="card panel"><h3>Autores más leídos</h3>${hb(auths)}</div></div>
    ${best.length?`<div class="sec"><div class="sech"><h2>Tus favoritos${all?'':' del año'}</h2></div><div class="hrow">${best.map((b,i)=>tile(b,i)).join('')}</div></div>`:''}`;
}
function viewProfile(){
  const read=books.filter(b=>b.status==='read'),first=books.map(b=>rk(b).slice(0,4)).filter(Boolean).sort()[0];
  const ini=(cfg.name||'Yo').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase(),th=cfg.theme||'auto';
  return `<div class="card prof" style="margin-top:10px"><div class="av">${esc(ini)}</div>
    <div style="flex:1;min-width:240px"><input class="name" id="pName" value="${esc(cfg.name)}" placeholder="Escribe tu nombre" maxlength="40">
      <div class="muted">${pl(books.length,'libro')} en la biblioteca · ${read.length} ${read.length===1?'leído':'leídos'}${first?' · registrando desde '+first:''}</div>
      ${cloud.user?`<button class="frchip" data-nav="friends">🤝 <b>${soc.friends.length}</b> ${soc.friends.length===1?'amigo':'amigos'}${soc.incoming.length?` <span class="hot">${pl(soc.incoming.length,'solicitud nueva','solicitudes nuevas')}</span>`:''} <span class="arr">→</span></button>`:''}</div>
    <div><div class="muted" style="font-size:13px;margin-bottom:6px">Tema</div><div class="seg">${[['light','☀️ Claro'],['dark','🌙 Oscuro'],['auto','Automático']].map(([t,l])=>`<button class="${th===t?'on':''}" data-act="setTheme" data-t="${t}">${l}</button>`).join('')}</div></div></div>
    <div class="hero" style="margin-top:20px;grid-template-columns:repeat(auto-fit,minmax(min(400px,100%),1fr))">${goalCard(true)}
      ${accountCard()}
      <div class="card"><h3 style="font-size:20px">Tus datos</h3><p class="muted" style="margin:8px 0 14px;font-size:14px">${cloud.user?'Tus libros se guardan en este dispositivo y en tu cuenta. Puedes descargar una copia cuando quieras.':'Ahora mismo todo se guarda solo en este dispositivo. Inicia sesión para no perderlo y usarlo en varios dispositivos, o haz una copia de vez en cuando.'}</p>
      <button class="btn small" data-act="export">Guardar copia de seguridad</button> <button class="btn small" data-act="restore">Restaurar copia</button>${cloud.user?`<label class="check" style="margin-top:16px"><input type="checkbox" id="shareChk" ${cfg.shareProg!==false?'checked':''}>Avisar a quien me recomendó un libro cuando lo empiece y lo termine</label>`:''}<label class="check" style="margin-top:16px"><input type="checkbox" id="consentChk" ${consentVal()==='yes'?'checked':''}>Compartir estadísticas de uso anónimas</label>
      <p class="muted" style="font-size:12px;margin:12px 0 0">Versión ${APP_VERSION} · <a href="privacidad.html" target="_blank" rel="noopener" style="color:var(--accent)">Privacidad</a> · <a href="condiciones.html" target="_blank" rel="noopener" style="color:var(--accent)">Aviso legal y condiciones</a></p> ${(cfg.searches||[]).length?'<button class="btn small ghost" data-act="clearSearches">Borrar historial de búsquedas</button>':''}</div></div>
    ${statsHTML()}`;
}
const VIEWS={home:viewHome,lib:viewLib,list:viewList,authors:viewAuthors,quotes:viewQuotes,discover:viewDiscover,search:viewSearch,author:viewAuthor,work:viewWork,profile:viewProfile,friends:viewFriends,sugs:viewSugs};
function render(anim){
  if(route.v==='list'&&route.id!=='want'&&route.id!=='reread'&&!cfg.lists.some(l=>l.id===route.id)) route={v:'lib'};
  const t=applyTheme();
  renderCloudBtn();
  $('#bTheme').innerHTML=t==='dark'?'<i>☀️</i><span>Tema claro</span>':'<i>🌙</i><span>Tema oscuro</span>';
  $('#nav').innerHTML=NAV.map(([v,i,l])=>`<button class="navi ${route.v===v?'on':''}" data-nav="${v}"><i>${i}</i><span>${l}</span>${v==='friends'&&soc.incoming.length?`<em class="hot">${soc.incoming.length}</em>`:''}</button>`).join('');
  const li=(id,i,l)=>`<button class="navi ${route.v==='list'&&route.id===id?'on':''}" data-nav="list" data-id="${id}"><i>${i}</i><span>${esc(l)}</span><em>${listBooks(id).length||''}</em></button>`;
  const nNew=soc.sugs.filter(x=>x.status==='new').length+soc.sent.filter(x=>x.fresh).length;
  $('#navLists').innerHTML=li('want','🔖','Próximas lecturas')+li('reread','↻','Para releer')+(cloud.user?`<button class="navi ${route.v==='sugs'?'on':''}" data-nav="sugs"><i>🎁</i><span>Sugerencias de amigos</span><em class="${nNew?'hot':''}">${nNew||soc.sugs.length||''}</em></button>`:'')+cfg.lists.map(l=>li(l.id,'📁',l.name)).join('');
  $('#q').placeholder=ONLINE.includes(route.v)?'Buscar cualquier libro (título, autor…) para añadirlo a tu biblioteca':'Buscar en tu biblioteca por título, autor, género o dentro de tus notas…';
  $('#mHome').classList.toggle('on',route.v==='home');$('#mLib').classList.toggle('on',route.v==='lib');
  const v=$('#view');
  v.innerHTML=VIEWS[route.v]();
  if(anim){v.classList.remove('anim');void v.offsetWidth;v.classList.add('anim')}
  $('#genres').innerHTML=[...new Set([...books.map(b=>b.genre).filter(Boolean),...GENRES])].map(g=>`<option value="${esc(g)}">`).join('');
}


/* ---------- Amigos y sugerencias ----------
   Todo pasa por funciones del servidor (friend_request, friends_list, suggest_book…), que comprueban permisos.
   Lo que llega de otras personas se muestra siempre escapado (esc) y las portadas pasan por safeUrl. */
let soc={friends:[],incoming:[],outgoing:[],sugs:[],sent:[],ok:false,busy:false,msg:'',shown:new Set()},sugTarget=null,replyTarget=null;
/* Redibujado en segundo plano: si estás escribiendo o deslizando (sobre todo en iPhone), se espera a que termines.
   Así la pantalla no se «cuelga» por cambiar el contenido a mitad de un desplazamiento o con el teclado abierto. */
let rPend=false,rTimer=0,lastAct=0;
function busyUI(){const a=document.activeElement;return (a&&a!==document.body&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.closest&&a.closest('#main'))||Date.now()-lastAct<700||!!document.querySelector('dialog[open]')}
function softRender(){ if(busyUI()){rPend=true;clearTimeout(rTimer);rTimer=setTimeout(softRender,800);return} rPend=false; const m=$('#main'),y=m.scrollTop; render(); m.scrollTop=y }
['touchstart','touchmove','touchend','scroll','wheel'].forEach(ev=>addEventListener(ev,()=>{lastAct=Date.now()},{passive:true,capture:true}));
function socReset(){soc={friends:[],incoming:[],outgoing:[],sugs:[],sent:[],ok:false,busy:false,msg:'',shown:new Set()}}
function cleanSug(x){const b=x&&typeof x.book==='object'&&x.book||{};
  const RX=v=>['thanks','love','like','meh'].includes(v)?v:'';
  return {progress:['want','reading','read'].includes(x.progress)?x.progress:'',rating:Math.max(0,Math.min(5,+x.rating||0)),reaction:RX(x.reaction),reply:String(x.reply||'').slice(0,280),freaction:RX(x.final_reaction),freply:String(x.final_reply||'').slice(0,280),
    id:+x.id||0,from:String(x.from_name||'Un amigo').slice(0,40),msg:String(x.message||'').slice(0,280),status:['new','added','dismissed'].includes(x.status)?x.status:'new',seen:!!x.seen,date:String(x.created_at||'').slice(0,10),
    book:{title:String(b.title||'').slice(0,200),author:String(b.author||'').slice(0,120),cover:/^https:\/\/covers\.openlibrary\.org\/[A-Za-z0-9\/_.-]+$/.test(b.cover||'')?String(b.cover):'',key:String(b.key||''),akey:String(b.akey||''),year:String(b.year||''),pages:String(b.pages||'').replace(/\D/g,''),genre:String(b.genre||'').slice(0,40)}}}
async function socLoad(panel){
  if(!cloud.user||cloud.needMfa||!cloud.sb||soc.busy)return; soc.busy=true;
  try{
    const [f,sg,se]=await Promise.all([cloud.sb.rpc('friends_list'),cloud.sb.rpc('suggestions_list'),cloud.sb.rpc('suggestions_sent')]);
    if(f.error)throw f.error; if(sg.error)throw sg.error;
    soc.sent=se.error?soc.sent:(se.data||[]).map(cleanSent).filter(x=>x.id&&x.book.title);
    const fl=(f.data||[]).map(r=>({id:+r.id,kind:r.kind,uid:r.user_id||'',name:String(r.name||'').slice(0,40),email:String(r.email||'').slice(0,254),since:String(r.since||'').slice(0,10)}));
    soc.friends=fl.filter(r=>r.kind==='friend').sort((a,b)=>a.name.localeCompare(b.name));soc.incoming=fl.filter(r=>r.kind==='incoming');soc.outgoing=fl.filter(r=>r.kind==='outgoing');
    soc.sugs=(sg.data||[]).map(cleanSug).filter(x=>x.id&&x.book.title);
    shareProgress();
    const sig=JSON.stringify([soc.friends,soc.incoming,soc.outgoing,soc.sugs.map(x=>[x.id,x.status,x.reaction,x.freaction]),soc.sent.map(x=>[x.id,x.prog,x.fresh,x.reaction,x.freaction])]);
    if(sig!==soc.sig||!soc.ok){soc.sig=sig;soc.ok=true;softRender()}
    if(panel!==false) showSugPanel();
  }catch(e){ if(navigator.onLine) window.informarError?.(e,'amigos') }
  finally{soc.busy=false}
}
function showSugPanel(){
  const nw=soc.sugs.filter(x=>!x.seen&&x.status==='new'&&!soc.shown.has(x.id)); if(!nw.length||document.querySelector('dialog[open]'))return;
  nw.forEach(x=>soc.shown.add(x.id));
  const x=nw[0],more=nw.length-1;
  $('#sugPanel').innerHTML=`<div class="sugp">${cover(x.book)}<div class="sugpt"><div class="kick">🎁 Nueva sugerencia</div>
    <h2>${esc(x.from)} te recomienda este libro</h2><div class="bt">${esc(x.book.title)}</div>${x.book.author?`<div class="muted">${esc(x.book.author)}</div>`:''}
    ${x.msg?`<blockquote>«${esc(x.msg)}»</blockquote>`:''}${more?`<p class="muted" style="margin:10px 0 0">y ${pl(more,'sugerencia más','sugerencias más')} de tus amigos</p>`:''}
    <div class="reacts" style="margin-top:14px">${['thanks','love','meh'].map(r=>`<button class="rbtn" data-act="quickReact" data-id="${x.id}" data-r="${r}">${reactTxt(r)}</button>`).join('')}</div>
    <div class="df" style="justify-content:flex-start"><button class="btn primary" data-act="sugGo">Ver en sugerencias</button><button class="btn ghost" data-act="close">Ahora no</button></div></div></div>`;
  $('#dlgSug').showModal();
  cloud.sb.rpc('suggestion_update',{p_ids:nw.map(y=>y.id),p_status:'seen'}).then(()=>nw.forEach(y=>{y.seen=true}),()=>{});
}

/* ---------- Seguimiento de sugerencias ---------- */
const REACT={thanks:['🙏','¡Gracias!'],love:['❤️','Me apetece mucho','Me ha encantado'],like:['👍','Me apetece','Me ha gustado'],meh:['🤔','No es para mí','No era para mí']};
const reactTxt=(r,final)=>r&&REACT[r]?REACT[r][0]+' '+(final&&REACT[r][2]||REACT[r][1]):'';
function cleanSent(x){const b=cleanSug({...x,from_name:x.to_name});
  const ts=v=>String(v||'').slice(0,25);
  return {...b,to:b.from,seenAt:ts(x.seen_at),dismissed:x.status==='dismissed',added:x.status==='added',progAt:ts(x.progress_at),replyAt:ts(x.reply_at),finalAt:ts(x.final_at),fresh:!!x.fresh,
    prog:b.progress==='read'?'read':b.progress==='reading'?'reading':(b.progress==='want'||x.status==='added')?'want':x.seen_at?'seen':'sent'}}
const PROG={sent:['📨','Enviada'],seen:['👀','Vista'],want:['🔖','En su lista'],reading:['📖','Leyendo'],read:['✅','Leído']};
function sentEvent(x){ // la novedad más reciente de una sugerencia enviada, en una frase
  const t=`«${x.book.title}»`,ev=[[x.finalAt,'f'],[x.progAt,'p'],[x.replyAt,'r']].filter(e=>e[0]).sort((a,b)=>b[0].localeCompare(a[0]))[0];
  if(!ev) return '';
  if(ev[1]==='f') return `✅ ${x.to} ha terminado ${t}${x.rating?' '+stars(x.rating):''} — ${reactTxt(x.freaction,true)}${x.freply?` «${x.freply}»`:''}`;
  if(ev[1]==='r') return `${reactTxt(x.reaction)||'💬'} ${x.to} sobre ${t}${x.reply?`: «${x.reply}»`:''}`;
  return x.prog==='read'?`✅ ${x.to} ha terminado ${t}${x.rating?' '+stars(x.rating):''}`:x.prog==='reading'?`📖 ${x.to} ha empezado ${t}`:`🔖 ${x.to} ha añadido ${t} a su lista`;
}
function libBook(it){const k=norm(it.title),a=norm(it.author||'');return books.find(b=>norm(b.title)===k&&(!a||!norm(b.author)||norm(b.author)===a))}
let progBusy=false;
async function shareProgress(){ // comparte en qué punto vas con cada libro que te recomendaron (si no lo has desactivado)
  if(progBusy||!cloud.sb||cfg.shareProg===false)return; progBusy=true;
  try{for(const x of soc.sugs){const b=libBook(x.book),p=b?b.status:'',r=b&&b.status==='read'?(b.rating||0):0;
    if(p!==x.progress||r!==x.rating){const {error}=await cloud.sb.rpc('suggestion_progress',{p_id:x.id,p_progress:p,p_rating:r});if(!error){x.progress=p;x.rating=r}}}}
  catch{} finally{progBusy=false}
}
function sentNewsCard(){
  const fr=soc.sent.filter(x=>x.fresh);if(!cloud.user||!fr.length)return '';
  return `<div class="card news"><div class="newsh"><b>🎁 Novedades de tus recomendaciones</b><button class="x" data-act="sentSeen" title="Marcar como visto">×</button></div>
    ${fr.slice(0,3).map(x=>`<div class="newsi" data-work="${regW(x.book)}">${cover(x.book)}<span>${esc(sentEvent(x))}</span></div>`).join('')}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">${fr.length>3?`<span class="muted" style="font-size:13px;margin-right:auto;align-self:center">y ${pl(fr.length-3,'novedad más','novedades más')}</span>`:''}<button class="btn small primary" data-act="sentGo">Ver mis recomendaciones</button></div></div>`;
}
function markSentSeen(){const ids=soc.sent.filter(x=>x.fresh).map(x=>x.id);if(!ids.length||!cloud.sb)return;ids.forEach(id=>{const x=soc.sent.find(y=>y.id===id);if(x)x.fresh=false});cloud.sb.rpc('suggestions_sent_seen',{p_ids:ids}).then(()=>{},()=>{})}
function openReply(x,kind){
  replyTarget={id:x.id,kind,r:''};
  const opts=kind==='final'?['love','like','meh']:['thanks','love','meh'];
  $('#replyBody').innerHTML=`<div class="sgb">${cover(x.book)}<div><b>${esc(x.book.title)}</b><div class="muted">${kind==='final'?`Te lo recomendó ${esc(x.from)}`:`De ${esc(x.from)}`}</div></div></div>
    <label>${kind==='final'?`¿Le cuentas a ${esc(x.from)} qué te ha parecido?`:`¿Qué le dices a ${esc(x.from)}?`}</label>
    <div class="reacts">${opts.map(r=>`<button type="button" class="rbtn" data-act="pickReact" data-r="${r}">${reactTxt(r,kind==='final')}</button>`).join('')}</div>
    <label for="rp_text">Mensaje (opcional)</label><textarea id="rp_text" maxlength="280" placeholder="${kind==='final'?'¿Qué es lo que más te ha gustado?':'Escribe algo…'}"></textarea>
    <div class="df"><button class="btn ghost" data-act="close">${kind==='final'?'Ahora no':'Cancelar'}</button><button class="btn primary" data-act="replySend">Enviar</button></div>`;
  $('#dlgReply').showModal();
}
function needAccount(what){return emptyBox('🤝','Crea tu cuenta para '+what,'Los amigos y las sugerencias funcionan con una cuenta gratuita: así tus amigos pueden encontrarte y enviarte libros.','<button class="btn primary" data-act="login">Crear cuenta o iniciar sesión</button>')}
function viewFriends(){
  if(!cloud.user) return `<div class="vh"><h1>Amigos</h1></div>`+needAccount('tener amigos');
  if(cloud.needMfa) return `<div class="vh"><h1>Amigos</h1></div>`+emptyBox('🔐','Verifica tu acceso','Escribe el código de tu app de autenticación para ver a tus amigos.','<button class="btn primary" data-act="syncNow">Verificar</button>');
  const row=(r,btns,sub)=>`<div class="frow">${avatar(r.name||r.email,'')}<div class="fi"><b>${esc(r.name||r.email)}</b><span class="muted">${esc(sub)}</span></div><div class="fb">${btns}</div></div>`;
  const inc=soc.incoming.map(r=>row(r,`<button class="btn small primary" data-act="friendYes" data-id="${r.id}">Aceptar</button><button class="btn small ghost" data-act="friendNo" data-id="${r.id}">Rechazar</button>`,r.email+' quiere ser tu amigo')).join('');
  const fr=soc.friends.map(r=>row(r,`<button class="btn small ghost" data-act="friendDel" data-id="${r.id}" data-n="${esc(r.name)}">Eliminar</button>`,r.email)).join('');
  const out=soc.outgoing.map(r=>row({name:'',email:r.email},`<button class="btn small ghost" data-act="friendDel" data-id="${r.id}" data-out="1">Cancelar</button>`,'Solicitud enviada')).join('');
  return `<div class="vh"><h1>Amigos<small>${pl(soc.friends.length,'amigo')}</small></h1></div>
  ${cfg.name?'':`<div class="card fadd" style="border-color:color-mix(in srgb,var(--accent) 40%,var(--line))"><b>👋 Pon tu nombre</b><p class="muted" style="margin:4px 0 10px;font-size:14px">Así tus amigos sabrán quién les envía las sugerencias. Si no, verán la primera parte de tu correo.</p><button class="btn small primary" data-nav="profile">Ir a Perfil</button></div>`}
  <div class="card fadd"><b>Añadir un amigo</b><p class="muted" style="margin:4px 0 12px;font-size:14px">Escribe el correo con el que tu amigo usa Mi biblioteca. Cuando acepte, podréis sugeriros libros.</p>
    <div class="frm"><input type="email" id="f_email" placeholder="correo@ejemplo.com" maxlength="254" autocomplete="off" value="${esc(soc.draft||'')}"><button class="btn primary" data-act="friendAdd">Enviar solicitud</button></div>
    ${soc.msg?`<p class="fmsg ${soc.msgOk?'':'warn'}">${soc.msgOk?'✓ ':'⚠️ '}${esc(soc.msg)}</p>`:''}</div>
  ${inc?`<div class="sec"><div class="sech"><h2>Solicitudes recibidas</h2></div><div class="flist">${inc}</div></div>`:''}
  <div class="sec"><div class="sech"><h2>Tus amigos</h2></div>${fr?`<div class="flist">${fr}</div>`:`<div class="dashed">${soc.ok?'Todavía no tienes amigos. Envía una solicitud con su correo.':'Cargando…'}</div>`}</div>
  ${out?`<div class="sec"><div class="sech"><h2>Solicitudes enviadas</h2></div><div class="flist">${out}</div></div>`:''}
  ${soc.friends.length?'<p class="muted" style="font-size:14px">Para sugerir un libro, abre su ficha y pulsa «🎁 Sugerir a un amigo».</p>':''}`;
}
function fSugTile(x,i){const w=regW(x.book),own=inLib(x.book);
  return `<div class="tile" data-work="${w}" style="--i:${Math.min(i,24)}"><div class="cvw">${cover(x.book)}${x.status==='new'?'<span class="nbadge">Nueva</span>':''}<div class="tact">${own?'':`<button class="ib add" data-act="sugAdd" data-id="${x.id}" title="Quiero leerlo">＋</button>`}<button class="ib" data-act="sugDel" data-id="${x.id}" title="Descartar">✕</button></div></div>
  <div class="t">${esc(x.book.title)}</div><div class="a">${esc(x.book.author||'')}</div>${x.msg?`<div class="smsg" title="${esc(x.msg)}">💬 ${esc(x.msg)}</div>`:''}
  ${own?'<div class="tag">✓ En tu biblioteca</div>':`<button class="btn small" style="margin-top:8px" data-act="sugAdd" data-id="${x.id}">＋ Quiero leerlo</button>`}
  ${x.freaction||x.reaction?`<div class="myr">Tú: ${esc(reactTxt(x.freaction||x.reaction,!!x.freaction))}</div>`:`<button class="lnk" data-act="replyOpen" data-id="${x.id}" data-k="${libBook(x.book)?.status==='read'?'final':'first'}">💬 Responder a ${esc(x.from)}</button>`}</div>`}
function sugTabs(){const nNew=soc.sugs.filter(x=>x.status==='new').length,nFr=soc.sent.filter(x=>x.fresh).length;
  return `<div class="chips stabs"><button class="chip ${route.id!=='sent'?'on':''}" data-nav="sugs">Recibidas${nNew?` <b>${nNew}</b>`:''}</button><button class="chip ${route.id==='sent'?'on':''}" data-nav="sugs" data-id="sent">Enviadas${nFr?` <b>${nFr}</b>`:''}</button></div>`}
function viewSent(){
  const all=soc.sent;
  if(!all.length) return `<div class="vh"><h1>Sugerencias de amigos</h1></div>${sugTabs()}`+emptyBox('📨','Aún no has recomendado ningún libro','Abre la ficha de un libro de tu biblioteca y pulsa «🎁 Sugerir a un amigo». Aquí verás si lo ve, lo empieza y qué le parece.','<button class="btn" data-nav="lib">Ir a mi biblioteca</button>');
  const nq=norm(q),list=all.filter(x=>(!SF.from||x.to===SF.from)&&(!nq||norm([x.book.title,x.book.author,x.to,x.msg,x.reply,x.freply].join(' ')).includes(nq)));
  const uniq=[...new Set(all.map(x=>x.to))].sort((a,b)=>a.localeCompare(b,'es'));
  const bar=`<div class="fbar"><label class="fl ${SF.from?'act':''}"><span>Amigo</span><select data-sf="from"><option value="">Todos</option>${uniq.map(v=>`<option value="${esc(v)}" ${SF.from===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>${SF.from||q?'<button class="btn small ghost" data-act="clearSF">✕ Limpiar</button>':''}</div>`;
  const groups=new Map();for(const x of list){if(!groups.has(x.to))groups.set(x.to,[]);groups.get(x.to).push(x)}
  const tile=(x,i)=>{const w=regW(x.book),[ic,lb]=PROG[x.prog];
    return `<div class="tile" data-work="${w}" style="--i:${Math.min(i,24)}"><div class="cvw">${cover(x.book)}${x.fresh?'<span class="nbadge">Novedad</span>':''}</div>
    <div class="t">${esc(x.book.title)}</div><div class="a">${esc(x.book.author||'')}</div>
    <div class="pst p-${x.prog}">${ic} ${lb}${x.prog==='read'&&x.rating?` <span class="stars">${stars(x.rating)}</span>`:''}</div>
    ${x.reaction||x.reply?`<div class="smsg">${esc(reactTxt(x.reaction)||'💬')}${x.reply?` «${esc(x.reply)}»`:''}</div>`:''}
    ${x.freaction||x.freply?`<div class="smsg fin">Al terminar: ${esc(reactTxt(x.freaction,true)||'💬')}${x.freply?` «${esc(x.freply)}»`:''}</div>`:''}</div>`};
  const rows=[...groups].map(([to,l])=>`<div class="sec"><div class="sech sfh">${avatar(to,'')}<h2>${esc(to)}</h2><span class="libn">${pl(l.length,'libro')}</span></div><div class="hrow">${l.map(tile).join('')}</div></div>`).join('');
  return `<div class="vh"><h1>Sugerencias de amigos</h1></div>${sugTabs()}${fWrap(SF.from?1:0,'',bar)}`+(rows||emptyBox('🔎','Nada por aquí','Ninguna recomendación coincide con la búsqueda.','<button class="btn" data-act="clearSF">Limpiar filtros</button>'));
}
function viewSugs(){
  if(!cloud.user) return `<div class="vh"><h1>Sugerencias de amigos</h1></div>`+needAccount('recibir sugerencias');
  if(route.id==='sent'){const h=viewSent();if(soc.sent.some(x=>x.fresh))setTimeout(markSentSeen,1500);return h}
  const all=soc.sugs;
  if(!all.length) return `<div class="vh"><h1>Sugerencias de amigos</h1></div>${sugTabs()}`+emptyBox('🎁','Aún no tienes sugerencias','Cuando un amigo te recomiende un libro aparecerá aquí.','<button class="btn" data-nav="friends">Ver mis amigos</button>');
  const nq=norm(q),sel=(k,opts,allL,label)=>`<label class="fl ${SF[k]?'act':''}"><span>${label}</span><select data-sf="${k}"><option value="">${allL}</option>${opts.map(([v,t])=>`<option value="${esc(v)}" ${SF[k]===v?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
  const uniq=f=>[...new Set(all.map(f).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const list=all.filter(x=>(!SF.from||x.from===SF.from)&&(!SF.genre||x.book.genre===SF.genre)&&(!SF.author||x.book.author===SF.author)
    &&(!SF.st||(SF.st==='new'?x.status==='new':SF.st==='added'?inLib(x.book)||x.status==='added':!inLib(x.book)))
    &&(!nq||norm([x.book.title,x.book.author,x.book.genre,x.msg,x.from].join(' ')).includes(nq)));
  const n=Object.values(SF).filter(Boolean).length,any=n||q;
  const bar=`<div class="fbar">${sel('from',uniq(x=>x.from).map(v=>[v,v]),'Todos','Amigo')}${sel('st',[['new','Nuevas'],['pending','Aún no en mi biblioteca'],['added','Ya en mi biblioteca']],'Todas','Estado')}${sel('genre',uniq(x=>x.book.genre).map(v=>[v,v]),'Todos','Género')}${sel('author',uniq(x=>x.book.author).map(v=>[v,v]),'Todos','Autor')}${any?'<button class="btn small ghost" data-act="clearSF">✕ Limpiar</button>':''}</div>`;
  const groups=new Map();for(const x of list){if(!groups.has(x.from))groups.set(x.from,[]);groups.get(x.from).push(x)}
  const rows=[...groups].map(([from,l])=>{const nw=l.filter(x=>x.status==='new').length;
    return `<div class="sec"><div class="sech sfh">${avatar(from,'')}<h2>${esc(from)}</h2><span class="libn">${pl(l.length,'libro')}</span>${nw?`<span class="hotp">${pl(nw,'nueva','nuevas')}</span>`:''}</div><div class="hrow">${l.map((x,i)=>fSugTile(x,i)).join('')}</div></div>`}).join('');
  return `<div class="vh"><h1>Sugerencias de amigos</h1></div>${sugTabs()}${fWrap(n,'',bar)}`+
    (rows||emptyBox('🔎','Nada por aquí','Ninguna sugerencia coincide con la búsqueda o los filtros.','<button class="btn" data-act="clearSF">Limpiar filtros</button>'));
}
function openSuggest(book){
  if(!cloud.user){openLogin();return}
  if(!inLib(book)){toast('Solo puedes sugerir libros que tengas en tu biblioteca');return}
  sugTarget={title:book.title,author:book.author||'',cover:book.cover||'',key:book.key||'',akey:book.akey||'',year:String(book.year||''),pages:String(book.pages||''),genre:book.genre||''};
  const fr=soc.friends;
  $('#suggestBody').innerHTML=`<div class="sgb">${cover(sugTarget)}<div><b>${esc(sugTarget.title)}</b><div class="muted">${esc(sugTarget.author)}</div></div></div>`+
    (fr.length?`<label>¿A quién se lo recomiendas?</label><div class="pickf">${fr.map((f,i)=>`<label class="pf"><input type="checkbox" name="sgf" value="${esc(f.uid)}" ${fr.length===1?'checked':''}>${avatar(f.name,'')}<span>${esc(f.name)}</span></label>`).join('')}</div>
      <label for="sg_msg">Mensaje (opcional)</label><textarea id="sg_msg" maxlength="280" placeholder="¿Por qué se lo recomiendas?"></textarea>
      <div class="df"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn primary" data-act="sugSend">Enviar sugerencia</button></div>`
    :`<div class="dashed" style="margin-top:14px">Todavía no tienes amigos en Mi biblioteca.</div><div class="df"><button class="btn ghost" data-act="close">Cerrar</button><button class="btn primary" data-act="goFriends">Añadir amigos</button></div>`);
  $('#dlgSuggest').showModal();
}
function rpcErr(e){const m=e?.message||String(e);return /Failed to fetch|NetworkError|Load failed/i.test(m)?'No se ha podido conectar. Comprueba tu conexión.':m.length<120?m:'No se ha podido completar. Inténtalo de nuevo.'}
async function sendReply(act,a){
  const quick=act==='quickReact',id=quick?+a.dataset.id:replyTarget?.id,kind=quick?'first':replyTarget?.kind,r=quick?a.dataset.r:replyTarget?.r||'',t=quick?'':($('#rp_text')?.value||'').trim();
  if(!r&&!t){toast('Elige una reacción o escribe algo');return}
  a.disabled=true;
  try{const {error}=await cloud.sb.rpc('suggestion_reply',{p_id:id,p_kind:kind,p_reaction:r,p_text:t});if(error)throw error;
    const x=soc.sugs.find(y=>y.id===id);if(x){if(kind==='final'){x.freaction=r;x.freply=t}else{x.reaction=r;x.reply=t}}
    (quick?$('#dlgSug'):$('#dlgReply')).close();toast(`Respuesta enviada a ${x?x.from:'tu amigo'}`);track('sugerencia_respuesta',{tipo:kind});render()}
  catch(e){toast(rpcErr(e));a.disabled=false}
}
async function socAction(act,a){
  const sb=cloud.sb; if(!sb||!cloud.user)return;
  try{
    if(act==='friendAdd'){const e=($('#f_email')?.value||'').trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(e)){soc.msg='Escribe un correo válido.';soc.msgOk=false;soc.draft=e;render();return}
      const {data,error}=await sb.rpc('friend_request',{p_email:e});if(error)throw error;
      soc.msgOk=data==='ok'||data==='friends';
      soc.msg=data==='ok'?`Solicitud enviada a ${e}. Le aparecerá en la app y, cuando acepte, seréis amigos.`
        :data==='friends'?`¡Ya sois amigos! (${e} también te había enviado una solicitud)`
        :data==='pending'?`Ya le habías enviado una solicitud a ${e}. Falta que la acepte.`
        :data==='no_account'?`No hay ninguna cuenta con el correo ${e}. Revisa que esté bien escrito o pídele que se registre en Mi biblioteca.`:'Hecho.';
      soc.draft=(data==='ok'||data==='friends')?'':e;
      track('amigo_solicitud',{resultado:String(data)});await socLoad(false);render()}
    else if(act==='friendYes'||act==='friendNo'){const {error}=await sb.rpc('friend_respond',{p_id:+a.dataset.id,p_accept:act==='friendYes'});if(error)throw error;toast(act==='friendYes'?'¡Ahora sois amigos!':'Solicitud rechazada');await socLoad(false)}
    else if(act==='friendDel'){if(!confirm(a.dataset.out?'¿Cancelar esta solicitud?':`¿Eliminar a ${a.dataset.n||'este amigo'} de tus amigos?`))return;const {error}=await sb.rpc('friend_remove',{p_id:+a.dataset.id});if(error)throw error;await socLoad(false)}
    else if(act==='sugSend'){const ids=[...document.querySelectorAll('input[name=sgf]:checked')].map(i=>i.value);if(!ids.length){toast('Elige al menos un amigo');return}
      const msg=($('#sg_msg')?.value||'').trim().slice(0,280);a.disabled=true;
      for(const id of ids){const {error}=await sb.rpc('suggest_book',{p_to:id,p_book:sugTarget,p_msg:msg});if(error)throw error}
      $('#dlgSuggest').close();track('sugerencia_enviada',{amigos:ids.length});toast(ids.length>1?`Sugerencia enviada a ${ids.length} amigos`:'Sugerencia enviada')}
    else if(act==='sugAdd'||act==='sugDel'){const x=soc.sugs.find(y=>y.id===+a.dataset.id);if(!x)return;
      if(act==='sugAdd'&&!inLib(x.book)){books.push({id:uid(),added:Date.now(),title:x.book.title,author:x.book.author,genre:x.book.genre,pages:x.book.pages,cover:x.book.cover,status:'want',start:'',end:'',rating:0,summary:'',liked:'',notes:[]});save();toast(`«${x.book.title}» añadido a próximas lecturas`)}
      const st=act==='sugAdd'?'added':'dismissed';const {error}=await sb.rpc('suggestion_update',{p_ids:[x.id],p_status:st});if(error)throw error;
      if(st==='dismissed'){soc.sugs=soc.sugs.filter(y=>y!==x);toast('Sugerencia descartada')}else x.status='added';render()}
  }catch(e){const m=rpcErr(e);if(act==='friendAdd'){soc.msg=m;soc.msgOk=false;soc.draft=($('#f_email')?.value||'').trim();render()}else toast(m);if(a)a.disabled=false}
}

/* ---------- Sugerencias ---------- */
async function olq(params,n){
  const base=`https://openlibrary.org/search.json?${params}&limit=${n}&fields=key,title,author_name,author_key,cover_i,subject,number_of_pages_median,first_publish_year,language`;
  let r=await fetch(base);
  if(!r.ok&&/&sort=/.test(base)) r=await fetch(base.replace(/&sort=[^&]*/,''));
  if(!r.ok) throw new Error(r.status);
  return ((await r.json()).docs||[]).map(d=>({key:d.key||'',akey:(d.author_key||[])[0]||'',subjects:(d.subject||[]).slice(0,20),title:d.title,author:(d.author_name||[])[0]||'',year:d.first_publish_year||'',pages:d.number_of_pages_median||'',langs:(d.language||[]).filter(x=>/^[a-z]{3}$/.test(x)).slice(0,40),cover:d.cover_i?`https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`:'',genre:genreOf(d.subject)}));
}
const lookup=(title,author,n)=>{const e=encodeURIComponent;return olq(author?`title=${e(title)}&author=${e(author)}`:`q=${e(title)}`,n)};
function genreOf(subs){ if(!subs) return ''; const s=subs.slice(0,40).map(norm); for(const [k,g] of GMAP) if(s.some(x=>x===k||x.startsWith(k+' ')||x.endsWith(' '+k))) return g; for(const [k,g] of GMAP) if(s.some(x=>x.includes(k))) return g; return '' }
async function loadSug(force){
  const recent=books.filter(b=>b.status!=='want').sort(SORTS.recent).slice(0,8);
  const authors=[...new Set(recent.map(b=>b.author).filter(Boolean))].slice(0,3);
  const genres=[...new Set(recent.map(b=>b.genre).filter(g=>g&&GREV[g]))].slice(0,2);
  const sr=(cfg.searches||[]).slice(0,3);
  const key=authors.join('|')+'#'+genres.join('|')+'#'+sr.map(s=>s.q).join('|');
  if(!force&&sug.key===key) return;
  sug={key,state:authors.length+genres.length+sr.length?'loading':'empty',groups:[]};
  if(sug.state==='empty') return;
  const mine=sug,have=new Set(books.map(b=>norm(b.title))),seen=new Set(),e=encodeURIComponent;
  const pick=(docs,g)=>docs.filter(d=>{const k=norm(d.title);if(!d.cover||have.has(k)||seen.has(k))return false;seen.add(k);return true}).slice(0,14).map(d=>({...d,genre:d.genre||g||''}));
  let fails=0;
  for(const s of sr){ try{
      const docs=s.author?await olq(`author=${e(s.author)}&sort=already_read`,30):s.genre&&GREV[s.genre]?await olq(`subject=${e(GREV[s.genre])}&sort=already_read`,40):await olq(`q=${e(s.q)}`,20);
      mine.groups.push({kind:'search',title:`Porque buscaste «${s.q}»`,items:pick(docs.filter(d=>norm(d.title)!==norm(s.title)),s.genre)}) }catch{fails++} }
  for(const a of authors){ try{mine.groups.push({kind:'read',title:`Más de ${a}`,items:pick(await olq(`author=${e(a)}&sort=already_read`,30))})}catch{fails++} }
  for(const g of genres){ try{mine.groups.push({kind:'read',title:`Porque lees ${g.toLowerCase()}`,items:pick(await olq(`subject=${e(GREV[g])}&sort=already_read`,40),g)})}catch{fails++} }
  if(sug!==mine) return;
  sug.state=mine.groups.some(g=>g.items.length)?'done':(fails?'error':'empty');
  if(route.v==='home'||route.v==='discover') render();
}

/* ---------- Ficha ---------- */
function openBook(id,focusNote){ current=id; editNote=null; renderBook(); const d=$('#dlgBook'); if(!d.open) d.showModal(); if(focusNote) setTimeout(()=>$('#n_text')?.focus(),60) }
function renderBook(){
  const b=get(current); if(!b){ if($('#dlgBook').open) $('#dlgBook').close(); return }
  const st={reading:'Leyendo',read:'Leído',want:'Próxima lectura'}[b.status];
  let when='';
  if(b.start&&b.end) when=`${fmt(b.start)} → ${fmt(b.end)}`;
  else if(b.end) when=b.end.length===4?`Leído en ${b.end}`:`Terminado el ${fmt(b.end)}`;
  else if(b.start) when=`Desde el ${fmt(b.start)}`;
  if(days(b)) when+=` (${pl(days(b),'día')})`;
  const notes=[...b.notes].sort((x,y)=>(x.page||1e9)-(y.page||1e9));
  const en=editNote&&b.notes.find(n=>n.id===editNote);
  const pct=b.pages&&b.current?Math.min(100,Math.round(b.current/b.pages*100)):0;
  $('#bookBody').innerHTML=`<div class="bk">${cover(b)}<div class="main">
    <h2>${esc(b.title)}</h2><div class="au">${b.author?`<a data-act="openAuthor" data-n="${esc(b.author)}" title="Ver perfil del autor">${esc(b.author)}</a>`:'Autor desconocido'}</div>
    <div class="pills"><span class="pill st">${st}</span>${b.genre?`<button class="pill" data-act="pickGenre" data-g="${esc(b.genre)}" title="Ver libros de este género">${esc(b.genre)}</button>`:''}${b.pages?`<span class="pill">${b.pages} págs.</span>`:''}${when?`<span class="pill">${when}</span>`:''}</div>
    ${b.status==='read'?`<div class="rate">${[1,2,3,4,5].map(n=>`<button data-act="rate" data-n="${n}" class="${n<=(b.rating||0)?'on':''}" title="${n}">★</button>`).join('')}</div>`:''}
    ${b.status==='reading'?`<div class="prog" style="max-width:420px">Pág. <input type="number" min="0" data-cur="${b.id}" value="${b.current||''}" placeholder="0">${b.pages?`<span>de ${b.pages}</span><div class="bar"><i style="width:${pct}%"></i></div><b>${pct}%</b>`:''}</div>`:''}
    <div class="acts">
      ${b.status==='reading'?`<button class="btn small primary" data-act="finish" data-id="${b.id}">Finalizar lectura</button>`:''}
      ${b.status==='want'?'<button class="btn small primary" data-act="start">Empezar a leer</button>':''}
      <button class="btn small" data-act="fullWork">Ficha completa</button>
      ${cloud.user?'<button class="btn small" data-act="suggestCur">🎁 Sugerir a un amigo</button>':''}
      <button class="btn small" data-act="edit">Editar</button>
      ${!b.cover||!b.author||!b.genre?'<button class="btn small" data-act="auto">Autocompletar ficha</button>':''}
      <button class="btn small danger" data-act="del">Eliminar</button>
    </div>
    <div class="lists"><span class="muted">Listas:</span>
      <button class="chip ${b.fav?'on':''}" data-act="favCur">♥ Favoritos</button>
      ${b.status==='read'?`<button class="chip ${b.reread?'on':''}" data-act="reread">↻ Para releer</button>`:''}
      ${cfg.lists.map(l=>`<button class="chip ${l.ids.includes(b.id)?'on':''}" data-act="toggleList" data-id="${l.id}">${esc(l.name)}</button>`).join('')}
      <button class="chip dash" data-act="newList" data-book="1">＋ Nueva lista</button></div>
    </div></div>
    <h4>Notas</h4>
    <div class="noteform"><input type="number" id="n_page" min="1" placeholder="Pág." value="${en?.page||''}"><textarea id="n_text" placeholder="Escribe un apunte… (Intro para guardar, Mayús+Intro para salto de línea)">${esc(en?.text||'')}</textarea><label class="check" style="margin:12px 0 0"><input type="checkbox" id="n_quote" ${en?.quote?'checked':''}>Cita</label><button class="btn primary" data-act="saveNote">${en?'Guardar':'Añadir'}</button></div>
    <div>${notes.filter(n=>n.id!==editNote).map(n=>`<div class="note ${n.quote?'q':''}"><div class="pg">${n.page?'p. '+n.page:'—'}</div><div class="tx">${esc(n.text)}</div><div class="na"><button data-act="quoteNote" data-id="${n.id}" class="${n.quote?'on':''}" title="${n.quote?'Quitar de citas':'Marcar como cita'}">❝</button><button data-act="editNote" data-id="${n.id}" title="Editar">✎</button><button data-act="delNote" data-id="${n.id}" title="Borrar">✕</button></div></div>`).join('')||(en?'':'<p class="muted" style="font-size:14px">Aún no hay notas. Apunta la página y lo que quieras recordar.</p>')}</div>
    ${b.status==='read'?`<h4>Resumen</h4><textarea data-field="summary" placeholder="¿De qué va? ¿Qué te llevas?">${esc(b.summary||'')}</textarea>
    <h4>Lo que me ha gustado</h4><textarea data-field="liked" placeholder="Personajes, ideas, frases…">${esc(b.liked||'')}</textarea>`:''}`;
}
function saveNote(){
  const b=get(current),text=$('#n_text').value.trim(),page=parseInt($('#n_page').value)||null,quote=$('#n_quote').checked;
  if(!text){$('#n_text').focus();return}
  if(editNote){const n=b.notes.find(n=>n.id===editNote);if(n){n.text=text;n.page=page;n.quote=quote}editNote=null}
  else b.notes.push({id:uid(),page,text,quote,date:today()});
  save();renderBook();render();$('#n_text').focus();
}
function removeBook(id){
  const i=books.findIndex(b=>b.id===id); if(i<0) return; const [b]=books.splice(i,1);
  if($('#dlgBook').open) $('#dlgBook').close();
  save();render();
  toast(`«${b.title}» eliminado`,{label:'Deshacer',fn:()=>{books.splice(Math.min(i,books.length),0,b);save();render();toast('Libro recuperado')}});
}

/* ---------- Formulario ---------- */
function syncForm(){const s=$('#form').st.value;$('#w_start').hidden=s==='want';$('#w_end').hidden=s!=='read'}
function openForm(id,preset){
  editing=id||null;const b=id?get(id):null;const f=$('#form');f.reset();
  $('#formTitle').textContent=b?'Editar libro':preset==='want'?'Añadir a próximas lecturas':'Añadir libro';$('#formOk').textContent=b?'Guardar':'Añadir';
  $('#f_title').value=b?.title||'';$('#f_author').value=b?.author||'';$('#f_genre').value=b?.genre||'';
  $('#f_pages').value=b?.pages||'';$('#f_cover').value=b?.cover||'';f.st.value=b?.status||preset||'reading';
  $('#f_start').value=b?(b.start?.length===10?b.start:''):today();$('#f_end').value=b?.end?.length===10?b.end:'';
  $('#w_cover').hidden=!b;$('#suggList').hidden=true;syncForm();$('#dlgForm').showModal();$('#f_title').focus();
}
$('#f_status').addEventListener('change',syncForm);
$('#form').addEventListener('submit',e=>{
  e.preventDefault();const s=e.target.st.value;
  const d={title:$('#f_title').value.trim(),author:$('#f_author').value.trim(),genre:$('#f_genre').value.trim(),pages:parseInt($('#f_pages').value)||'',cover:$('#f_cover').value.trim(),status:s};
  if(!d.title) return;
  const b=editing?get(editing):null;
  d.start=s==='want'?'':($('#f_start').value||(b?.start?.length===4?b.start:''));
  d.end=s==='read'?($('#f_end').value||(b?.end?.length===4?b.end:'')):'';
  if(!b) track('libro_añadido',{estado:s}); if(b) Object.assign(b,d); else books.push({id:uid(),added:Date.now(),rating:0,summary:'',liked:'',notes:[],...d});
  save();render();$('#dlgForm').close();
  if(b) renderBook(); else toast(s==='reading'?'¡Buena lectura!':s==='want'?'Añadido a próximas lecturas':'Libro añadido');
});
let st,sugg=[],seq=0;
$('#f_title').addEventListener('input',e=>{
  clearTimeout(st);const v=e.target.value.trim(),ul=$('#suggList');
  if(v.length<3){ul.hidden=true;return}
  st=setTimeout(async()=>{const my=++seq;try{const r=await lookup(v,'',6);if(my!==seq)return;sugg=r;
    ul.innerHTML=r.map((s,i)=>`<li data-i="${i}">${s.cover?`<img src="${esc(s.cover.replace('-M.','-S.'))}" alt="">`:'<span class="ph"></span>'}<div><b>${esc(s.title)}</b><small>${esc([s.author,s.year].filter(Boolean).join(' · '))}</small></div></li>`).join('');
    ul.hidden=!r.length}catch{ul.hidden=true}},400);
});
$('#suggList').addEventListener('click',e=>{const li=e.target.closest('li');if(!li)return;const s=sugg[+li.dataset.i];
  $('#f_title').value=s.title;$('#f_author').value=s.author;if(s.genre)$('#f_genre').value=s.genre;if(s.pages)$('#f_pages').value=s.pages;$('#f_cover').value=s.cover;$('#suggList').hidden=true});
$('#f_title').addEventListener('blur',()=>setTimeout(()=>$('#suggList').hidden=true,200));

async function enrich(list){
  let ok=0,i=0,fail=0;
  for(const b of list){
    i++;if(list.length>1) toast(`Completando fichas… ${i}/${list.length}`,{keep:true});
    try{
      let r=await lookup(b.title,b.author,1); if(!r.length&&b.author) r=await lookup(b.title,'',1);
      const d=r[0];
      if(d){ if(!b.author)b.author=d.author; if(!b.genre)b.genre=d.genre; if(!b.pages)b.pages=d.pages; if(!b.cover)b.cover=d.cover; ok++; save(); if(i%5===0) render() }
    }catch{ if(++fail>=3) break }
    await new Promise(r=>setTimeout(r,250));
  }
  save();render();if($('#dlgBook').open)renderBook();
  toast(fail>=3?'No hay conexión: las fichas se han quedado sin completar':(ok?`${ok} ficha${ok===1?' completada':'s completadas'}`:'No se ha encontrado información'));
}

/* ---------- Finalizar ---------- */
function drawFinRate(){$('#e_rate').innerHTML=[1,2,3,4,5].map(n=>`<button type="button" data-act="finRate" data-n="${n}" class="${n<=finRating?'on':''}">★</button>`).join('')}
function openFinish(id){current=id;const b=get(id);finRating=b.rating||0;$('#finName').textContent=b.title+(b.author?' — '+b.author:'');$('#e_end').value=today();$('#e_summary').value=b.summary||'';$('#e_liked').value=b.liked||'';drawFinRate();if($('#dlgBook').open)$('#dlgBook').close();$('#dlgFinish').showModal()}
$('#finForm').addEventListener('submit',e=>{e.preventDefault();const b=get(current);
  Object.assign(b,{status:'read',end:$('#e_end').value||today(),rating:finRating,summary:$('#e_summary').value.trim(),liked:$('#e_liked').value.trim()});
  if(b.pages) b.current=b.pages;
  track('libro_terminado');save();render();$('#dlgFinish').close();toast('¡Enhorabuena! Guardado en leídos 🎉');
  const sg=cloud.user&&soc.sugs.find(x=>!x.freaction&&!x.freply&&libBook(x.book)===b);
  if(sg) setTimeout(()=>{if(!document.querySelector('dialog[open]'))openReply(sg,'final')},900);
  if(cloud.user) setTimeout(()=>shareProgress(),300)});

/* ---------- Listas ---------- */
function openList(id,addBook){ listEdit={id:id||null,addBook:addBook||null}; const l=id&&cfg.lists.find(l=>l.id===id);
  $('#listTitle').textContent=l?'Renombrar lista':'Nueva lista';$('#listOk').textContent=l?'Guardar':'Crear';$('#l_name').value=l?.name||'';$('#dlgList').showModal();$('#l_name').focus() }
$('#listForm').addEventListener('submit',e=>{e.preventDefault();const name=$('#l_name').value.trim();if(!name)return;
  $('#dlgList').close();
  if(listEdit.id){cfg.lists.find(l=>l.id===listEdit.id).name=name;save();render();return}
  const l={id:uid(),name,ids:listEdit.addBook?[listEdit.addBook]:[]};cfg.lists.push(l);save();
  if(listEdit.addBook){render();renderBook();toast(`Añadido a «${name}»`)} else {go('list',l.id);toast('Lista creada. Añade libros desde su ficha.')}});

/* ---------- Importar ---------- */
function showPreview(list,src){
  impBooks=list;const p=$('#impPrev');
  p.hidden=!list.length;p.innerHTML=list.slice(0,200).map(b=>`<div><b>${esc(b.title)}</b><span>${esc([b.author,b.genre,b.end&&fmt(b.end)].filter(Boolean).join(' · '))}</span></div>`).join('');
  $('#impInfo').textContent=list.length?`${pl(list.length,'libro detectado','libros detectados')}${src?' en '+src:''}.`:(src?'No se ha encontrado ningún libro en '+src+'.':'');
  $('#impOk').disabled=!list.length;$('#impOk').textContent=list.length?`Importar ${list.length}`:'Importar';
}
async function readFile(file){
  try{
    let rows;const n=file.name.toLowerCase();
    if(n.endsWith('.xlsx')) rows=await xlsxRows(await file.arrayBuffer());
    else if(n.endsWith('.xls')) throw new Error('El formato .xls antiguo no está soportado: guárdalo como .xlsx o .csv');
    else{const t=await file.text();rows=(n.endsWith('.csv')||n.endsWith('.tsv')||t.includes('\t'))?parseCSV(t):parseLines(t)}
    $('#impText').value='';showPreview(rowsToBooks(rows),file.name);
  }catch(err){showPreview([]);$('#impInfo').textContent='No se ha podido leer el archivo. '+(err.message||'')}
}
$('#drop').addEventListener('click',()=>$('#impFile').click());
$('#impFile').addEventListener('change',e=>{if(e.target.files[0])readFile(e.target.files[0]);e.target.value=''});
['dragover','dragleave','drop'].forEach(ev=>$('#drop').addEventListener(ev,e=>{e.preventDefault();$('#drop').classList.toggle('over',ev==='dragover');if(ev==='drop'&&e.dataTransfer.files[0])readFile(e.dataTransfer.files[0])}));
$('#impText').addEventListener('input',e=>{const t=e.target.value;showPreview(rowsToBooks(t.includes('\t')?parseCSV(t):parseLines(t)))});
function doImport(){
  const stt=$('#impStatus').value,added=[];let dup=0;
  for(const d of impBooks){
    const k=norm(d.title),a=norm(d.author);
    if(books.some(b=>norm(b.title)===k&&(!a||!norm(b.author)||norm(b.author)===a))){dup++;continue}
    const b={id:uid(),added:Date.now(),title:d.title,author:d.author||'',genre:d.genre||'',pages:d.pages||'',cover:'',status:stt,start:stt==='read'?(d.start||''):'',end:stt==='read'?(d.end||''):'',rating:d.rating||0,summary:d.summary||'',liked:'',notes:[]};
    books.push(b);added.push(b);
  }
  track('importacion',{libros:added.length});save();$('#dlgImport').close();go(stt==='want'?'list':'lib',stt==='want'?'want':undefined);
  toast(`${pl(added.length,'libro importado','libros importados')}${dup?` (${dup} ya estaban)`:''}`);
  if($('#impAuto').checked&&added.length) setTimeout(()=>enrich(added),900);
}

/* ---------- Copia de seguridad ---------- */
function exportData(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({books,cfg},null,1)],{type:'application/json'}));a.download=`biblioteca-${today()}.json`;a.click();try{localStorage.setItem('biblioteca.lastBackup',String(Date.now()))}catch{} toast('Copia guardada en tu carpeta de descargas');if(route.v==='home')render()}
$('#restoreFile').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{if(f.size>20e6)throw 0;const raw=JSON.parse(await f.text());const d=Array.isArray(raw)?raw:raw&&raw.books;if(!Array.isArray(d)||!d.length)throw 0;
    const old={books,cfg};
    books=cleanBooks(d);if(!books.length)throw 0;
    cfg={...cleanCfg(Array.isArray(raw)?{}:(raw.cfg||{favs:raw.favs,goals:raw.goals})),theme:cfg.theme};
    save();go('home');toast(`Copia restaurada (${pl(books.length,'libro')})`,{label:'Deshacer',fn:()=>{books=old.books;cfg=old.cfg;save();render(true)}})}
  catch{toast('Ese archivo no es una copia válida')}});

/* ---------- Buscador ---------- */
function showQS(){
  const nq=norm(q),el=$('#qs'); if(nq.length<2||ONLINE.includes(route.v)){el.hidden=true;return}
  const au=[...new Set(books.map(b=>b.author).filter(a=>a&&norm(a).includes(nq)))].slice(0,4);
  const ge=[...new Set(books.map(b=>b.genre).filter(g=>g&&norm(g).includes(nq)))].slice(0,4);
  el.innerHTML=au.map(a=>`<button data-act="pickAuthor" data-k="${esc(norm(a))}">✍️ Libros de <b>${esc(a)}</b></button>`).join('')+ge.map(g=>`<button data-act="pickGenre" data-g="${esc(g)}">🏷 Género <b>${esc(g)}</b></button>`).join('');
  el.hidden=!(au.length+ge.length);
}
$('#q').addEventListener('input',e=>{q=e.target.value;
  if(ONLINE.includes(route.v)){
    if(q.trim()){ if(route.v!=='search'){prevRoute=route;route={v:'search'}} runCat() }
    else if(route.v==='search') route=prevRoute;
    $('#qs').hidden=true;render();return }
  if(route.v==='profile'){route={v:'lib'};status='all'}
  render();showQS()});
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter'&&route.v==='search')recSearch()});
$('#q').addEventListener('blur',()=>{if(route.v==='search'&&cat.state==='done')recSearch();setTimeout(()=>$('#qs').hidden=true,200)});
$('#q').addEventListener('focus',showQS);
function clearQ(){q='';$('#q').value='';$('#qs').hidden=true}

/* ---------- Eventos ---------- */
document.addEventListener('click',e=>{
  if(e.target.id==='scrim'||e.target.closest('aside .navi')) document.body.classList.remove('menu');
  const a=e.target.closest('[data-act]');
  if(a){
    const act=a.dataset.act,b=get(current);
    if(act==='menu') document.body.classList.toggle('menu');
    else if(act==='add') openForm();
    else if(act==='addWant') openForm(null,'want');
    else if(act==='import'){$('#impText').value='';showPreview([]);$('#dlgImport').showModal()}
    else if(act==='doImport') doImport();
    else if(act==='export') exportData();
    else if(act==='install'){ if(installEvt){installEvt.prompt();installEvt.userChoice.then(c=>{if(c.outcome==='accepted')$('#bInstall').hidden=true});installEvt=null} else showInstallHelp() }
    else if(act==='restore') $('#restoreFile').click();
    else if(act==='close') a.closest('dialog').close();
    else if(['friendAdd','friendYes','friendNo','friendDel','sugSend','sugAdd','sugDel'].includes(act)) socAction(act,a);
    else if(act==='suggestCur'){const b=get(current);if(b){$('#dlgBook').close();openSuggest(b)}}
    else if(act==='suggestOwn'){const b=get(a.dataset.id);if(b)openSuggest(b)}
    else if(act==='sugGo'){$('#dlgSug').close();go('sugs')}
    else if(act==='sentGo'){go('sugs','sent')}
    else if(act==='sentSeen'){markSentSeen();render()}
    else if(act==='replyOpen'){const x=soc.sugs.find(y=>y.id===+a.dataset.id);if(x)openReply(x,a.dataset.k==='final'?'final':'first')}
    else if(act==='pickReact'){replyTarget.r=replyTarget.r===a.dataset.r?'':a.dataset.r;document.querySelectorAll('#replyBody .rbtn').forEach(b=>b.classList.toggle('on',b.dataset.r===replyTarget.r))}
    else if(act==='replySend'||act==='quickReact') sendReply(act,a);
    else if(act==='goFriends'){$('#dlgSuggest').close();go('friends')}
    else if(act==='toastAct'){const f=toastFn;toastFn=null;$('#toast').classList.remove('on');f&&f()}
    else if(act==='theme'){cfg.theme=applyTheme()==='dark'?'light':'dark';save();render()}
    else if(act==='setTheme'){cfg.theme=a.dataset.t==='auto'?'':a.dataset.t;save();render()}
    else if(act==='status'){status=a.dataset.s;render(true)}
    else if(act==='clearF'){F=emptyF();status='all';clearQ();render(true)}
    else if(act==='clearSF'){SF={from:'',genre:'',author:'',st:''};clearQ();render(true)}
    else if(act==='ftog'){fOpen=!fOpen;render()}
    else if(act==='fav'){const k=a.dataset.k;cfg.favs=cfg.favs.includes(k)?cfg.favs.filter(x=>x!==k):[...cfg.favs,k];save();render()}
    else if(act==='pickAuthor'){F=emptyF();F.author=a.dataset.k;status='all';clearQ();if($('#dlgBook').open)$('#dlgBook').close();go('lib')}
    else if(act==='pickGenre'){F=emptyF();F.genre=a.dataset.g;status='all';clearQ();if($('#dlgBook').open)$('#dlgBook').close();go('lib')}
    else if(act==='random'){const pool=books.filter(x=>x.status==='want'||x.reread);if(!pool.length){openForm(null,'want');toast('Aún no tienes próximas lecturas: añade alguna y te propongo una al azar')}else{openBook(pool[Math.floor(Math.random()*pool.length)].id);toast('¿Qué tal este?')}}
    else if(act==='reloadSug'){loadSug(true);render()}
    else if(act==='back'){ if(hist.length) history.back(); else go('home') }
    else if(act==='openAuthor'){ if($('#dlgBook').open)$('#dlgBook').close(); go('author',null,{name:a.dataset.n,key:a.dataset.k||''}) }
    else if(act==='authorBooks'){F=emptyF();F.author=a.dataset.k;status=a.dataset.s||'all';clearQ();go('lib')}
    else if(act==='addW'){const it=REG[+a.dataset.w],s=a.dataset.s;if(it&&!inLib(it)){if(route.v==='search')recSearch(it);track('libro_añadido',{estado:s,origen:route.v});books.push({id:uid(),added:Date.now(),title:it.title,author:it.author||'',genre:it.genre||'',pages:it.pages||'',cover:it.cover||'',status:s,start:s==='reading'?today():'',end:'',rating:0,summary:'',liked:'',notes:[]});save();render();toast(`«${it.title}» añadido a ${s==='want'?'próximas lecturas':s==='reading'?'«Leyendo ahora»':'leídos'}`)}}
    else if(act==='redoSearch'){q=a.dataset.q;$('#q').value=q;prevRoute=route;route={v:'search'};runCat();render(true)}
    else if(act==='addSug'){const g=sug.groups[+a.dataset.g],it=g&&g.items[+a.dataset.i];if(it){g.items.splice(+a.dataset.i,1);books.push({id:uid(),added:Date.now(),title:it.title,author:it.author,genre:it.genre||'',pages:it.pages||'',cover:it.cover,status:'want',start:'',end:'',rating:0,summary:'',liked:'',notes:[]});save();render();toast(`«${it.title}» añadido a próximas lecturas`)}}
    else if(act==='addCat'){const it=cat.items[+a.dataset.i],s=a.dataset.s;if(it){recSearch(it);books.push({id:uid(),added:Date.now(),title:it.title,author:it.author,genre:it.genre||'',pages:it.pages||'',cover:it.cover,status:s,start:s==='reading'?today():'',end:'',rating:0,summary:'',liked:'',notes:[]});save();render();toast(`«${it.title}» añadido a ${s==='want'?'próximas lecturas':s==='reading'?'«Leyendo ahora»':'leídos'}`)}}
    else if(act==='clearSearches'){cfg.searches=[];save();render();toast('Historial de búsquedas borrado')}
    else if(act==='newList') openList(null,a.dataset.book?current:null);
    else if(act==='renameList') openList(route.id);
    else if(act==='delList'){const i=cfg.lists.findIndex(l=>l.id===route.id);if(i>=0){const [l]=cfg.lists.splice(i,1);save();go('lib');toast(`Lista «${l.name}» eliminada`,{label:'Deshacer',fn:()=>{cfg.lists.splice(i,0,l);save();go('list',l.id)}})}}
    else if(act==='toggleList'){const l=cfg.lists.find(l=>l.id===a.dataset.id);l.ids=l.ids.includes(current)?l.ids.filter(x=>x!==current):[...l.ids,current];save();renderBook();render()}
    else if(act==='unlist'){const l=cfg.lists.find(l=>l.id===route.id);if(l){l.ids=l.ids.filter(x=>x!==a.dataset.id);save();render()}}
    else if(act==='goalStep'||act==='goalSet'){const y=curYear(),g=+cfg.goals[y]||0;cfg.goals[y]=Math.max(0,Math.min(999,act==='goalSet'?+a.dataset.v:g+(+a.dataset.d)));save();render()}
    else if(act==='consent'){setConsent(a.dataset.v)}
    else if(act==='login'){openLogin()}
    else if(act==='backupLater'){try{localStorage.setItem('biblioteca.backupHide',String(Date.now()+7*864e5))}catch{} render()}
    else if(act==='signupLater'){try{localStorage.setItem('biblioteca.signupHide',String(Date.now()+7*864e5))}catch{} render()}
    else if(act==='google'){signInGoogle()}
    else if(act==='sendMail'){sendMagic()}
    else if(act==='verifyCode'){verifyCode()}
    else if(act==='loginBack'){loginState={step:'start'};renderLogin()}
    else if(act==='haveCode'){const email=($('#l_email')?.value||'').trim();if(!/^\S+@\S+\.\S+$/.test(email)){loginState={step:'start',email,err:'Escribe primero tu correo.'}}else loginState={step:'code',email};renderLogin()}
    else if(act==='syncNow'){if(cloud.needMfa){mfaState={step:'challenge'};renderMfa();$('#dlgMfa').showModal()}else cloudSync(true)}
    else if(act==='mfaOn'){mfaEnroll()}
    else if(act==='mfaCopy'){navigator.clipboard?.writeText(mfaState.secret||'').then(()=>toast('Clave copiada'),()=>toast('No se ha podido copiar'))}
    else if(act==='mfaOff'){mfaDisable()}
    else if(act==='mfaVerify'){mfaVerify()}
    else if(act==='mfaCancel'){$('#dlgMfa').close();toast('Sin verificar no se sincroniza. Puedes hacerlo desde Perfil.')}
    else if(act==='logout'){logout()}
    else if(act==='delAccount'){deleteAccount()}
    else if(act==='authorTab'){authorTab=a.dataset.s;render(true)}
    else if(act==='favBook'){const x=get(a.dataset.id);if(x){x.fav=!x.fav;save();render();toast(x.fav?`«${x.title}» en favoritos ♥`:'Quitado de favoritos')}}
    else if(act==='delBook') removeBook(a.dataset.id);
    else if(act==='note') openBook(a.dataset.id,true);
    else if(act==='finish') openFinish(a.dataset.id);
    else if(act==='finRate'){finRating=finRating===+a.dataset.n?0:+a.dataset.n;drawFinRate()}
    else if(!b) return;
    else if(act==='rate'){b.rating=b.rating===+a.dataset.n?0:+a.dataset.n;save();renderBook();render()}
    else if(act==='start'){b.status='reading';b.start=today();b.end='';save();render();renderBook();toast('¡Buena lectura!')}
    else if(act==='favCur'){b.fav=!b.fav;save();renderBook();render();toast(b.fav?'Añadido a favoritos ♥':'Quitado de favoritos')}
    else if(act==='reread'){b.reread=!b.reread;save();renderBook();render()}
    else if(act==='edit') openForm(current);
    else if(act==='fullWork'){$('#dlgBook').close();go('work',null,{it:{title:b.title,author:b.author,cover:b.cover,pages:b.pages,genre:b.genre}})}
    else if(act==='auto'){toast('Buscando…',{keep:true});enrich([b])}
    else if(act==='del') removeBook(current);
    else if(act==='saveNote') saveNote();
    else if(act==='editNote'){editNote=a.dataset.id;renderBook();$('#n_text').focus()}
    else if(act==='delNote'){b.notes=b.notes.filter(n=>n.id!==a.dataset.id);save();renderBook();render()}
    else if(act==='quoteNote'){const n=b.notes.find(n=>n.id===a.dataset.id);n.quote=!n.quote;save();renderBook();render()}
    return;
  }
  if(e.target.matches&&e.target.matches('input,select,textarea,label')) return;
  const n=e.target.closest('[data-nav]'); if(n&&n.dataset.nav){ if(n.dataset.nav!=='lib'&&n.dataset.nav!=='list'){} F=emptyF();status='all';clearQ(); go(n.dataset.nav,n.dataset.id); return }
  const wk=e.target.closest('[data-work]'); if(wk){go('work',null,{it:REG[+wk.dataset.work]});return}
  const o=e.target.closest('[data-open]'); if(o){openBook(o.dataset.open);return}
  if(e.target.tagName==='DIALOG'&&!['dlgForm','dlgFinish','dlgMfa'].includes(e.target.id)) e.target.close();
});
document.addEventListener('change',e=>{
  const t=e.target; if(!t.closest||(!t.closest('#view')&&!t.closest('#bookBody'))) return;
  if(t.dataset.f){F[t.dataset.f]=t.dataset.f==='rating'?+t.value:t.value;render()}
  else if(t.dataset.sf){SF[t.dataset.sf]=t.value;render()}
  else if(t.id==='sort'){sort=t.value;render()}
  else if(t.id==='statYear'){statYear=t.value;render()}
  else if(t.id==='goalIn'){cfg.goals[curYear()]=Math.max(0,parseInt(t.value)||0);save();render()}
  else if(t.id==='consentChk'){setConsent(t.checked?'yes':'no')}
  else if(t.id==='shareChk'){cfg.shareProg=t.checked;save();toast(t.checked?'Tus amigos verán cómo vas con los libros que te recomienden':'Ya no se compartirá cómo vas con los libros recomendados')}
  else if(t.id==='pName'){cfg.name=t.value.trim();save();render()}
  else if(t.dataset.cur){const b=get(t.dataset.cur);if(b){b.current=Math.max(0,parseInt(t.value)||0);if(b.pages&&b.current>b.pages)b.current=b.pages;save();render();if($('#dlgBook').open)renderBook()}}
});
$('#bookBody').addEventListener('input',e=>{const f=e.target.dataset.field;if(f){get(current)[f]=e.target.value;save()}});
$('#bookBody').addEventListener('keydown',e=>{if(e.target.id==='n_text'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();saveNote()}});
let installEvt=null;
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
/* El botón se ve siempre que la app no esté abierta como instalada; si el navegador no ofrece instalar directamente, explica cómo hacerlo */
if(location.protocol.startsWith('http')&&!isStandalone()) $('#bInstall').hidden=false;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;$('#bInstall').hidden=false});
function showInstallHelp(){
  const ua=navigator.userAgent,ios=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1),android=/Android/.test(ua),safari=/Safari/.test(ua)&&!/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  const steps=ios?(safari?['Pulsa el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).','Elige <b>«Añadir a pantalla de inicio»</b>.','Pulsa <b>«Añadir»</b>.']:['Abre esta página en <b>Safari</b>: en iPhone solo se puede instalar desde Safari.','Pulsa <b>Compartir</b> → <b>«Añadir a pantalla de inicio»</b>.'])
    :android?['Pulsa el menú <b>⋮</b> de Chrome (arriba a la derecha).','Elige <b>«Instalar aplicación»</b> o <b>«Añadir a pantalla de inicio»</b>.']
    :['Mira a la derecha de la barra de direcciones: si hay un icono de <b>instalar</b> (una pantalla con una flecha), púlsalo.','Si no aparece, abre el menú <b>⋮</b> de Chrome → <b>«Transmitir, guardar y compartir»</b> → <b>«Instalar página como aplicación…»</b>.','Si ya la tienes instalada, búscala en tu menú de aplicaciones.'];
  $('#instSteps').innerHTML=steps.map(s=>`<li>${s}</li>`).join('');
  $('#dlgInstall').showModal();
}
addEventListener('appinstalled',()=>{track('app_instalada');$('#bInstall').hidden=true;toast('Aplicación instalada 🎉')});
/* ================= Cuenta y sincronización (Supabase) ================= */
const SB_URL='https://klgdjsvwwoppiuiodcwj.supabase.co',SB_KEY='sb_publishable_x39zAx3NuZ2vuUXqHXAoAg_dYWBEn6H';
/* Protección anti-bots (Cloudflare Turnstile). Clave pública del widget; vacía = desactivado */
const TS_KEY='0x4AAAAAAF9WJ6TFoRv9euV-';
let tsP=null,tsId=null,tsWait=null;
function loadTS(){ if(!TS_KEY)return Promise.resolve(null); if(tsP)return tsP;
  tsP=new Promise((ok,ko)=>{const sc=document.createElement('script');sc.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';sc.async=true;sc.onload=()=>ok(window.turnstile);sc.onerror=()=>{tsP=null;ko(new Error('captcha'))};document.head.appendChild(sc)}); return tsP }
async function getCaptcha(){
  if(!TS_KEY)return null;
  const ts=await loadTS();
  return new Promise((ok,ko)=>{
    tsWait={ok,ko};
    const done=t=>{const w=tsWait;tsWait=null;w&&w.ok(t)}, fail=()=>{const w=tsWait;tsWait=null;w&&w.ko(new Error('captcha'))};
    if(tsId===null) tsId=ts.render('#tsBox',{sitekey:TS_KEY,execution:'execute',appearance:'interaction-only',language:'es',callback:done,'error-callback':fail,'timeout-callback':fail});
    else ts.reset(tsId);
    ts.execute(tsId);
    setTimeout(()=>{if(tsWait)fail()},60000);
  });
}
const SB_LIB='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js',SB_SRI='sha384-uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O';
const SYNC_KEY=KEY+'.sync',APP_URL=location.origin+location.pathname.replace(/index\.html$/,'');
const cloud={sb:null,user:null,state:'off',last:0,err:'',timer:null,busy:false,again:false};
let loginState={step:'start'};
const META0=()=>({uid:'',lastPull:'1970-01-01T00:00:00Z',snap:{},cfg:null,cfgPull:'1970-01-01T00:00:00Z'});
function getMeta(){try{return {...META0(),...JSON.parse(localStorage.getItem(SYNC_KEY)||'{}')}}catch{return META0()}}
function setMeta(m){try{localStorage.setItem(SYNC_KEY,JSON.stringify(m))}catch{}}
const cfgShared=()=>{const {theme,...rest}=cfg;return rest};
const hasSession=()=>{try{return Object.keys(localStorage).some(k=>/^sb-.*-auth-token/.test(k))}catch{return false}};
function consentVal(){try{return localStorage.getItem('biblioteca.consent')||''}catch{return ''}}
function setConsent(v){try{localStorage.setItem('biblioteca.consent',v)}catch{} $('#consent').hidden=true;
  if(v==='yes'){startAnalytics();toast('¡Gracias! Estadísticas anónimas activadas')}
  else{ if(window.__phOn){try{posthog.opt_out_capturing()}catch{} } toast('Estadísticas desactivadas') }
  if(route.v==='profile')render()}

function loadSB(){
  if(cloud.sb) return Promise.resolve(cloud.sb);
  if(!location.protocol.startsWith('http')) return Promise.reject(new Error('local'));
  return new Promise((ok,ko)=>{
    const go=()=>{try{cloud.sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
      cloud.sb.auth.onAuthStateChange((ev,session)=>{setTimeout(()=>onAuth(session?.user||null,ev),0)});ok(cloud.sb)}catch(e){ko(e)}};
    if(window.supabase?.createClient) return go();
    const s=document.createElement('script');s.src=SB_LIB;s.integrity=SB_SRI;s.crossOrigin='anonymous';s.referrerPolicy='no-referrer';s.async=true;s.onload=go;s.onerror=()=>ko(new Error('net'));document.head.appendChild(s);
  });
}
function onAuth(u,ev){
  const was=cloud.user?.id;cloud.user=u;
  if(u&&!was){
    const m=getMeta();
    if(m.uid&&m.uid!==u.id){ books=[];cfg={name:'',theme:cfg.theme,goals:{},favs:[],lists:[],searches:[]};setMeta({...META0(),uid:u.id});try{localStorage.setItem(KEY,'[]');localStorage.setItem(KEY+'.cfg',JSON.stringify(cfg))}catch{} }
    else if(!m.uid) setMeta({...m,uid:u.id});
    if(location.search.includes('code=')||location.hash.includes('access_token')) history.replaceState(null,'',APP_URL);
    if($('#dlgLogin').open) $('#dlgLogin').close();
    if(ev==='SIGNED_IN') toast('Sesión iniciada. Sincronizando tu biblioteca…');
    checkMfa().then(()=>{ if(!cloud.needMfa) cloudSync(true) });
  }
  if(!u){cloud.state='off';socReset()}
  render();
}
function cloudDirty(){ if(!cloud.user)return; clearTimeout(cloud.timer); cloud.timer=setTimeout(()=>cloudSync(),1500) }
async function cloudSync(manual){
  if(!cloud.user||!cloud.sb||cloud.needMfa) return;
  if(cloud.busy){cloud.again=true;return}
  if(!navigator.onLine){cloud.state='offline';renderCloudBtn();return}
  cloud.busy=true;cloud.state='busy';renderCloudBtn();
  const sb=cloud.sb,uid=cloud.user.id;
  try{
    let m=getMeta(); if(m.uid!==uid) m={...META0(),uid};
    /* 1. Traer lo que haya cambiado en la nube */
    let changedLocal=false,from=0;
    for(;;){
      const {data,error}=await sb.from('books').select('id,data,deleted,updated_at').gt('updated_at',m.lastPull).order('updated_at').range(from,from+499);
      if(error) throw error;
      for(const row of data){
        const i=books.findIndex(b=>b.id===row.id),local=i>=0?books[i]:null,known=row.id in m.snap;
        const untouched=local?JSON.stringify(local)===m.snap[row.id]:!known; // sin cambios locales pendientes
        if(row.deleted){ if(local&&untouched){books.splice(i,1);changedLocal=true} if(untouched||!local) delete m.snap[row.id] }
        else if(untouched){ const b=cleanBook({...row.data,id:row.id}); if(!b){continue} if(i>=0)books[i]=b; else books.push(b); m.snap[row.id]=JSON.stringify(b); changedLocal=true }
        else if(local){ // cambiado aquí y en otro dispositivo: se mezclan los cambios campo a campo
          const rb=cleanBook({...row.data,id:row.id})||{notes:[],id:row.id};const merged=cleanBook(mergeBook(m.snap[row.id]?JSON.parse(m.snap[row.id]):{},local,rb))||local;
          books[i]=merged; m.snap[row.id]=JSON.stringify(rb); changedLocal=true }
        if(row.updated_at>m.lastPull) m.lastPull=row.updated_at;
      }
      if(data.length<500) break; from+=500;
    }
    const {data:st,error:e2}=await sb.from('settings').select('data,updated_at').maybeSingle();
    if(e2) throw e2;
    const localCfg=JSON.stringify(cfgShared());
    if(st&&st.updated_at>m.cfgPull){ if(m.cfg===null||localCfg===m.cfg){ cfg={...cleanCfg({...cfg,...st.data}),theme:cfg.theme}; m.cfg=JSON.stringify(cfgShared()); changedLocal=true } m.cfgPull=st.updated_at }
    if(changedLocal){ try{localStorage.setItem(KEY,JSON.stringify(books));localStorage.setItem(KEY+'.cfg',JSON.stringify(cfg))}catch{} }
    /* 2. Subir lo que haya cambiado aquí */
    const up=[],ids=new Set(books.map(b=>b.id));
    for(const b of books){const j=JSON.stringify(b);if(j!==m.snap[b.id])up.push({user_id:uid,id:b.id,data:b,deleted:false})}
    for(const id of Object.keys(m.snap)) if(!ids.has(id)) up.push({user_id:uid,id,data:{},deleted:true});
    for(let k=0;k<up.length;k+=200){
      const chunk=up.slice(k,k+200);
      const {error}=await sb.from('books').upsert(chunk,{onConflict:'user_id,id'}); if(error) throw error;
      for(const r of chunk){ if(r.deleted) delete m.snap[r.id]; else m.snap[r.id]=JSON.stringify(r.data) }
    }
    const cfgJ=JSON.stringify(cfgShared());
    if(cfgJ!==m.cfg){ const {error}=await sb.from('settings').upsert({user_id:uid,data:cfgShared()},{onConflict:'user_id'}); if(error) throw error; m.cfg=cfgJ }
    setMeta(m);
    cloud.state='ok';cloud.last=Date.now();cloud.err='';
    socLoad();
    if(changedLocal){ if($('#dlgBook').open){render();renderBook()} else softRender() }
    if(manual===true&&route.v==='profile') toast('Biblioteca sincronizada');
  }catch(e){
    cloud.state=navigator.onLine?'err':'offline';cloud.err=e?.message||String(e);
    if(/JWT|token|auth/i.test(cloud.err)) try{await cloud.sb.auth.refreshSession()}catch{}
    else if(/espacio máximo|Límite de libros/i.test(cloud.err)) toast(cloud.err.includes('espacio')?'Tu cuenta ha llegado al espacio máximo (20 MB). Borra notas o libros que no necesites.':'Has llegado al máximo de libros de una cuenta.');
    else if(navigator.onLine&&!/Failed to fetch|NetworkError|Load failed|network/i.test(cloud.err)) window.informarError?.(e,'sincronizar');
  }finally{
    cloud.busy=false;renderCloudBtn(); if(route.v==='profile') render();
    if(cloud.again){cloud.again=false;cloudDirty()}
  }
}
function mergeBook(base,local,remote){
  const out={...remote},keys=new Set([...Object.keys(local),...Object.keys(remote),...Object.keys(base)]);
  for(const k of keys){
    const lc=JSON.stringify(local[k])!==JSON.stringify(base[k]),rc=JSON.stringify(remote[k])!==JSON.stringify(base[k]);
    if(k==='notes'&&lc&&rc){ // unir notas de los dos lados
      const bi=new Set((base.notes||[]).map(n=>n.id)),map=new Map();
      for(const n of remote.notes||[]) map.set(n.id,n);
      for(const n of local.notes||[]) map.set(n.id,n);
      const removedL=[...bi].filter(id=>!(local.notes||[]).some(n=>n.id===id)),removedR=[...bi].filter(id=>!(remote.notes||[]).some(n=>n.id===id));
      for(const id of [...removedL,...removedR]) map.delete(id);
      out.notes=[...map.values()];
    } else if(lc){ if(k in local) out[k]=local[k]; else delete out[k] }
  }
  return out;
}
function syncLabel(){
  if(!cloud.user) return 'Sin cuenta';
  if(cloud.needMfa) return 'Falta verificar (2 pasos)';
  return {busy:'Sincronizando…',ok:'Sincronizado',err:'Error al sincronizar',offline:'Sin conexión: se sincronizará después',off:'Conectando…'}[cloud.state]||'';
}
function renderCloudBtn(){
  const b=$('#bCloud'); if(!b) return;
  const cls={ok:'ok',busy:'busy',err:'err',offline:'err'}[cloud.state]||'';
  b.innerHTML=cloud.user?`<i><span class="syncdot ${cls}"></span></i><span>${esc(syncLabel())}</span>`:'<i>☁️</i><span>Iniciar sesión</span>';
  b.dataset.nav=cloud.user?'profile':''; if(!cloud.user) b.dataset.act='login'; else delete b.dataset.act;
}
/* ----- Verificación en dos pasos (TOTP) ----- */
let mfaState={step:''};
async function checkMfa(){
  try{const {data,error}=await cloud.sb.auth.mfa.getAuthenticatorAssuranceLevel();if(error)throw error;
    const f=await cloud.sb.auth.mfa.listFactors();const v=(f.data?.totp||[]).filter(x=>x.status==='verified');
    cloud.mfa={on:v.length>0,factorId:v[0]?.id||''};
    cloud.needMfa=data.nextLevel==='aal2'&&data.currentLevel!=='aal2';
    if(cloud.needMfa){ mfaState={step:'challenge'};renderMfa();if(!$('#dlgMfa').open)$('#dlgMfa').showModal() }
  }catch(e){ cloud.mfa=cloud.mfa||{on:false}; }
  if(route.v==='profile') render();
}
function renderMfa(){
  const s=mfaState,err=s.err?`<p style="color:var(--danger);font-size:14px;margin:12px 0 0">${esc(s.err)}</p>`:'';
  const codeIn=`<label for="m_code">Código de 6 dígitos de tu app de autenticación</label><input type="text" id="m_code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="otp" placeholder="······">`;
  if(s.step==='enroll'){
    $('#mfaTitle').textContent='Activar verificación en dos pasos';
    $('#mfaBody').innerHTML=`<ol style="margin:0;padding-left:20px;line-height:1.6;font-size:15px"><li>Abre una app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…).</li><li>Escanea este código QR o escribe la clave.</li><li>Escribe el código que te muestre.</li></ol>
      ${s.qr?`<div style="text-align:center;margin:16px 0"><img src="${esc(safeImg(s.qr))}" alt="Código QR" width="200" height="200" style="background:#fff;border-radius:12px;padding:8px"></div>`:''}
      ${s.uri?`<p style="text-align:center;margin:${s.qr?'0':'16px'} 0 12px"><a class="btn small primary" href="${esc(s.uri)}">📲 Añadir a mi app de autenticación</a><br><span class="muted" style="font-size:12px">Si usas este mismo móvil, pulsa aquí en vez de escanear.</span></p>`:''}
      <p class="muted" style="font-size:13px;margin:0 0 4px;text-align:center">Clave: <code style="user-select:all;word-break:break-all">${esc(s.secret)}</code> <button class="btn small ghost" data-act="mfaCopy" style="padding:2px 10px">Copiar</button></p>
      <p class="muted" style="font-size:12px;margin:0;text-align:center">Guárdala en un sitio seguro: si pierdes el móvil, la necesitarás para recuperar el acceso.</p>
      ${codeIn}${err}<div class="df"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn primary" data-act="mfaVerify" ${s.busy?'disabled':''}>${s.busy?'Comprobando…':'Activar'}</button></div>`;
  } else {
    $('#mfaTitle').textContent='Verificación en dos pasos';
    $('#mfaBody').innerHTML=`<p class="muted" style="margin:0;font-size:14px">Tu cuenta tiene activada la verificación en dos pasos. Escribe el código de tu app de autenticación para sincronizar tu biblioteca.</p>
      ${codeIn}${err}<div class="df"><button class="btn ghost" data-act="mfaCancel">Ahora no</button><button class="btn primary" data-act="mfaVerify" ${s.busy?'disabled':''}>${s.busy?'Comprobando…':'Verificar'}</button></div>`;
  }
  setTimeout(()=>$('#m_code')?.focus(),50);
}
/* El QR llega como SVG sin codificar; lo pasamos a base64 para que se vea en todos los navegadores (también Safari) */
function qrDataUrl(q){ try{ if(typeof q!=='string')return ''; let svg=q.startsWith('data:')?q.slice(q.indexOf(',')+1):q; if(/;base64,/i.test(q.slice(0,q.indexOf(',')+1)))return safeImg(q);
  try{svg=decodeURIComponent(svg)}catch{} if(!/<svg[\s>]/i.test(svg))return ''; return safeImg('data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)))) }catch{return ''} }
function otpUri(u){ return typeof u==='string'&&/^otpauth:\/\/totp\/[^\s"'<>]+$/i.test(u)&&u.length<1000?u:'' }
async function mfaEnroll(){
  try{
    const f=await cloud.sb.auth.mfa.listFactors();
    for(const x of (f.data?.all||[])) if(x.status!=='verified') await cloud.sb.auth.mfa.unenroll({factorId:x.id});
    const {data,error}=await cloud.sb.auth.mfa.enroll({factorType:'totp',friendlyName:'Mi biblioteca '+Date.now().toString(36)});if(error)throw error;
    mfaState={step:'enroll',factorId:data.id,qr:qrDataUrl(data.totp.qr_code),uri:otpUri(data.totp.uri),secret:data.totp.secret};renderMfa();$('#dlgMfa').showModal();
  }catch(e){toast('No se ha podido activar: '+(e?.message||e))}
}
async function mfaVerify(){
  const code=($('#m_code').value||'').replace(/\D/g,'');if(code.length!==6){mfaState={...mfaState,err:'Escribe los 6 dígitos.'};renderMfa();return}
  mfaState={...mfaState,busy:true,err:''};renderMfa();
  try{const factorId=mfaState.factorId||cloud.mfa?.factorId;const {error}=await cloud.sb.auth.mfa.challengeAndVerify({factorId,code});if(error)throw error;
    const wasEnroll=mfaState.step==='enroll';$('#dlgMfa').close();cloud.needMfa=false;await checkMfa();
    toast(wasEnroll?'Verificación en dos pasos activada 🔒':'Verificado');cloudSync(true);
  }catch(e){mfaState={...mfaState,busy:false,err:/invalid|expired|code/i.test(e?.message||'')?'Código incorrecto o caducado. Prueba con el siguiente.':'No se ha podido verificar: '+(e?.message||e)};renderMfa()}
}
async function mfaDisable(){
  if(!confirm('¿Desactivar la verificación en dos pasos? Tu cuenta quedará protegida solo por el inicio de sesión.'))return;
  try{const f=await cloud.sb.auth.mfa.listFactors();for(const x of (f.data?.all||[])){const {error}=await cloud.sb.auth.mfa.unenroll({factorId:x.id});if(error)throw error}
    await cloud.sb.auth.refreshSession();await checkMfa();toast('Verificación en dos pasos desactivada')}
  catch(e){toast('No se ha podido desactivar: '+(e?.message||e))}
}
function accountCard(){
  if(!location.protocol.startsWith('http')) return '';
  if(cloud.user&&cloud.sb&&!cloud.mfa){cloud.mfa={on:false};checkMfa()}
  if(!cloud.user) return `<div class="card"><h3 style="font-size:20px">☁️ Tu cuenta</h3><p class="muted" style="margin:8px 0 14px;font-size:14px">Opcional y gratis. Guarda tu biblioteca en la nube para no perderla y tenerla igual en el móvil y en el ordenador.</p><button class="btn primary" data-act="login">Iniciar sesión o crear cuenta</button></div>`;
  const u=cloud.user,name=u.user_metadata?.full_name||u.user_metadata?.name||'',pic=u.user_metadata?.avatar_url||'';
  const when=cloud.last?new Date(cloud.last).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'';
  return `<div class="card"><h3 style="font-size:20px;margin-bottom:12px">☁️ Tu cuenta</h3>
    <div class="acct">${avatar(name||u.email,pic)}<div style="flex:1;min-width:0"><b>${esc(name||u.email)}</b><div class="muted" style="font-size:13px;overflow-wrap:anywhere">${name?esc(u.email)+' · ':''}<span class="syncdot ${({ok:'ok',busy:'busy',err:'err',offline:'err'})[cloud.state]||''}"></span> ${esc(syncLabel())}${cloud.state==='ok'&&when?' a las '+when:''}</div></div></div>
    ${cloud.state==='err'?`<p class="muted" style="font-size:12px;margin:10px 0 0">Detalle: ${esc(cloud.err)}</p>`:''}
    <div style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="flex:1;min-width:180px;font-size:14px">🔒 Verificación en dos pasos: <b>${cloud.mfa?.on?'activada':'desactivada'}</b></span>${cloud.mfa?.on?'<button class="btn small" data-act="mfaOff">Desactivar</button>':'<button class="btn small primary" data-act="mfaOn">Activar</button>'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn small" data-act="syncNow">Sincronizar ahora</button><button class="btn small" data-act="logout">Cerrar sesión</button><button class="btn small danger" data-act="delAccount">Borrar mi cuenta</button></div></div>`;
}

/* ----- Diálogo de acceso ----- */
let googleOn=null;
/* Preguntamos a Supabase si el acceso con Google está activado, para no enseñar un botón que daría error */
function checkGoogle(){ if(googleOn!==null)return; fetch(SB_URL+'/auth/v1/settings',{headers:{apikey:SB_KEY}}).then(r=>r.ok?r.json():null).then(j=>{googleOn=!!j?.external?.google; if($('#dlgLogin').open&&loginState.step==='start')renderLogin()}).catch(()=>{}) }
function openLogin(){ loginState={step:'start'}; checkGoogle(); renderLogin(); $('#dlgLogin').showModal(); loadSB().catch(()=>{ loginState={step:'start',err:'No se ha podido conectar. Comprueba tu conexión a internet.'}; renderLogin() }) }
function renderLogin(){
  const s=loginState,legal=`<p class="legal">Al continuar aceptas las <a href="condiciones.html" target="_blank" rel="noopener">condiciones de uso</a> y que guardemos tu correo y tu biblioteca para darte el servicio, como explica la <a href="privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.</p>`;
  const err=s.err?`<p style="color:var(--danger);font-size:14px;margin:12px 0 0">${esc(s.err)}</p>`:'';
  if(s.step==='code'){
    $('#loginBody').innerHTML=`<p style="margin:0 0 6px">Te hemos enviado un correo a <b>${esc(s.email)}</b>.</p><p class="muted" style="margin:0;font-size:14px">${isStandalone()?'Escribe aquí el <b>código de 6 dígitos</b> que viene en el correo. No pulses el enlace: se abriría en el navegador y no en esta app.':'Escribe aquí el <b>código de 6 dígitos</b> del correo, o pulsa el enlace del correo desde este mismo dispositivo.'}</p>
      <label for="l_code">Código</label><input type="text" id="l_code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" class="otp" placeholder="······">${err}
      <div class="df"><button class="btn ghost" data-act="loginBack">Usar otro correo</button><button class="btn primary" data-act="verifyCode" ${s.busy?'disabled':''}>${s.busy?'Comprobando…':'Entrar'}</button></div>`;
    setTimeout(()=>$('#l_code')?.focus(),50);return;
  }
  $('#loginBody').innerHTML=`<p class="muted" style="margin:0 0 16px;font-size:14px">Guarda tu biblioteca en la nube y úsala en todos tus dispositivos. Los libros que ya tienes aquí se suben a tu cuenta.</p>
    ${googleOn?`<button class="gbtn" data-act="google"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continuar con Google</button>
    <div class="orline">o con tu correo</div>`:''}
    <input type="email" id="l_email" placeholder="tu@correo.com" autocomplete="email" value="${esc(s.email||'')}">${err}
    <div class="df" style="margin-top:14px"><button class="btn primary" data-act="sendMail" ${s.busy?'disabled':''}>${s.busy?'Enviando…':'Enviarme un código'}</button></div><p style="text-align:right;margin:8px 0 0"><button class="btn small ghost" data-act="haveCode">Ya tengo un código</button></p>${legal}`;
}
function authErr(e){const m=e?.message||String(e);
  if(/not authorized/i.test(m)) return 'El envío de correos todavía no está activado para todo el mundo. Usa «Continuar con Google» o inténtalo más adelante.';
  if(/captcha/i.test(m)) return 'No se ha podido completar la comprobación anti-bots. Recarga la página y vuelve a intentarlo.';
  if(/security purposes|after \d+ seconds/i.test(m)) return 'Acabas de pedir un correo. Espera un minuto antes de pedir otro.';
  if(/rate|too many/i.test(m)) return 'Se ha alcanzado el límite de correos por hora. Espera un rato (como mucho una hora) y vuelve a intentarlo. Si ya te llegó un correo antes, puedes usar su código o su enlace mientras no haya caducado.';
  if(/invalid|expired/i.test(m)) return 'El código no es correcto o ha caducado. Pide uno nuevo.';
  if(/provider is not enabled|Unsupported provider/i.test(m)) return 'El acceso con Google todavía no está activado. Prueba con tu correo.';
  if(/fetch|network|net/i.test(m)) return 'No hay conexión. Comprueba tu internet.';
  return 'No se ha podido completar: '+m}
async function signInGoogle(){ try{const sb=await loadSB();const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:APP_URL}});if(error)throw error}catch(e){loginState={...loginState,err:authErr(e)};renderLogin()} }
async function sendMagic(){
  const email=($('#l_email').value||'').trim(); if(!/^\S+@\S+\.\S+$/.test(email)){loginState={step:'start',email,err:'Escribe un correo válido.'};renderLogin();return}
  loginState={step:'start',email,busy:true};renderLogin();
  try{const sb=await loadSB();const captchaToken=await getCaptcha();const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:APP_URL,...(captchaToken?{captchaToken}:{})}});if(error)throw error;loginState={step:'code',email}}
  catch(e){loginState={step:'start',email,err:authErr(e)}}
  renderLogin();
}
async function verifyCode(){
  const token=($('#l_code').value||'').replace(/\D/g,''); if(token.length<6){loginState={...loginState,err:'Escribe el código completo.'};renderLogin();return}
  loginState={...loginState,busy:true,err:''};renderLogin();
  try{const sb=await loadSB();const {error}=await sb.auth.verifyOtp({email:loginState.email,token,type:'email'});if(error)throw error}
  catch(e){loginState={...loginState,busy:false,err:authErr(e)};renderLogin()}
}
async function logout(){
  const keep=confirm('¿Mantener tus libros en este dispositivo después de cerrar sesión?\n\nAceptar: se quedan aquí (sin sincronizar).\nCancelar: se borran de este dispositivo (siguen en tu cuenta).');
  await cloudSync(); try{await cloud.sb.auth.signOut()}catch{}
  cloud.user=null;cloud.mfa=null;cloud.needMfa=false;setMeta(META0());socReset();
  if(!keep){books=[];cfg={name:'',theme:cfg.theme,goals:{},favs:[],lists:[],searches:[]};try{localStorage.setItem(KEY,'[]');localStorage.setItem(KEY+'.cfg',JSON.stringify(cfg))}catch{}}
  toast('Has cerrado sesión');go('home');
}
async function deleteAccount(){
  if(!confirm('¿Borrar tu cuenta y todos los libros guardados en la nube? No se puede deshacer.'))return;
  if(!confirm('Última confirmación: se borrará la cuenta '+(cloud.user?.email||'')+' para siempre.'))return;
  if(cloud.needMfa){mfaState={step:'challenge'};renderMfa();$('#dlgMfa').showModal();return}
  try{const {error}=await cloud.sb.rpc('delete_my_account');if(error)throw error;
    try{await cloud.sb.auth.signOut({scope:'local'})}catch{}
    cloud.user=null;setMeta(META0());
    const keep=confirm('Cuenta borrada. ¿Quieres conservar una copia de tus libros en este dispositivo?');
    if(!keep){books=[];cfg={name:'',theme:cfg.theme,goals:{},favs:[],lists:[],searches:[]};try{localStorage.setItem(KEY,'[]');localStorage.setItem(KEY+'.cfg',JSON.stringify(cfg))}catch{}}
    toast('Tu cuenta se ha borrado');go('home');
  }catch(e){toast('No se ha podido borrar la cuenta: '+(e?.message||e))}
}
/* Arranque: solo se carga Supabase si ya hay sesión o se vuelve de iniciar sesión */
function cloudBoot(){
  if(!location.protocol.startsWith('http')) return;
  const back=/[?&]code=|access_token=|error_description=/.test(location.search+location.hash);
  if(back&&/error_description=/.test(location.search+location.hash)){const p=new URLSearchParams((location.search||location.hash).replace(/^[?#]/,''));setTimeout(()=>toast('No se ha podido iniciar sesión: '+(p.get('error_description')||'error')),600);history.replaceState(null,'',APP_URL)}
  if(hasSession()||back) loadSB().then(sb=>sb.auth.getSession()).then(({data})=>{ if(data?.session) onAuth(data.session.user,'INITIAL') }).catch(()=>{});
  if(!consentVal()) setTimeout(()=>{$('#consent').hidden=false},1200);
  addEventListener('online',()=>cloudSync());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')cloudSync()});
  setInterval(()=>{if(document.visibilityState==='visible')cloudSync()},60000);
}
addEventListener('popstate',()=>{if(hist.length){route=hist.pop();render(true);$('#main').scrollTop=0}});
/* imágenes que no cargan: se quitan (sustituye al antiguo onerror en línea) */
document.addEventListener('error',e=>{const t=e.target;if(t&&t.tagName==='IMG'&&t.hasAttribute('data-rm'))t.remove()},true);
load();render(true);
cloudBoot();
navigator.storage?.persist?.().catch(()=>{});
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
  const had=!!navigator.serviceWorker.controller;let reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!reloaded){reloaded=true;location.reload()}});
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{swReg=reg;reg.update()}).catch(()=>{});
}
/* Comprobación de versión: si hay una más nueva publicada, se recarga sola */

async function checkUpdate(){
  if(checking||!location.protocol.startsWith('http'))return;checking=true;
  try{const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'});const {v}=await r.json();
    if(v&&v!==APP_VERSION){
      if(document.querySelector('dialog[open]')){toast('Hay una versión nueva de la app',{label:'Actualizar',fn:()=>applyUpdate()});}
      else applyUpdate();
    }}catch{}
  checking=false;
}
async function applyUpdate(){
  try{if(swReg){await swReg.update();if(swReg.waiting)swReg.waiting.postMessage('skipWaiting')}}catch{}
  if(sessionStorage.getItem('upd')===String(Date.now()).slice(0,8))return;
  sessionStorage.setItem('upd',String(Date.now()).slice(0,8));
  setTimeout(()=>location.reload(),400);
}
checkUpdate();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){swReg&&swReg.update().catch(()=>{});checkUpdate()}});
setInterval(checkUpdate,30*60*1000);
/* sin zoom (Safari ignora user-scalable=no) */
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('gesturechange',e=>e.preventDefault());
document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault()},{passive:false});
let lastTouch=0;document.addEventListener('touchend',e=>{const n=Date.now();if(n-lastTouch<300&&!e.target.closest('input,textarea,select'))e.preventDefault();lastTouch=n},{passive:false});
