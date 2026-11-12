// Prueba del traductor (worker.js) con Workers AI y caché simulados: node tests/worker_test.mjs
const store=new Map();
globalThis.caches={default:{match:async k=>store.has(k.url)?new Response(store.get(k.url)):undefined,put:async(k,r)=>store.set(k.url,await r.text())}};
const w=(await import(new URL("../worker.js", import.meta.url).href)).default;
let calls=0;const env={AI:{run:async(m,i)=>{calls++;if(m.includes('llama'))return {response:'Traducción: «Una novela sobre un joven mago.»'};return {translated_text:'x'}}},ASSETS:{fetch:async r=>new Response('asset '+new URL(r.url).pathname)}};
const ctx={waitUntil:p=>p};
const post=(body,h={})=>new Request('https://biblioteca-personal.alexbosquecano.workers.dev/api/traducir',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://biblioteca-personal.alexbosquecano.workers.dev',...h},body:JSON.stringify(body)});
let r=await w.fetch(post({text:'A novel about a young wizard.'}),env,ctx);console.log('1ª',r.status,r.headers.get('X-Cache'),await r.text());
await new Promise(s=>setTimeout(s,10));
r=await w.fetch(post({text:'A novel about a young wizard.'}),env,ctx);console.log('2ª (caché)',r.status,r.headers.get('X-Cache'),'llamadas IA:',calls);
r=await w.fetch(post({text:'x'},{Origin:'https://malo.com'}),env,ctx);console.log('otro origen',r.status);
r=await w.fetch(post({text:'a'.repeat(3000)}),env,ctx);console.log('demasiado largo',r.status);
r=await w.fetch(new Request('https://biblioteca-personal.alexbosquecano.workers.dev/api/traducir'),env,ctx);console.log('GET',r.status);
r=await w.fetch(new Request('https://biblioteca-personal.alexbosquecano.workers.dev/index.html'),env,ctx);console.log('estático',await r.text());
env.AI.run=async m=>{if(m.includes('llama'))throw new Error('caído');return {translated_text:'Una novela.'}};
r=await w.fetch(post({text:'A novel. About magic.'}),env,ctx);console.log('respaldo m2m100',r.status,await r.text());
