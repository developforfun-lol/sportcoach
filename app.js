
let deferredPrompt;if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js')}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;document.getElementById('installBtn').hidden=false})
document.getElementById('installBtn').onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;document.getElementById('installBtn').hidden=true}

const tabs=[...document.querySelectorAll('nav button')];const sections=[...document.querySelectorAll('section.tab')]
tabs.forEach(b=>b.addEventListener('click',()=>{sections.forEach(s=>s.classList.add('hidden'));document.getElementById(b.dataset.tab).classList.remove('hidden')}))

let scoreA=0,scoreB=0
const scoreAEl=document.getElementById('scoreA');const scoreBEl=document.getElementById('scoreB')
document.getElementById('aPlus').onclick=()=>{scoreA++;scoreAEl.textContent=scoreA}
document.getElementById('aMinus').onclick=()=>{scoreA=Math.max(0,scoreA-1);scoreAEl.textContent=scoreA}
document.getElementById('bPlus').onclick=()=>{scoreB++;scoreBEl.textContent=scoreB}
document.getElementById('bMinus').onclick=()=>{scoreB=Math.max(0,scoreB-1);scoreBEl.textContent=scoreB}

let tRunning=false,startTime=0,accum=0,rafId=null
const tDisp=document.getElementById('timerDisplay')
function fmt(ms){const total=Math.floor(ms/10);const cs=String(total%100).padStart(2,'0');const s=Math.floor(total/100)%60;const m=Math.floor(total/6000);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+cs}
function fmtS(sec){const s=Math.floor(sec%60);const m=Math.floor(sec/60);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
function tick(){const now=performance.now();tDisp.textContent=fmt(accum+(now-startTime));rafId=requestAnimationFrame(tick)}
document.getElementById('timerStart').onclick=()=>{if(tRunning)return;tRunning=true;startTime=performance.now();rafId=requestAnimationFrame(tick)}
document.getElementById('timerStop').onclick=()=>{if(!tRunning)return;tRunning=false;cancelAnimationFrame(rafId);accum+=performance.now()-startTime}
document.getElementById('timerReset').onclick=()=>{tRunning=false;cancelAnimationFrame(rafId);accum=0;tDisp.textContent='00:00.00'}
function nowGameMs(){return accum+(tRunning?(performance.now()-startTime):0)}

let db;const req=indexedDB.open('sportcoach',15)
req.onupgradeneeded=e=>{db=e.target.result;if(!db.objectStoreNames.contains('videos'))db.createObjectStore('videos',{keyPath:'id'})}
req.onsuccess=e=>{db=e.target.result;refreshLibrary()}

let stream,recorder,chunks=[],currentMime=null
let currentRecordingMarkers=[],recStartPerf=0,recBaseGameMs=0
const preview=document.getElementById('preview')
const previewWrap=document.getElementById('previewWrap')
const cameraSel=document.getElementById('camera')
const resSel=document.getElementById('resolution')
const recStatus=document.getElementById('recStatus')

async function listCams(){const ds=await navigator.mediaDevices.enumerateDevices();const vids=ds.filter(d=>d.kind==='videoinput');cameraSel.innerHTML='';vids.forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||('Camera '+(i+1));cameraSel.appendChild(o)})}
function setAspectFromPreview(){if(!preview.videoWidth||!preview.videoHeight)return;previewWrap.style.aspectRatio=preview.videoWidth+' / '+preview.videoHeight}
async function startPreview(){const res=resSel.value.split('x').map(Number);const c={video:{width:{ideal:res[0]},height:{ideal:res[1]},facingMode:'environment'},audio:true};if(cameraSel.value)c.video.deviceId={exact:cameraSel.value};stream=await navigator.mediaDevices.getUserMedia(c);preview.srcObject=stream;preview.onloadedmetadata=()=>{setAspectFromPreview();preview.play?.()}}
function pickType(){const types=['video/mp4;codecs=h264','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];for(const t of types){if(MediaRecorder.isTypeSupported(t)){return t}}return ''}

async function startRec(){
  if(!stream)await startPreview();
  currentMime=pickType();chunks=[];currentRecordingMarkers=[];recStartPerf=performance.now();
  recBaseGameMs=nowGameMs();
  recorder=new MediaRecorder(stream,{mimeType:currentMime||undefined});
  recorder.ondataavailable=e=>{if(e.data&&e.data.size>0)chunks.push(e.data)};
  recorder.onstop=saveBlob;
  recorder.start(2000);
  document.getElementById('startRec').disabled=true;
  document.getElementById('stopRec').disabled=false;
  recStatus.textContent='Recording';
}
async function stopRec(){
  if(recorder&&recorder.state!=='inactive'){recorder.stop()}
  if(stream){stream.getTracks().forEach(t=>t.stop());preview.srcObject=null;stream=null}
  document.getElementById('startRec').disabled=false;
  document.getElementById('stopRec').disabled=true;
  recStatus.textContent='Idle';
}
function addMarker(label){
  if(!recStartPerf){recStatus.textContent='Not recording';return}
  const recMs=performance.now()-recStartPerf;
  currentRecordingMarkers.push({id:crypto.randomUUID(),label,gameMs:nowGameMs(),recMs,createdAt:Date.now()});
  recStatus.textContent='Marked: '+label+' @ '+fmtS(Math.floor(recMs/1000));
}
document.getElementById('mkGoal').onclick=()=>addMarker('Goal')
document.getElementById('mkFoul').onclick=()=>addMarker('Foul')
document.getElementById('mkSub').onclick=()=>addMarker('Sub')
document.getElementById('mkShot').onclick=()=>addMarker('Shot')

const modal=document.getElementById('markModal')
const markInput=document.getElementById('markInput')
document.getElementById('mkCustom').onclick=()=>{markInput.value='';modal.classList.remove('hidden');markInput.focus()}
document.getElementById('markCancel').onclick=()=>{modal.classList.add('hidden')}
document.getElementById('markOK').onclick=()=>{const v=markInput.value.trim();if(v){addMarker(v.slice(0,24))}modal.classList.add('hidden')}
markInput.addEventListener('keydown',e=>{if(e.key==='Enter'){document.getElementById('markOK').click()}})

async function saveBlob(){
  const blob=new Blob(chunks,{type:currentMime||'video/webm'})
  const id=crypto.randomUUID()
  const meta={id,createdAt:Date.now(),size:blob.size,mime:blob.type,markers:currentRecordingMarkers,baseGameMs:recBaseGameMs}
  const tx=db.transaction('videos','readwrite');tx.objectStore('videos').put(meta)
  tx.oncomplete=()=>{caches.open('blobs').then(c=>{const url='./blob/'+id;const r=new Response(blob,{headers:{'Content-Type':blob.type}});c.put(url,r).then(()=>{refreshLibrary()})})}
}

navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(()=>{listCams();startPreview()}).catch(()=>{})
cameraSel.onchange=()=>startPreview()
resSel.onchange=()=>startPreview()
document.getElementById('startRec').onclick=startRec
document.getElementById('stopRec').onclick=stopRec

const listEl=document.getElementById('videoList')
async function refreshLibrary(){
  if(!db)return
  listEl.innerHTML=''
  const tx=db.transaction('videos','readonly')
  const r=tx.objectStore('videos').getAll()
  r.onsuccess=()=>{r.result.sort((a,b)=>b.createdAt-a.createdAt).forEach(v=>{
    const li=document.createElement('li')
    const left=document.createElement('div')
    const mk=(v.markers||[]).length
    left.textContent=new Date(v.createdAt).toLocaleString()+' • '+Math.round(v.size/1024/1024)+' MB • '+mk+' marks'
    const right=document.createElement('div')
    const play=document.createElement('button');play.textContent='Load';play.onclick=()=>loadVideo(v.id)
    const del=document.createElement('button');del.textContent='Delete';del.onclick=()=>confirmDelete(v.id)
    right.appendChild(play);right.appendChild(del)
    li.appendChild(left);li.appendChild(right)
    listEl.appendChild(li)
  })}
}
document.getElementById('refreshLib').onclick=refreshLibrary

async function getBlobUrl(id){
  const cache=await caches.open('blobs');const url='./blob/'+id;const r=await cache.match(url);if(!r)return null;const b=await r.blob();return URL.createObjectURL(b)
}

let currentId=null,currentObjectUrl=null,currentMeta=null
const player=document.getElementById('player');const markerBar=document.getElementById('markerBar');const wrap=document.getElementById('wrap')
const hudRec=document.getElementById('hudRec');const hudGame=document.getElementById('hudGame')

async function loadVideo(id){
  currentId=id
  const tx=db.transaction('videos','readonly')
  tx.objectStore('videos').get(id).onsuccess=async(e)=>{
    currentMeta=e.target.result
    if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=null}
    const url=await getBlobUrl(id);if(!url){alert('Video blob missing');return}
    currentObjectUrl=url;player.src=url
    await new Promise(res=>{player.onloadedmetadata=()=>{applyVideoAspect();res()}})
    await player.play().catch(()=>{})
    document.getElementById('playToggle').textContent='Pause'
    renderMarkers();updateHUD()
  }
}

function applyVideoAspect(){
  const w=player.videoWidth||16,h=player.videoHeight||9
  wrap.style.aspectRatio=w+' / '+h
  if(h>w){
    wrap.style.maxWidth='min(90vw,520px)'
    wrap.style.height='70vh'
  }else{
    wrap.style.maxWidth='760px'
    wrap.style.height='auto'
  }
  resizeCanvas()
}

function renderMarkers(){
  markerBar.innerHTML=''
  if(!currentMeta||!currentMeta.markers||currentMeta.markers.length===0){markerBar.textContent='No markers';return}
  currentMeta.markers.forEach(m=>{
    const chip=document.createElement('button');chip.className='marker-chip';chip.textContent=m.label
    const s=document.createElement('small');s.textContent=' rec '+fmtS(Math.floor(m.recMs/1000))+' | game '+fmt(Math.floor(m.gameMs))
    chip.appendChild(s);chip.onclick=()=>{player.currentTime=Math.max(0,m.recMs/1000-0.3)}
    markerBar.appendChild(chip)
  })
}

function recToGameMs(tMs){
  if(currentMeta?.baseGameMs!=null){return currentMeta.baseGameMs + tMs}
  if(currentMeta?.markers?.length){
    const arr=currentMeta.markers.slice().sort((a,b)=>a.recMs-b.recMs);
    let offset = arr[0].gameMs - arr[0].recMs;
    for(const m of arr){ if(m.recMs<=tMs) offset = m.gameMs - m.recMs; else break }
    return tMs + offset;
  }
  return tMs;
}

function updateHUD(){
  const recMs = (player.currentTime||0)*1000;
  hudRec.textContent = 'REC '+fmtS(Math.floor(recMs/1000));
  const gMs = recToGameMs(recMs);
  hudGame.textContent = 'GAME '+fmtS(Math.floor(gMs/1000));
}
player.addEventListener('timeupdate',updateHUD);
player.addEventListener('seeked',updateHUD);
player.addEventListener('loadedmetadata',updateHUD);

function seekBy(sec){player.currentTime=Math.max(0,player.currentTime+sec)}
document.getElementById('back1').onclick=()=>seekBy(-1)
document.getElementById('back5').onclick=()=>seekBy(-5)
document.getElementById('back10').onclick=()=>seekBy(-10)
document.getElementById('back30').onclick=()=>seekBy(-30)
document.getElementById('fwd1').onclick=()=>seekBy(1)
document.getElementById('fwd5').onclick=()=>seekBy(5)
document.getElementById('fwd10').onclick=()=>seekBy(10)
document.getElementById('fwd30').onclick=()=>seekBy(30)
document.getElementById('playToggle').onclick=()=>{if(player.paused){player.play();document.getElementById('playToggle').textContent='Pause'}else{player.pause();document.getElementById('playToggle').textContent='Play'}}

const speeds=[0.25,0.5,0.75,1,1.25,1.5,1.75,2,2.5,3];let speedIdx=3
document.getElementById('speed').onclick=()=>{speedIdx=(speedIdx+1)%speeds.length;player.playbackRate=speeds[speedIdx];document.getElementById('speed').textContent=speeds[speedIdx].toFixed(2)+'x'}

const canvas=document.getElementById('canvas');const ctx=canvas.getContext('2d')
let drawing=false,paths=[],currentPath=[],color='red',drawEnabled=false
function resizeCanvas(){const r=canvas.getBoundingClientRect();canvas.width=r.width*devicePixelRatio;canvas.height=r.height*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);redraw()}
function redraw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineCap='round';ctx.lineJoin='round';paths.forEach(p=>{ctx.strokeStyle=p.color;ctx.lineWidth=4;ctx.beginPath();p.points.forEach((pt,i)=>{if(i===0)ctx.moveTo(pt.x,pt.y);else ctx.lineTo(pt.x,pt.y)});ctx.stroke()});if(currentPath.length){ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();currentPath.forEach((pt,i)=>{if(i===0)ctx.moveTo(pt.x,pt.y);else ctx.lineTo(pt.x,pt.y)});ctx.stroke()}}
function toLocal(e){const r=canvas.getBoundingClientRect();const x=(e.touches?e.touches[0].clientX:e.clientX)-r.left;const y=(e.touches?e.touches[0].clientY:e.clientY)-r.top;return {x,y}}
function startDraw(e){if(!drawEnabled)return;drawing=true;currentPath=[toLocal(e)];redraw();e.preventDefault()}
function moveDraw(e){if(!drawing)return;currentPath.push(toLocal(e));redraw();e.preventDefault()}
function endDraw(){if(!drawing)return;drawing=false;paths.push({color,points:currentPath});currentPath=[];redraw()}
window.addEventListener('resize',()=>{applyVideoAspect()})
canvas.addEventListener('mousedown',startDraw);canvas.addEventListener('mousemove',moveDraw);window.addEventListener('mouseup',endDraw)
canvas.addEventListener('touchstart',startDraw,{passive:false});canvas.addEventListener('touchmove',moveDraw,{passive:false});canvas.addEventListener('touchend',endDraw)
resizeCanvas()

document.getElementById('drawToggle').onclick=()=>{drawEnabled=!drawEnabled;document.getElementById('drawToggle').textContent='Draw: '+(drawEnabled?'On':'Off')}
document.getElementById('colorBtn').onclick=()=>{color=color==='red'?'yellow':color==='yellow'?'blue':color==='blue'?'white':'red';document.getElementById('colorBtn').textContent='Color: '+(color[0].toUpperCase()+color.slice(1))}
document.getElementById('undo').onclick=()=>{paths.pop();redraw()}
document.getElementById('clearBtn').onclick=()=>{paths=[];currentPath=[];redraw()}

document.getElementById('fsBtn').onclick=()=>{const el=document.getElementById('wrap');if(!document.fullscreenElement){el.requestFullscreen?.()}else{document.exitFullscreen?.()}}

async function confirmDelete(id){const ok=window.confirm('Delete this video permanently?');if(!ok)return;await deleteVideo(id)}
async function deleteVideo(id){
  await new Promise((resolve)=>{const tx=db.transaction('videos','readwrite');const store=tx.objectStore('videos');store.delete(id).onsuccess=()=>resolve()})
  const cache=await caches.open('blobs');await cache.delete('./blob/'+id)
  if(currentId===id){
    try{player.pause()}catch(e){}
    if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=null}
    player.removeAttribute('src');player.load();
    markerBar.innerHTML='';currentId=null;currentMeta=null;
    document.getElementById('playToggle').textContent='Play';updateHUD()
  }
  refreshLibrary()
}

document.getElementById('freeSpace').onclick=async()=>{
  if(!('storage' in navigator)&&!navigator.storage?.estimate){alert('Not supported');return}
  const e=await navigator.storage.estimate();const used=e.usage||0;const quota=e.quota||0;const free=Math.max(0,quota-used)
  const pct=quota?((used/quota)*100).toFixed(1):'0'
  alert(`Used: ${(used/1048576).toFixed(1)} MB\nFree: ${(free/1048576).toFixed(1)} MB\nQuota: ${(quota/1048576).toFixed(1)} MB\nUsage: ${pct}%`)
}
