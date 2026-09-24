const API_URL = 'https://script.google.com/macros/s/AKfycbzvyQZsdZO5IM3-kMApnHlcyD-D8oQOC_BrGpjicHOFlMRkcaFju4xc6ie991Qp0WSpTQ/exec';
const WARD_WHATSAPP = '917737155269'; // Replace with the Ward Parshad WhatsApp number.
let imageFiles = [], videoFile = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt = t => t ? new Date(t).toLocaleString('en-IN', {dateStyle:'medium', timeStyle:'short'}) : '—';

async function apiPost(body, options={}){
  const timeoutMs = options.timeoutMs || (body && body.action === 'media' ? 60000 : 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(API_URL, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(body), signal:controller.signal, cache:'no-store'
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { throw new Error('Google Sheets backend returned an invalid response.'); }
    if (!data.ok) throw new Error(data.message || 'Request failed.');
    return data;
  } finally { clearTimeout(timer); }
}

async function apiGet(params){
  const u = new URL(API_URL);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k,v));
  const r = await fetch(u.toString(), {cache:'no-store'});
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { throw new Error('Google Sheets backend returned an invalid response.'); }
  if (!data.ok) throw new Error(data.message || 'Request failed.');
  return data;
}

function showFiles(){
  $('imageName').textContent = imageFiles.length ? `${imageFiles.length} file(s) selected` : 'No files chosen';
  $('videoName').textContent = videoFile ? `${videoFile.name} (${Math.round(videoFile.size/1024/1024*10)/10} MB)` : 'No file chosen';
  const box = $('mediaPreview'); box.innerHTML = '';
  imageFiles.slice(0,4).forEach(f => { const u=URL.createObjectURL(f); box.innerHTML += `<img src="${u}" alt="Issue image preview">`; });
  if(videoFile){ const u=URL.createObjectURL(videoFile); box.innerHTML += `<video src="${u}" controls preload="metadata"></video>`; }
}

function setImageFiles(files){
  imageFiles=[...files].slice(0,4);
  showFiles();
}
function setVideoFile(file){
  videoFile=file||null;
  showFiles();
}
$('imageInput')?.addEventListener('change', e => setImageFiles(e.target.files));
$('videoInput')?.addEventListener('change', e => setVideoFile(e.target.files[0]));

let cameraStream=null, cameraMode=null, recorder=null, recordedChunks=[], videoStopTimer=null;

function stopCameraStream(){
  if(videoStopTimer) clearTimeout(videoStopTimer);
  videoStopTimer=null;
  if(recorder && recorder.state!=='inactive') { try{ recorder.stop(); }catch(_){} }
  recorder=null;
  if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; }
  const v=$('cameraPreview'); if(v) v.srcObject=null;
}
function closeCamera(){
  stopCameraStream();
  const m=$('cameraModal'); if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}
}
async function openCamera(mode){
  cameraMode=mode;
  const modal=$('cameraModal'), title=$('cameraTitle'), hint=$('cameraHint'), photoBtn=$('takePhotoBtn'), startBtn=$('startVideoBtn'), stopBtn=$('stopVideoBtn'), preview=$('cameraPreview');
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ alert('Your browser does not support in-page camera access. Please use Upload instead.'); return; }
  stopCameraStream();
  title.textContent=mode==='photo'?'Take Photo':'Record Video';
  photoBtn.classList.toggle('hidden',mode!=='photo'); startBtn.classList.toggle('hidden',mode!=='video'); stopBtn.classList.add('hidden');
  hint.textContent=mode==='photo'?'Low-memory photo mode • maximum 1280px.':'Low-memory video mode • 640×480 • maximum 10 seconds.';
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  try{
    const videoConstraints={facingMode:{ideal:'environment'},width:{ideal:640,max:1280},height:{ideal:480,max:720},frameRate:{ideal:15,max:20}};
    // Video capture should still work when microphone permission is denied.
    // First try camera + microphone, then fall back to camera-only.
    try{
      cameraStream=await navigator.mediaDevices.getUserMedia({video:videoConstraints,audio:mode==='video'});
    }catch(firstErr){
      if(mode!=='video') throw firstErr;
      cameraStream=await navigator.mediaDevices.getUserMedia({video:videoConstraints,audio:false});
    }
    preview.srcObject=cameraStream;
    await preview.play().catch(()=>{});
  }catch(err){
    closeCamera();
    alert(mode==='video'
      ? 'Video camera could not be started. Please allow camera access, or use “Upload Video” to choose/record a video from your phone.'
      : 'Camera permission was denied or the camera is unavailable. Please allow camera access and try again, or use Upload.');
  }
}
function capturePhoto(){
  const v=$('cameraPreview'), canvas=$('cameraCanvas');
  if(!v.videoWidth) return;
  const max=1280, scale=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));
  canvas.width=Math.max(1,Math.round(v.videoWidth*scale)); canvas.height=Math.max(1,Math.round(v.videoHeight*scale));
  const ctx=canvas.getContext('2d',{alpha:false}); ctx.drawImage(v,0,0,canvas.width,canvas.height);
  canvas.toBlob(blob=>{
    if(!blob){alert('Could not capture the photo.');return;}
    setImageFiles([new File([blob],'camera-photo.jpg',{type:'image/jpeg'})]);
    closeCamera();
  },'image/jpeg',0.72);
}
function startVideoRecording(){
  if(!cameraStream || !window.MediaRecorder){
    alert('Video recording is not supported in this browser. Please use “Upload Video” and choose/record a video from your phone.');
    return;
  }
  const candidates=[
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=h264',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  const mime=candidates.find(x=>MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x)) || '';
  try{
    recorder=mime
      ? new MediaRecorder(cameraStream,{mimeType:mime,videoBitsPerSecond:420000,audioBitsPerSecond:32000})
      : new MediaRecorder(cameraStream);
  }catch(err){
    alert('Video recording is not supported in this browser. Please use “Upload Video”.');
    return;
  }
  recordedChunks=[];
  recorder.ondataavailable=e=>{if(e.data&&e.data.size) recordedChunks.push(e.data);};
  recorder.onerror=()=>{ alert('Video recording failed. Please try “Upload Video”.'); };
  recorder.onstop=()=>{
    const type=recorder?.mimeType || mime || 'video/webm';
    const blob=new Blob(recordedChunks,{type});
    if(blob.size>6*1024*1024){ alert('The recorded video is too large. Please record a shorter video.'); return; }
    const ext=type.includes('mp4')?'mp4':'webm';
    setVideoFile(new File([blob],`camera-video.${ext}`,{type:type.split(';')[0]||'video/webm'}));
    stopCameraStream();
    const modal=$('cameraModal'); if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}
  };
  try{ recorder.start(1000); }catch(err){ alert('Could not start video recording. Please use “Upload Video”.'); return; }
  $('startVideoBtn').classList.add('hidden'); $('stopVideoBtn').classList.remove('hidden');
  $('cameraHint').textContent='Recording… tap Stop Video when finished (maximum 10 seconds).';
  videoStopTimer=setTimeout(()=>{if(recorder && recorder.state==='recording') recorder.stop();},10000);
}
function stopVideoRecording(){ if(recorder && recorder.state==='recording') recorder.stop(); }
$('openPhotoCamera')?.addEventListener('click',()=>openCamera('photo'));
$('openVideoCamera')?.addEventListener('click',()=>openCamera('video'));
$('takePhotoBtn')?.addEventListener('click',capturePhoto);
$('startVideoBtn')?.addEventListener('click',startVideoRecording);
$('stopVideoBtn')?.addEventListener('click',stopVideoRecording);
$('closeCamera')?.addEventListener('click',closeCamera);
$('cameraModal')?.addEventListener('click',e=>{if(e.target.id==='cameraModal') closeCamera();});

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(new Error('Could not read the selected media.'));
    reader.readAsDataURL(file);
  });
}

function compressImage(file){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>{
      try{
        const max=1600, scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>{
          URL.revokeObjectURL(url);
          if(!blob) return reject(new Error('Could not prepare the photo.'));
          resolve(new File([blob],(file.name.replace(/\.[^.]+$/,'')||'photo')+'.jpg',{type:'image/jpeg'}));
        },'image/jpeg',0.78);
      }catch(err){URL.revokeObjectURL(url);reject(err);}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not read the photo.'));};
    img.src=url;
  });
}

async function uploadMedia(complaintId){
  const files=[];
  for(const f of imageFiles) files.push(await compressImage(f));
  if(videoFile) files.push(videoFile);
  if(!files.length) return {count:0};

  const maxClient=6*1024*1024;
  if(videoFile && videoFile.size>maxClient) throw new Error('Video is larger than 6 MB. Please record a shorter video or choose a smaller video.');

  const uploadKey=window.__ward44UploadKey || '';
  if(!uploadKey) throw new Error('Media authorization was not received. Please try submitting the complaint again.');

  const uploaded=[];
  for(let i=0;i<files.length;i++){
    const f=files[i];
    if(f.size>maxClient) throw new Error(`${f.name} is larger than 6 MB.`);
    const status=$('mediaUploadStatus');
    if(status) status.textContent=`Uploading media ${i+1} of ${files.length}…`;

    const dataUrl=await fileToDataUrl(f);
    const payload={action:'media',complaintId,uploadKey,files:[{name:f.name,mime:f.type,base64:dataUrl.split(',')[1]}]};
    let lastError=null;
    for(let attempt=1;attempt<=3;attempt++){
      try{
        await apiPost(payload,{timeoutMs:60000});
        lastError=null;
        break;
      }catch(err){
        lastError=err;
        if(attempt<3){
          if(status) status.textContent=`Media upload retry ${attempt}…`;
          await new Promise(r=>setTimeout(r,1200*attempt));
        }
      }
    }
    if(lastError) throw lastError;
    uploaded.push(f.name);
  }
  if($('mediaUploadStatus')) $('mediaUploadStatus').textContent=`✓ ${uploaded.length} media file(s) saved to Google Drive.`;
  return {count:uploaded.length};
}

async function retryPendingMedia(){
  const complaintId=window.__ward44ComplaintId || $('newId')?.textContent.trim();
  if(!complaintId || !window.__ward44UploadKey){
    if($('mediaUploadStatus')) $('mediaUploadStatus').textContent='Media authorization is no longer available. Please submit a new complaint.';
    return;
  }
  const btn=$('retryMediaBtn');
  if(btn){btn.disabled=true;btn.textContent='Retrying media…';}
  try{
    const result=await uploadMedia(complaintId);
    if($('successBox')?.querySelector('p')) $('successBox').querySelector('p').textContent='Your problem will be resolved within 3 to 7 days. If additional time is required, it may take up to 1 month. Media has been saved to Google Drive. आपकी समस्या 3 से 7 दिनों के भीतर हल करने का हमारा प्रयास रहेगा। विशेष परिस्थिति में समाधान में अधिकतम 1 माह तक लग सकता है।';
    if(btn) btn.classList.add('hidden');
    return result;
  }catch(err){
    console.error(err);
    if($('mediaUploadStatus')) $('mediaUploadStatus').textContent='Media upload failed again. Keep this page open and try Retry Media Upload once more.';
  }finally{
    if(btn){btn.disabled=false;btn.textContent='↻ Retry Media Upload';}
  }
}

function captureGPS(){
  const s = $('gpsStatus');
  const btn = $('getGps');
  if(!navigator.geolocation){ s.textContent='GPS is not supported on this device/browser.'; return; }
  btn.disabled = true; btn.textContent='Capturing…'; s.textContent='Requesting your location…';
  navigator.geolocation.getCurrentPosition(p=>{
    const lat=p.coords.latitude, lng=p.coords.longitude, acc=Math.round(p.coords.accuracy);
    $('latitude').value=lat.toFixed(6); $('longitude').value=lng.toFixed(6); $('gpsAccuracy').value=acc;
    s.textContent=`GPS captured • accuracy ±${acc} m`;
    const link=$('gpsMapLink');
    link.href=`https://www.google.com/maps?q=${encodeURIComponent(lat+','+lng)}`;
    link.classList.remove('hidden');
    btn.disabled=false; btn.textContent='Update My Location';
  },err=>{
    const msg = err.code===1 ? 'Location permission denied. Allow location access and try again.' : err.code===2 ? 'Location unavailable. Please move to an open area and try again.' : 'Location request timed out. Try again.';
    s.textContent=msg; btn.disabled=false; btn.textContent='Try GPS Again';
  },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
$('getGps')?.addEventListener('click', captureGPS);

function buildWhatsAppMessage(result, payload, mediaSaved='pending'){
  return [
    'JAN SEVA YOJANA - WARD NO. 44',
    'New Citizen Issue',
    'Complaint ID: '+result.complaintId,
    'Parshad: Moinuddin',
    'Resident: '+payload.name,
    'Mobile: '+payload.mobile,
    'Location: '+payload.location,
    'Category: '+payload.category,
    'Problem: '+payload.description,
    'GPS: '+(payload.latitude&&payload.longitude?payload.latitude+', '+payload.longitude:'Not captured'),
    'Status: Registered',
    mediaSaved==='saved'?'Media: Saved to Google Drive':mediaSaved==='failed'?'Media: Upload failed - retry from portal':'Media: Uploading to Google Drive',
    'Your problem will be resolved within 3 to 7 days. If additional time is required, it may take up to 1 month.\nआपकी समस्या 3 से 7 दिनों के भीतर हल करने का हमारा प्रयास रहेगा। विशेष परिस्थिति में समाधान में अधिकतम 1 माह तक लग सकता है।'
  ].join('\n');
}

function openWhatsAppDirect(url, preOpenedWindow){
  // The blank window is opened from the original submit click, so browsers are
  // much less likely to block it. We then navigate it immediately after the
  // complaint ID is returned, before the slower media upload starts.
  if(preOpenedWindow && !preOpenedWindow.closed){
    try { preOpenedWindow.location.href=url; return true; } catch(_) {}
  }
  try {
    window.location.href = url;
    return true;
  } catch(_) {
    return false;
  }
}

$('complaintForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter || $('submitBtn');
  const oldText = btn.textContent;

  // Open a blank tab immediately from the user's click. This prevents the
  // browser popup blocker from stopping WhatsApp after the async API call.
  let waWindow = null;
  if(!WARD_WHATSAPP.includes('X')){
    try { waWindow = window.open('about:blank','_blank'); } catch(_) { waWindow=null; }
  }

  btn.disabled = true; btn.textContent = 'Registering…';
  if($('mediaUploadStatus')) $('mediaUploadStatus').textContent='';
  const fd = new FormData(e.target);
  const payload = {
    action:'create', name:fd.get('name'), mobile:fd.get('mobile'), location:fd.get('location'),
    category:fd.get('category'), priority:'Normal', description:fd.get('description'),
    latitude:fd.get('latitude') || '', longitude:fd.get('longitude') || '', gpsAccuracy:fd.get('gpsAccuracy') || ''
  };
  try {
    // Register first so the complaint number is available as soon as possible.
    const result = await apiPost(payload);
    window.__ward44UploadKey = result.uploadKey || '';
    window.__ward44ComplaintId = result.complaintId || '';

    $('newId').textContent = result.complaintId;
    $('successBox').classList.remove('hidden');
    e.target.classList.add('hidden');

    // IMPORTANT: WhatsApp opens immediately after the complaint ID is created.
    // It does NOT wait for photo/video upload.
    if(!WARD_WHATSAPP.includes('X')){
      const text = buildWhatsAppMessage(result, payload, 'pending');
      const waUrl = `https://wa.me/${WARD_WHATSAPP}?text=${encodeURIComponent(text)}`;
      openWhatsAppDirect(waUrl, waWindow);
    } else if(waWindow && !waWindow.closed){
      try{ waWindow.close(); }catch(_){}
    }

    if($('mediaUploadStatus')) $('mediaUploadStatus').textContent = (imageFiles.length || videoFile) ? 'Complaint registered. Saving your photo/video to Google Drive…' : '';

    const mediaCount = imageFiles.length + (videoFile ? 1 : 0);
    let mediaSaved=true;
    if(mediaCount){
      if($('retryMediaBtn')) $('retryMediaBtn').classList.add('hidden');
      try{
        await uploadMedia(result.complaintId);
        if($('successBox').querySelector('p')) $('successBox').querySelector('p').textContent='Your problem will be resolved within 3 to 7 days. If additional time is required, it may take up to 1 month. Media has been saved to Google Drive. आपकी समस्या 3 से 7 दिनों के भीतर हल करने का हमारा प्रयास रहेगा। विशेष परिस्थिति में समाधान में अधिकतम 1 माह तक लग सकता है।';
      }catch(err){
        mediaSaved=false;
        console.error(err);
        if($('mediaUploadStatus')) $('mediaUploadStatus').textContent='Complaint is registered, but the photo/video could not be saved. Please keep this page open and tap Retry Media Upload.';
        if($('retryMediaBtn')) $('retryMediaBtn').classList.remove('hidden');
      }
    }

    renderRecent();
    window.scrollTo({top:$('register').offsetTop-20, behavior:'smooth'});
  } catch(err) {
    if(waWindow && !waWindow.closed){ try{ waWindow.close(); }catch(_){} }
    console.error(err);
    alert(err.name === 'AbortError' ? 'The server took too long to respond. Please try again.' : (err.message || 'Complaint could not be registered. Please try again.'));
  } finally { btn.disabled=false; btn.textContent=oldText; }
});

$('retryMediaBtn')?.addEventListener('click',retryPendingMedia);

$('sendComplaintWhatsApp')?.addEventListener('click',()=>{
  const complaintId=$('newId')?.textContent.trim();
  if(!complaintId) return;
  if(WARD_WHATSAPP.includes('X')){
    alert('Please set the Ward WhatsApp number in app.js first.');
    return;
  }
  const text=`JAN SEVA YOJANA - WARD NO. 44\nComplaint ID: ${complaintId}\nParshad: Moinuddin\nYour complaint has been registered successfully.\nYour problem will be resolved within 3 to 7 days. If additional time is required, it may take up to 1 month.\nआपकी समस्या 3 से 7 दिनों के भीतर हल करने का हमारा प्रयास रहेगा। विशेष परिस्थिति में समाधान में अधिकतम 1 माह तक लग सकता है।`;
  const url=`https://wa.me/${WARD_WHATSAPP}?text=${encodeURIComponent(text)}`;
  window.open(url,'_blank');
});

$('newComplaint')?.addEventListener('click',()=>{
  $('successBox').classList.add('hidden'); $('complaintForm').classList.remove('hidden'); $('complaintForm').reset();
  imageFiles=[]; videoFile=null; showFiles();
  if($('gpsStatus')) $('gpsStatus').textContent='Location not captured';
  if($('gpsMapLink')) $('gpsMapLink').classList.add('hidden');
  window.__ward44ComplaintId=''; window.__ward44UploadKey='';
  if($('retryMediaBtn')) $('retryMediaBtn').classList.add('hidden');
  window.scrollTo({top:$('register').offsetTop-20,behavior:'smooth'});
});

$('waChat')?.addEventListener('click',e=>{
  e.preventDefault();
  if(WARD_WHATSAPP.includes('X')) { alert('Please set the Ward WhatsApp number in app.js first.'); return; }
  window.open(`https://wa.me/${WARD_WHATSAPP}?text=${encodeURIComponent('Hello Moinuddin, I want to register an issue for Ward No. 44, Indra Colony, Pali.')}`,'_blank');
});

$('trackBtn')?.addEventListener('click', async()=>{
  const id=$('trackId').value.trim().toUpperCase(), box=$('trackResult');
  if(!id){box.innerHTML='<div class="result">Please enter a Complaint ID.</div>';return;}
  box.innerHTML='<div class="result">Checking status…</div>';
  try{
    const j=await apiGet({action:'track',id});
    const c=j.complaint;
    box.innerHTML=`<div class="result"><b>${esc(c.complaintId)}</b> · ${esc(c.category)}<br>${esc(c.location)}<br>Status: <strong>${esc(c.status)}</strong><br>Registered: ${fmt(c.registeredAt)}${c.latitude&&c.longitude?`<br><a class="map" target="_blank" href="https://www.google.com/maps?q=${encodeURIComponent(c.latitude+','+c.longitude)}">Open GPS location ↗</a>`:''}<br><br>Your problem will be resolved within 3 to 7 days. If additional time is required, it may take up to 1 month.\nआपकी समस्या 3 से 7 दिनों के भीतर हल करने का हमारा प्रयास रहेगा। विशेष परिस्थिति में समाधान में अधिकतम 1 माह तक लग सकता है।</div>`;
  }catch(err){ console.error(err); box.innerHTML='<div class="result">Unable to check status right now. Please try again.</div>'; }
});

async function renderRecent(){
  const box=$('recentList');
  if(!box) return;
  box.innerHTML='<div class="recent-item"><small>Loading recent complaints…</small></div>';
  try{
    const j=await apiGet({action:'recent',limit:'5'});
    const list=j.complaints||[];
    if(!list.length){ box.innerHTML='<div class="recent-item"><small>No complaints registered yet.</small></div>'; return; }
    box.innerHTML=list.map(c=>{
      const cls=c.status==='Solved'?'solved':c.status==='In Progress'?'progress':'registered';
      return `<div class="recent-item"><div><b>${esc(c.complaintId)}</b><small>${esc(c.category)} · ${esc(c.location)}</small><small>${fmt(c.registeredAt)}</small></div><span class="badge ${cls}">${esc(c.status)}</span></div>`;
    }).join('');
  }catch(err){ console.error(err); box.innerHTML='<div class="recent-item"><small>Recent complaints are temporarily unavailable.</small></div>'; }
}
$('viewAll')?.addEventListener('click',renderRecent);
const scheduleIdle = window.requestIdleCallback || (cb => setTimeout(cb, 700));
scheduleIdle(renderRecent);

// Lightweight welcome slideshow. It shows once per browser session and does not
// block the portal after the user starts using it.
(function initWelcome(){
  const modal=$('welcomeModal');
  if(!modal) return;
  const slides=[...modal.querySelectorAll('.welcome-slide')];
  const dots=[...modal.querySelectorAll('.welcome-dots span')];
  const close=()=>{modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');try{sessionStorage.setItem('ward44WelcomeSeen','1')}catch(_){} };
  let index=0, timer;
  const show=i=>{index=(i+slides.length)%slides.length;slides.forEach((x,n)=>x.classList.toggle('active',n===index));dots.forEach((x,n)=>x.classList.toggle('active',n===index));};
  const startAuto=()=>{clearInterval(timer);timer=setInterval(()=>show(index+1),4200);};
  $('closeWelcome')?.addEventListener('click',close);
  $('welcomeStart')?.addEventListener('click',close);
  dots.forEach((d,i)=>d.addEventListener('click',()=>{show(i);startAuto();}));
  modal.addEventListener('click',e=>{if(e.target===modal)close();});
  let seen=false;try{seen=sessionStorage.getItem('ward44WelcomeSeen')==='1'}catch(_){}
  if(!seen){setTimeout(()=>{modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');startAuto();},350);}
})();
