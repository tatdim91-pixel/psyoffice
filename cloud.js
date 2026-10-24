/* cloud.js — Supabase login + sync for Γραφείο (single-user) */
(function(){
const SUPABASE_URL='https://nbuqvmeutthjkhbajoio.supabase.co';
const SUPABASE_KEY='sb_publishable_jelFPm9wlSJBrXdAZj3HhA_QzKG9s2C'; // publishable: safe in frontend because RLS is on
const KEYS=['pso_weeks','pso_exp','pso_other','pso_settings','pso_tax_saved'];
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let user=null,timer=null;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

/* ── Login gate ── */
const gate=document.createElement('div');
gate.style.cssText='position:fixed;inset:0;z-index:1000;background:var(--bg3);display:flex;align-items:center;justify-content:center;padding:24px';
gate.innerHTML=`<div style="width:100%;max-width:360px">
  <div style="font-size:30px;font-weight:800;letter-spacing:-.03em;margin-bottom:6px">Γραφείο</div>
  <div style="font-size:13px;color:var(--text2);margin-bottom:24px">Συνδέσου για να δεις τα δεδομένα σου</div>
  <div class="fg"><label>Email</label><input type="email" id="au-email" autocomplete="username"></div>
  <div class="fg"><label>Κωδικός</label><input type="password" id="au-pass" autocomplete="current-password"></div>
  <div id="au-err" style="font-size:12px;color:var(--danger);min-height:18px;margin-bottom:8px"></div>
  <button class="btn btn-p btn-full" id="au-btn">Σύνδεση</button>
</div>`;
document.body.appendChild(gate);
const $=id=>document.getElementById(id);
$('au-btn').onclick=login;
$('au-pass').addEventListener('keydown',e=>{if(e.key==='Enter')login();});

async function login(){
  $('au-err').textContent='';$('au-btn').disabled=true;
  const{data,error}=await sb.auth.signInWithPassword({email:$('au-email').value.trim(),password:$('au-pass').value});
  $('au-btn').disabled=false;
  if(error){$('au-err').textContent='Λάθος email ή κωδικός.';return;}
  $('au-pass').value='';
  await onLogin(data.user);
}
async function onLogin(u){user=u;await pull();gate.style.display='none';addSignOut();}

/* ── Sync ── */
async function pull(){
  try{
    const{data,error}=await sb.from('user_data').select('key,value');
    if(error)throw error;
    if(!data.length)await push();                       // first login: upload this device's data
    else data.forEach(r=>localStorage.setItem(r.key,JSON.stringify(r.value)));  // otherwise cloud wins
    fixWeekDates();
  }catch(e){console.warn('pull failed (offline?)',e);}
  refresh();
}
async function push(){
  if(!user)return;
  const rows=KEYS.map(k=>{const raw=localStorage.getItem(k);
    return raw===null?null:{user_id:user.id,key:k,value:JSON.parse(raw),updated_at:new Date().toISOString()};}).filter(Boolean);
  if(!rows.length)return;
  const{error}=await sb.from('user_data').upsert(rows,{onConflict:'user_id,key'});
  if(error)throw error;
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>push().catch(e=>console.warn('push failed, will retry',e)),800);}
const origPs=window.ps;
window.ps=function(k,v){const r=origPs(k,v);if(v!==undefined&&KEYS.includes(k)&&user)schedule();return r;};
window.addEventListener('online',()=>push().catch(()=>{}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')push().catch(()=>{});});

/* Old versions saved week starts as Sunday (UTC bug) → shift to Monday once */
function fixWeekDates(){
  try{
    const w=JSON.parse(localStorage.getItem('pso_weeks')||'[]');let ch=false;
    w.forEach(e=>{if((e.entryType||'week')==='week'){const d=new Date(e.weekStart+'T00:00:00');
      if(d.getDay()===0){d.setDate(d.getDate()+1);e.weekStart=ymd(d);ch=true;}}});
    if(ch){w.sort((a,b)=>b.weekStart.localeCompare(a.weekStart));localStorage.setItem('pso_weeks',JSON.stringify(w));push().catch(()=>{});}
  }catch(e){}
}
function refresh(){
  try{loadAll();renderAll();renderFabSessionInputs();applyTheme(localStorage.getItem('pso_theme')||'dark');}
  catch(e){console.warn(e);}
}

/* ── Sign out (in Settings) ── */
function addSignOut(){
  const sheet=document.querySelector('#settings-overlay .settings-sheet');
  if(!sheet||$('au-out'))return;
  const d=document.createElement('div');d.id='au-out';
  d.style.cssText='margin-top:18px;padding-top:14px;border-top:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px';
  d.innerHTML=`<span style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis">${esc(user.email)}</span>
    <button class="btn" style="padding:8px 14px;font-size:13px">Αποσύνδεση</button>`;
  sheet.appendChild(d);
  d.querySelector('button').onclick=signOut;
}
async function signOut(){
  try{await push();}catch(e){if(!confirm('Τα τελευταία δεδομένα δεν συγχρονίστηκαν. Αποσύνδεση ούτως ή άλλως;'))return;}
  await sb.auth.signOut();
  KEYS.forEach(k=>localStorage.removeItem(k));   // don't leave data on a shared device
  location.reload();
}

/* ── Start ── */
sb.auth.getSession().then(({data})=>{if(data.session)onLogin(data.session.user);});
})();
