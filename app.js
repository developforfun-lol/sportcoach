let deferredPrompt
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js')}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;document.getElementById('installBtn').hidden=false})
document.getElementById('installBtn').onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;document.getElementById('installBtn').hidden=true}
const tabs=document.querySelectorAll('nav button');const sections=document.querySelectorAll('section.tab');tabs.forEach(b=>b.addEventListener('click',()=>{sections.forEach(s=>s.classList.add('hidden'));document.getElementById(b.dataset.tab).classList.remove('hidden')}))
let scoreA=0,scoreB=0
const scoreAEl=document.getElementById('scoreA');const scoreBEl=document.getElementById('scoreB')
document.getElementById('aPlus').onclick=()=>{scoreA++;scoreAEl.textContent=scoreA}
document.getElementById('aMinus').onclick=()=>{scoreA=Math.max(0,scoreA-1);scoreAEl.textContent=scoreA}
document.getElementById('bPlus').onclick=()=>{scoreB++;scoreBEl.textContent=scoreB}
document.getElementById('bMinus').onclick=()=>{scoreB=Math.max(0,scoreB-1);scoreBEl.textContent=scoreB}
// timer with centiseconds
let tRunning=false,startTime=0,accum=0,rafId=null
const tDisp=document.getElementById('timerDisplay')
function fmt(ms){const total=Math.floor(ms/10);const cs=String(total%100).padStart(2,'0');const s=Math.floor(total/100)%60;const m=Math.floor(total/6000);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+cs}
function tick(){const now=performance.now();tDisp.textContent=fmt(accum+(now-startTime));rafId=requestAnimationFrame(tick)}
document.getElementById('timerStart').onclick=()=>{if(tRunning)return;tRunning=true;startTime=performance.now();rafId=requestAnimationFrame(tick)}
document.getElementById('timerStop').onclick=()=>{if(!tRunning)return;tRunning=false;cancelAnimationFrame(rafId);accum+=performance.now()-startTime}
document.getElementById('timerReset').onclick=()=>{tRunning=false;cancelAnimationFrame(rafId);accum=0;tDisp.textContent='00:00.00'}
let db
const req=indexedDB.open('sportcoach',10)
req.onupgradeneeded=e=>{db=e.target.result;if(!db.objectStoreNames.contains('videos'))db.createObjectStore('videos',{keyPath:'id'})}
req.onsuccess=e=>{db=e.target.result}
let stream,recorder,chunks=[],currentMime=null
const preview=document.getElementById('preview')
const previewWrap=document.getElementById('previewWrap')
const cameraSel=document.getElementById('camera')
const resSel=document.getElementById('resolution')
const recStatus=document.getElementById('recStatus')
async function listCams(){const ds=await navigator.mediaDevices.enumerateDevices();const vids=ds.filter(d=>d.kind==='videoinput');cameraSel.innerHTML='';vids.forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||('Camera '+(i+1));cameraSel.appendChild(o)})}
function setAspectFromPreview(){if(!preview.videoWidth||!preview.videoHeight)return;previewWrap.style.aspectRatio = preview.videoWidth + ' / ' + preview.videoHeight}
async function startPreview(){const res=resSel.value.split('x').map(Number);const constraints={video:{width:{ideal:res[0]},height:{ideal:res[1]},facingMode:'environment'},audio:true};if(cameraSel.value)constraints.video.deviceId={exact:cameraSel.value};stream=await navigator.mediaDevices.getUserMedia(constraints);preview.srcObject=stream;preview.onloadedmetadata=()=>{setAspectFromPreview()}}
function pickType(){const types=['video/mp4;codecs=h264','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];for(const t of types){if(MediaRecorder.isTypeSupported(t)){return t}}return ''}
async function startRec(){if(!stream)await startPreview();currentMime=pickType();chunks=[];recorder=new MediaRecorder(stream,{mimeType:currentMime});recorder.ondataavailable=e=>{if(e.data&&e.data.size>0)chunks.push(e.data)};recorder.onstop=saveBlob;recorder.start(2000);document.getElementById('startRec').disabled=true;document.getElementById('stopRec').disabled=false;recStatus.textContent='Recording'}
async function stopRec(){if(recorder&&recorder.state!=='inactive'){recorder.stop()}stream&&stream.getTracks().forEach(t=>t.stop());preview.srcObject=null;document.getElementById('startRec').disabled=false;document.getElementById('stopRec').disabled=true;recStatus.textContent='Idle'}
async function saveBlob(){const blob=new Blob(chunks,{type:currentMime||'video/webm'});const id=crypto.randomUUID();const tx=db.transaction('videos','readwrite');tx.objectStore('videos').put({id,createdAt:Date.now(),size:blob.size,mime:blob.type});tx.oncomplete=()=>{caches.open('blobs').then(c=>{const url='./blob/'+id;const r=new Response(blob,{headers:{'Content-Type':blob.type}});c.put(url,r).then(()=>{refreshLibrary()})})}}
document.getElementById('startRec').onclick=startRec
document.getElementById('stopRec').onclick=stopRec
navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(()=>{listCams();startPreview()}).catch(()=>{})
cameraSel.onchange=()=>startPreview()
resSel.onchange=()=>startPreview()
const listEl=document.getElementById('videoList')
async function refreshLibrary(){listEl.innerHTML='';const tx=db.transaction('videos','readonly');const r=tx.objectStore('videos').getAll();r.onsuccess=()=>{r.result.sort((a,b)=>b.createdAt-a.createdAt).forEach(v=>{const li=document.createElement('li');const left=document.createElement('div');left.textContent=new Date(v.createdAt).toLocaleString()+' • '+Math.round(v.size/1024/1024)+' MB';const right=document.createElement('div');const play=document.createElement('button');play.textContent='Load';play.onclick=()=>loadVideo(v.id);const del=document.createElement('button');del.textContent='Delete';del.onclick=()=>confirmDelete(v.id);right.appendChild(play);right.appendChild(del);li.appendChild(left);li.appendChild(right);listEl.appendChild(li)})}}
document.getElementById('refreshLib').onclick=refreshLibrary
async function getBlobUrl(id){const cache=await caches.open('blobs');const url='./blob/'+id;const r=await cache.match(url);if(!r)return null;const b=await r.blob();return URL.createObjectURL(b)}
// track current video
let currentId=null; let currentObjectUrl=null
async function confirmDelete(id){
  const ok = window.confirm('Delete this video permanently?');
  if(!ok) return;
  await deleteVideo(id);
}
async function deleteVideo(id){ // delete from IDB and CacheStorage and stop if playing
  await new Promise((resolve)=>{
    const tx=db.transaction('videos','readwrite');
    const store=tx.objectStore('videos');
    const req=store.delete(id);
    req.onsuccess=()=>resolve(true);
    req.onerror=()=>resolve(true);
  });
  try{
    const cache = await caches.open('blobs');
    await cache.delete('./blob/'+id);
  }catch(e){}
  if(currentId===id){
    try{ player.pause(); }catch(e){}
    if(currentObjectUrl){ URL.revokeObjectURL(currentObjectUrl); currentObjectUrl=null; }
    player.removeAttribute('src'); player.load();
    document.getElementById('playToggle').textContent='Play';
  }
  refreshLibrary();
}
const player=document.getElementById('player');const canvas=document.getElementById('canvas');const wrap=document.getElementById('wrap');const ctx=canvas.getContext('2d')
let drawing=false;let paths=[];let drawMode=false;let speeds=[0.5,1,1.5,2];let speedIdx=1;let colors=['#ff4757','#ffd32a','#1e90ff','#2ed573'];let colorIdx=0
function resize(){canvas.width=wrap.clientWidth;canvas.height=wrap.clientHeight;redraw()}
function setAspectFromVideo(){if(!player.videoWidth||!player.videoHeight)return;wrap.style.aspectRatio = player.videoWidth + ' / ' + player.videoHeight;resize()}
function redraw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineWidth=4;paths.forEach(p=>{ctx.beginPath();ctx.strokeStyle=p.color||'#ff4757';p.points.forEach((pt,i)=>{if(i===0)ctx.moveTo(pt.x,pt.y);else ctx.lineTo(pt.x,pt.y)});ctx.stroke()})}
window.addEventListener('resize',resize);setTimeout(resize,0)
function setDraw(on){drawMode=on;document.getElementById('drawToggle').textContent='Draw: '+(on?'On':'Off');canvas.style.pointerEvents=on?'auto':'none'}
setDraw(false)
canvas.addEventListener('pointerdown',e=>{if(!drawMode)return;drawing=true;e.preventDefault();paths.push({color:colors[colorIdx],points:[{x:e.offsetX,y:e.offsetY,t:player.currentTime}]})})
canvas.addEventListener('pointermove',e=>{if(!drawing||!drawMode)return;e.preventDefault();paths[paths.length-1].points.push({x:e.offsetX,y:e.offsetY,t:player.currentTime});redraw()})
canvas.addEventListener('pointerup',()=>{drawing=false})
document.getElementById('undo').onclick=()=>{paths.pop();redraw()}
document.getElementById('clearBtn').onclick=()=>{paths=[];redraw()}
document.getElementById('colorBtn').onclick=()=>{colorIdx=(colorIdx+1)%colors.length;document.getElementById('colorBtn').textContent='Color: '+(['Red','Yellow','Blue','Green'][colorIdx])}
// Play/Pause toggle with label sync
const playBtn=document.getElementById('playToggle')
playBtn.onclick=()=>{if(player.paused){player.play()}else{player.pause()}}
player.addEventListener('play',()=>{playBtn.textContent='Pause'})
player.addEventListener('pause',()=>{playBtn.textContent='Play'})
document.getElementById('back5').onclick=()=>{player.currentTime=Math.max(0,player.currentTime-5)}
document.getElementById('fwd5').onclick=()=>{player.currentTime=Math.min(player.duration||1,player.currentTime+5)}
document.getElementById('speed').onclick=()=>{speedIdx=(speedIdx+1)%speeds.length;player.playbackRate=speeds[speedIdx];document.getElementById('speed').textContent=speeds[speedIdx].toFixed(1)+'x'}
document.getElementById('drawToggle').onclick=()=>setDraw(!drawMode)
document.getElementById('fsBtn').onclick=()=>{const el=wrap;const v=player;const req=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen||el.mozRequestFullScreen;if(req){req.call(el).catch(()=>{(v.webkitEnterFullscreen||v.webkitEnterFullScreen)?.call(v)})}else{(v.webkitEnterFullscreen||v.webkitEnterFullScreen)?.call(v)}}
document.getElementById('landHint').onclick=()=>{document.getElementById('hint').textContent='Rotate your phone to landscape for a larger video area.'}
async function loadVideo(id){const u=await getBlobUrl(id);if(!u)return; if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl); currentObjectUrl=null;} currentObjectUrl=u; currentId=id; player.src=u; player.onloadedmetadata=()=>{setAspectFromVideo()}; player.playbackRate=speeds[speedIdx]; paths=[]; redraw(); await player.play().catch(()=>{});}
document.getElementById('freeSpace').onclick=async()=>{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();const used=(e.usage||0)/1024/1024;const quota=(e.quota||0)/1024/1024;alert('Local storage usage: '+used.toFixed(1)+' MB / '+quota.toFixed(1)+' MB')}else{alert('Storage estimate not supported on this browser.')}}
refreshLibrary()
