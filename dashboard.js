const API_URL='https://script.google.com/macros/s/AKfycbzvyQZsdZO5IM3-kMApnHlcyD-D8oQOC_BrGpjicHOFlMRkcaFju4xc6ie991Qp0WSpTQ/exec';
const ADMIN_PIN='2525';
let ADMIN_AUTH_TOKEN=sessionStorage.getItem('ward44_auth_token')||'';
let ADMIN_OTP='';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=t=>t?new Date(t).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
let filter='All';
let complaints=[];

async function request(body){
  const payload={...body};
  if(ADMIN_AUTH_TOKEN) payload.authToken=ADMIN_AUTH_TOKEN;
  const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
  const text=await r.text();
  let j; try{j=JSON.parse(text)}catch{throw new Error('Invalid response from Google Apps Script')}
  if(!j.ok) throw new Error(j.message||'Request failed');
  return j;
}

async function trackComplaint(id){
  const url=API_URL+'?action=track&id='+encodeURIComponent(id)+'&_='+Date.now();
  const r=await fetch(url,{cache:'no-store'});
  const text=await r.text();
  let j; try{j=JSON.parse(text)}catch{return null;}
  return j.ok&&j.complaint?j.complaint:null;
}

async function loadMediaFromTrack(){
  const missing=complaints.filter(c=>c.complaintId && !String(c.photoLinks||'').trim() && !String(c.videoLinks||'').trim()).slice(0,50);
  if(!missing.length) return;
  const results=await Promise.allSettled(missing.map(c=>trackComplaint(c.complaintId)));
  results.forEach((res,i)=>{
    if(res.status!=='fulfilled'||!res.value) return;
    const fresh=res.value;
    const c=missing[i];
    if(fresh.photoLinks) c.photoLinks=fresh.photoLinks;
    if(fresh.videoLinks) c.videoLinks=fresh.videoLinks;
    if(fresh.driveFolder) c.driveFolder=fresh.driveFolder;
  });
}

async function login(){
  const pin=$('loginPin').value.trim();
  const otp=$('loginOtp').value.trim().replace(/\D/g,'');
  const err=$('loginError');
  err.textContent='';
  if(pin!==ADMIN_PIN){err.textContent='Incorrect Parshad PIN.';return;}
  if(!/^\d{6}$/.test(otp)){err.textContent='Enter the 6-digit code from your Authenticator app.';return;}
  $('loginBtn').disabled=true; $('loginBtn').textContent='Verifying…';
  try{
    const r=await request({action:'auth',pin,otp});
    ADMIN_AUTH_TOKEN=r.authToken||'';
    ADMIN_OTP=otp;
    sessionStorage.setItem('ward44_auth_token',ADMIN_AUTH_TOKEN);
    sessionStorage.setItem('ward44_login','1');
    $('loginOverlay').classList.add('hidden');
    $('dashboardContent').classList.remove('hidden');
    load();
  }catch(e){err.textContent=e.message||'Authentication failed. Check your PIN and Authenticator code.';}
  finally{$('loginBtn').disabled=false;$('loginBtn').textContent='Sign In →';}
}
$('loginBtn').onclick=login;
$('loginPin').onkeydown=e=>{if(e.key==='Enter')login()};
$('loginOtp').onkeydown=e=>{if(e.key==='Enter')login()};
$('logoutBtn').onclick=e=>{
  e.preventDefault();
  sessionStorage.removeItem('ward44_login');
  sessionStorage.removeItem('ward44_auth_token');
  sessionStorage.setItem('ward44_logout_message','1');
  location.reload();
};

if(sessionStorage.getItem('ward44_logout_message')==='1'){
  const msg=$('logoutMessage');
  if(msg) msg.classList.remove('hidden');
  sessionStorage.removeItem('ward44_logout_message');
}


document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); filter=b.dataset.filter; render();
});
$('refreshBtn').onclick=load;
$('searchComplaint').oninput=render;

function driveFileId(url){
  const value=String(url||'');
  const patterns=[/\/file\/d\/([^/?#]+)/i,/[?&]id=([^&#]+)/i];
  for(const re of patterns){const m=value.match(re);if(m)return decodeURIComponent(m[1]);}
  return '';
}
function splitLinks(value){
  return String(value||'').split(/\r?\n|\s*[,;]\s*/).map(x=>x.trim()).filter(Boolean);
}
function photoHtml(u,i){
  const id=driveFileId(u);
  const view=id?`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`:u;
  const safe=esc(view);
  return `<div class="media-view-card">
    <div class="media-view-icon">📷</div>
    <div class="media-view-name">Photo ${i+1}</div>
    <button class="view-media-btn" type="button" onclick="viewPhoto('${safe}',${i+1})">View Photo</button>
    <a class="media-open" href="${safe}" target="_blank" rel="noopener">Open Photo ↗</a>
  </div>`;
}
function videoHtml(u,i){
  const id=driveFileId(u);
  const preview=id?`https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`:u;
  const view=id?`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`:u;
  return `<div class="media-view-card">
    <div class="media-view-icon">🎥</div>
    <div class="media-view-name">Video ${i+1}</div>
    <button class="view-media-btn" type="button" onclick="viewVideo('${esc(preview)}',${i+1})">View Video</button>
    <a class="media-open" href="${esc(view)}" target="_blank" rel="noopener">Open Video ↗</a>
  </div>`;
}
function mediaGallery(links,type){
  const arr=splitLinks(links);
  if(!arr.length) return '';
  const label=type==='photo'?'Photos':'Videos';
  const icon=type==='photo'?'📷':'🎥';
  const items=arr.map((u,i)=>type==='photo'?photoHtml(u,i):videoHtml(u,i)).join('');
  return `<section class="complaint-media"><div class="media-title">${icon} <b>${label}</b><span>${arr.length} file${arr.length===1?'':'s'}</span></div><div class="media-grid">${items}</div></section>`;
}
function mediaBlock(c){
  const photos=mediaGallery(c.photoLinks,'photo');
  const videos=mediaGallery(c.videoLinks,'video');
  if(photos||videos) return `<div class="complaint-media-wrap">${photos}${videos}</div>`;
  return `<div class="no-media">No photo or video is linked to this complaint.</div>`;
}
function searchable(c){
  return [c.complaintId,c.name,c.mobile,c.location,c.category,c.description,c.priority,c.status].join(' ').toLowerCase();
}
function card(c){
  const id=esc(c.complaintId||'');
  const statusClass=c.status==='Solved'?'solved':c.status==='In Progress'?'progress':'registered';
  const map=c.latitude&&c.longitude?`<a class="map" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(c.latitude+','+c.longitude)}">📍 Open GPS location ↗</a>`:'';
  const folder=c.driveFolder?`<a class="map" target="_blank" rel="noopener" href="${esc(c.driveFolder)}">📁 Open Complaint Drive Folder ↗</a>`:'';
  return `<article class="dash-item" data-complaint-id="${id}">
    <div>
      <div class="complaint-id">${id}</div><h4>${esc(c.category)}</h4>
      <p><b>Resident:</b> ${esc(c.name)} · ${esc(c.mobile)}<br><b>Location:</b> ${esc(c.location)}<br><b>Registered:</b> ${fmt(c.registeredAt)}<br><b>Problem:</b> ${esc(c.description)}</p>
      <div class="dash-meta">${map}${c.latitude&&c.longitude?' · GPS captured':''}</div>
      <div class="media-container">${mediaBlock(c)}</div>
      ${folder?`<div class="dash-meta">${folder}</div>`:''}
    </div>
    <div class="status-control"><span class="badge ${statusClass}">${esc(c.status)}</span><select onchange="changeStatus('${id}',this.value)"><option ${c.status==='Registered'?'selected':''}>Registered</option><option ${c.status==='In Progress'?'selected':''}>In Progress</option><option ${c.status==='Solved'?'selected':''}>Solved</option></select>${c.status==='Solved'?`<button class="notify-solved-btn" type="button" onclick="notifySolved(complaints.find(x=>String(x.complaintId)===String('${id}')))">✓ Send WhatsApp Confirmation</button>`:''}</div>
  </article>`;
}
function render(){
  const q=String($('searchComplaint')?.value||'').trim().toLowerCase();
  const shown=complaints.filter(c=>(filter==='All'||c.status===filter)&&(!q||searchable(c).includes(q)));
  $('dashTotal').textContent=complaints.length;
  $('dashOpen').textContent=complaints.filter(x=>x.status!=='Solved').length;
  $('dashSolved').textContent=complaints.filter(x=>x.status==='Solved').length;
  $('dashboardList').innerHTML=shown.length?shown.map(card).join(''):'<div class="result">No complaints match your search/filter.</div>';
}
async function load(){
  const list=$('dashboardList');
  $('refreshBtn').disabled=true;
  list.innerHTML='<div class="loading-note">Loading complaints…</div>';
  try{
    const j=await request({action:'list'});
    complaints=j.complaints||[];
    await loadMediaFromTrack();
    render();
  }catch(e){list.innerHTML='<div class="result">Unable to load complaints. Check that your Apps Script deployment is active and the Parshad PIN is correct.</div>';}
  finally{$('refreshBtn').disabled=false;}
}
function cleanWhatsAppNumber(mobile){
  let n=String(mobile||'').replace(/\D/g,'');
  if(n.length===10) n='91'+n;
  if(n.startsWith('0') && n.length===11) n='91'+n.slice(1);
  return n;
}
function solvedWhatsAppUrl(c){
  const phone=cleanWhatsAppNumber(c.mobile);
  const message=[
    'WARD PARSHAD - WARD 44',
    '',
    `Your complaint ${c.complaintId} has been marked as SOLVED.`,
    '',
    `Resident: ${c.name||''}`,
    `Problem: ${c.category||'Complaint'}`,
    '',
    'Thank you for using the Ward 44 Citizen Service Portal.',
    'Parshad: Moinuddin'
  ].join('\n');
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '';
}
function notifySolved(c){
  const url=solvedWhatsAppUrl(c);
  if(!url){ alert('The resident mobile number is missing or invalid, so WhatsApp confirmation cannot be prepared.'); return; }
  const w=window.open(url,'_blank','noopener,noreferrer');
  if(!w) alert('WhatsApp could not be opened automatically. Please allow pop-ups for the Parshad dashboard.');
}
window.notifySolved=notifySolved;
window.changeStatus=async(id,status)=>{
  let whatsappWindow=null;
  const cBefore=complaints.find(x=>String(x.complaintId)===String(id));
  if(status==='Solved' && cBefore){
    // Open a user-initiated tab immediately so browser popup blockers are less likely to block WhatsApp.
    whatsappWindow=window.open('about:blank','_blank');
  }
  try{
    await request({action:'status',complaintId:id,status});
    const c=complaints.find(x=>String(x.complaintId)===String(id));
    if(c){
      c.status=status; c.updatedAt=new Date().toISOString();
      if(status==='Solved') c.solvedAt=c.updatedAt;
      render();
      if(status==='Solved' && c){
        const url=solvedWhatsAppUrl(c);
        if(url){
          if(whatsappWindow && !whatsappWindow.closed) whatsappWindow.location.href=url;
          else notifySolved(c);
        }else if(whatsappWindow && !whatsappWindow.closed){
          whatsappWindow.close();
          alert('The resident mobile number is missing or invalid, so WhatsApp confirmation could not be prepared.');
        }
      }else if(whatsappWindow && !whatsappWindow.closed){
        whatsappWindow.close();
      }
    }
  }catch(e){
    if(whatsappWindow && !whatsappWindow.closed) whatsappWindow.close();
    alert(e.message||'Status could not be updated.');
  }
};
function ensureMediaViewer(){
  if($('mediaViewer')) return;
  document.body.insertAdjacentHTML('beforeend',`<div id="mediaViewer" class="media-viewer hidden" onclick="closeMediaViewer(event)">
    <div class="media-viewer-box" onclick="event.stopPropagation()">
      <button class="media-viewer-close" type="button" onclick="closeMediaViewer()">×</button>
      <div id="mediaViewerTitle" class="media-viewer-title"></div>
      <div id="mediaViewerBody" class="media-viewer-body"></div>
    </div>
  </div>`);
}
window.viewPhoto=(url,n)=>{
  ensureMediaViewer();
  $('mediaViewerTitle').textContent=`Photo ${n}`;
  $('mediaViewerBody').innerHTML=`<img class="viewer-photo" src="${url}" alt="Complaint photo ${n}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><div class="viewer-error">Photo preview unavailable.<br><a href="${url}" target="_blank" rel="noopener">Open Photo in Google Drive ↗</a></div>`;
  $('mediaViewer').classList.remove('hidden');
};
window.viewVideo=(url,n)=>{
  ensureMediaViewer();
  $('mediaViewerTitle').textContent=`Video ${n}`;
  $('mediaViewerBody').innerHTML=`<iframe class="viewer-video" src="${url}" title="Complaint video ${n}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  $('mediaViewer').classList.remove('hidden');
};
window.closeMediaViewer=(e)=>{
  if(e && e.target!==e.currentTarget) return;
  const m=$('mediaViewer'); if(m){m.classList.add('hidden');$('mediaViewerBody').innerHTML='';}
};
document.addEventListener('keydown',e=>{if(e.key==='Escape')window.closeMediaViewer();});

if(sessionStorage.getItem('ward44_login')==='1' && sessionStorage.getItem('ward44_auth_token')){
  $('loginOverlay').classList.add('hidden');$('dashboardContent').classList.remove('hidden');load();
}
