
let deferredPrompt;if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js')}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;document.getElementById('installBtn').hidden=false})
document.getElementById('installBtn').onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;document.getElementById('installBtn').hidden=true}

const tabs=[...document.querySelectorAll('nav button')];const sections=[...document.querySelectorAll('section.tab')]
tabs.forEach(b=>b.addEventListener('click',()=>{sections.forEach(s=>s.classList.add('hidden'));document.getElementById(b.dataset.tab).classList.remove('hidden')}))

let scoreA=0,scoreB=0
const scoreAEl=document.getElementById('scoreA');const scoreBEl=document.getElementById('scoreB')
const liveScore=document.getElementById('liveScore')
function bumpScore(which,delta){
  if(which==='A'){scoreA=Math.max(0,scoreA+delta);scoreAEl.textContent=scoreA}
  else {scoreB=Math.max(0,scoreB+delta);scoreBEl.textContent=scoreB}
  liveScore.textContent = `${scoreA}:${scoreB}`;
  updateHUDScore();
  recordScoreEventIfRecording();
}
document.getElementById('aPlus').onclick=()=>bumpScore('A',+1)
document.getElementById('aMinus').onclick=()=>bumpScore('A',-1)
document.getElementById('bPlus').onclick=()=>bumpScore('B',+1)
document.getElementById('bMinus').onclick=()=>bumpScore('B',-1)

let tRunning=false,startTime=0,accum=0,rafId=null
const tDisp=document.getElementById('timerDisplay')
function fmtCS(ms){const total=Math.floor(ms/10);const cs=String(total%100).padStart(2,'0');const s=Math.floor(total/100)%60;const m=Math.floor(total/6000);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+cs}
function fmtMS(ms){const m=Math.floor(ms/60000);const s=Math.floor((ms%60000)/1000);const ms3=String(Math.floor(ms%1000)).padStart(3,'0');return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+ms3}
function fmtS(sec){const s=Math.floor(sec%60);const m=Math.floor(sec/60);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
function tick(){const now=performance.now();tDisp.textContent=fmtCS(accum+(now-startTime));rafId=requestAnimationFrame(tick)}
document.getElementById('timerStart').onclick=()=>{if(tRunning)return;tRunning=true;startTime=performance.now();rafId=requestAnimationFrame(tick)}
document.getElementById('timerStop').onclick=()=>{if(!tRunning)return;tRunning=false;cancelAnimationFrame(rafId);accum+=performance.now()-startTime}
document.getElementById('timerReset').onclick=()=>{tRunning=false;cancelAnimationFrame(rafId);accum=0;tDisp.textContent='00:00.00'}
function nowGameMs(){return accum+(tRunning?(performance.now()-startTime):0)}

let db;const req=indexedDB.open('sportcoach',21)
req.onupgradeneeded=e=>{db=e.target.result;if(!db.objectStoreNames.contains('videos'))db.createObjectStore('videos',{keyPath:'id'})}
req.onsuccess=e=>{db=e.target.result;refreshLibrary()}

let stream,recorder,chunks=[],currentMime=null
let currentRecordingMarkers=[],currentRecordingScoreEvents=[],recStartPerf=0,recBaseGameMs=0
const preview=document.getElementById('preview')
const previewWrap=document.getElementById('previewWrap')
const cameraSel=document.getElementById('camera')
const resSel=document.getElementById('resolution')
const recStatus=document.getElementById('recStatus')

async function listCams(){const ds=await navigator.mediaDevices.enumerateDevices();const vids=ds.filter(d=>d.kind==='videoinput');cameraSel.innerHTML='';vids.forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||('Camera '+(i+1));cameraSel.appendChild(o)})}
function setAspectFromPreview(){if(!preview.videoWidth||!preview.videoHeight)return;previewWrap.style.aspectRatio=preview.videoWidth+' / '+preview.videoHeight}
async function startPreview(){const res=resSel.value.split('x').map(Number);const c={video:{width:{ideal:res[0]},height:{ideal:res[1]},facingMode:'environment'},audio:true};if(cameraSel.value)c.video.deviceId={exact:cameraSel.value};stream=await navigator.mediaDevices.getUserMedia(c);preview.srcObject=stream;preview.onloadedmetadata=()=>{setAspectFromPreview();preview.play?.()}}
function pickType(){const types=['video/mp4;codecs=h264','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];for(const t of types){if(MediaRecorder.isTypeSupported(t)){return t}}return ''}

function recordScoreEventIfRecording(){
  if(!recStartPerf) return;
  const recMs=performance.now()-recStartPerf;
  const last=currentRecordingScoreEvents[currentRecordingScoreEvents.length-1];
  if(last && last.a===scoreA && last.b===scoreB) return;
  currentRecordingScoreEvents.push({recMs,gameMs:nowGameMs(),a:scoreA,b:scoreB});
}

async function startRec(){
  if(!stream)await startPreview();
  currentMime=pickType();chunks=[];currentRecordingMarkers=[];currentRecordingScoreEvents=[];recStartPerf=performance.now();
  recBaseGameMs=nowGameMs();
  currentRecordingScoreEvents.push({recMs:0,gameMs:recBaseGameMs,a:scoreA,b:scoreB});
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
function addMarkerWithSnapshot(label){
  if(!recStartPerf){recStatus.textContent='Not recording';return}
  const recMs=performance.now()-recStartPerf;
  const snapshot={a:scoreA,b:scoreB}
  currentRecordingMarkers.push({id:crypto.randomUUID(),label,gameMs:nowGameMs(),recMs,score:snapshot,createdAt:Date.now()});
  recStatus.textContent='Marked: '+label+' @ '+fmtS(Math.floor(recMs/1000));
  const last=currentRecordingScoreEvents[currentRecordingScoreEvents.length-1];
  if(!last || last.a!==scoreA || last.b!==scoreB || Math.abs(last.recMs-recMs)>50){
    currentRecordingScoreEvents.push({recMs,gameMs:nowGameMs(),a:scoreA,b:scoreB});
  }
}
function addMarker(label){ addMarkerWithSnapshot(label) }

document.getElementById('mkFoul').onclick=()=>addMarker('Foul')
document.getElementById('mkSub').onclick=()=>addMarker('Sub')
document.getElementById('mkShot').onclick=()=>addMarker('Shot')

let scoringFor='A';
const scoringBtn=document.getElementById('scoringTeam')
scoringBtn.onclick=()=>{scoringFor = (scoringFor==='A'?'B':'A');scoringBtn.textContent='Scoring: '+scoringFor}
document.getElementById('mkGoal').onclick=()=>{
  bumpScore(scoringFor,+1); // 1) update score (records scoreEvent)
  addMarker('Goal');        // 2) record goal marker with snapshot
}

// custom modal
const modal=document.getElementById('markModal')
const markInput=document.getElementById('markInput')
function openModal(){document.body.classList.add('modal-open');modal.classList.remove('hidden');setTimeout(()=>markInput.focus(),0)}
function closeModal(){modal.classList.add('hidden');document.body.classList.remove('modal-open')}
document.getElementById('mkCustom').onclick=()=>{markInput.value='';openModal()}
document.getElementById('markCancel').onclick=()=>{closeModal()}
document.getElementById('markOK').onclick=()=>{const v=markInput.value.trim();if(v){addMarker(v.slice(0,24))}closeModal()}
markInput.addEventListener('keydown',e=>{if(e.key==='Enter'){document.getElementById('markOK').click()}})

async function saveBlob(){
  const blob=new Blob(chunks,{type:currentMime||'video/webm'})
  const id=crypto.randomUUID()
  const meta={id,createdAt:Date.now(),size:blob.size,mime:blob.type,markers:currentRecordingMarkers,baseGameMs:recBaseGameMs,scoreEvents:currentRecordingScoreEvents}
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
const hudOverlay=document.getElementById('hudOverlay');const hudRec=document.getElementById('hudRec');const hudGame=document.getElementById('hudGame');const hudScore=document.getElementById('hudScore')
const hudBelow=document.getElementById('hudBelow');const hudRecBelow=document.getElementById('hudRecBelow');const hudGameBelow=document.getElementById('hudGameBelow')

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
    renderMarkers();applyDesiredSpeed();updateHUD()
  }
}

function applyVideoAspect(){
  const w=player.videoWidth||16,h=player.videoHeight||9
  wrap.style.aspectRatio=w+' / '+h
  if(h>w){wrap.style.maxWidth='min(90vw,520px)';wrap.style.height='70vh'}
  else {wrap.style.maxWidth='760px';wrap.style.height='auto'}
  resizeCanvas()
}

function renderMarkers(){
  markerBar.innerHTML=''
  if(!currentMeta||!currentMeta.markers||currentMeta.markers.length===0){markerBar.textContent='No markers';return}
  currentMeta.markers.forEach(m=>{
    const chip=document.createElement('button');chip.className='marker-chip';chip.textContent=m.label
    const snap = m.score?` | ${m.score.a}:${m.score.b}`:'';
    const s=document.createElement('small');s.textContent=' rec '+fmtS(Math.floor(m.recMs/1000))+' | game '+fmtS(Math.floor(m.gameMs/1000))+snap
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

function scoreAtMs(tMs){
  const evs=(currentMeta?.scoreEvents||[]).slice().sort((a,b)=>a.recMs-b.recMs);
  if(evs.length===0){
    const snaps=(currentMeta?.markers||[]).filter(m=>m.score).map(m=>({recMs:m.recMs,a:m.score.a,b:m.score.b})).sort((a,b)=>a.recMs-b.recMs);
    if(snaps.length===0) return {a:0,b:0};
    let cur=snaps[0];
    for(const s of snaps){ if(s.recMs<=tMs){cur=s}else{break} }
    return {a:cur.a,b:cur.b};
  }
  let cur=evs[0];
  for(const e of evs){ if(e.recMs<=tMs){cur=e}else{break} }
  return {a:cur.a,b:cur.b}
}

function updateHUD(){
  const recMs = (player.currentTime||0)*1000;
  const recStr = fmtMS(recMs);
  const gMs = recToGameMs(recMs);
  const gStr = fmtMS(gMs);
  const sc = scoreAtMs(recMs);
  const scoreStr = `${sc.a}:${sc.b}`;
  hudRec.textContent = 'REC '+recStr; hudGame.textContent='GAME '+gStr; hudScore.textContent=scoreStr;
  hudRecBelow.textContent = 'REC '+recStr; hudGameBelow.textContent='GAME '+gStr;
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

// Robust speed control
const speeds=[0.25,0.5,0.75,1,1.25,1.5,1.75,2,2.5,3];let speedIdx=3;let desiredRate=speeds[speedIdx];
function applyDesiredSpeed(){player.playbackRate=desiredRate}
document.getElementById('speed').onclick=()=>{
  speedIdx=(speedIdx+1)%speeds.length;
  desiredRate=speeds[speedIdx];
  applyDesiredSpeed();
  document.getElementById('speed').textContent=speeds[speedIdx].toFixed(2)+'x';
}
player.addEventListener('play',applyDesiredSpeed);
player.addEventListener('loadedmetadata',applyDesiredSpeed);

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

async function confirmDelete(id){const ok=window.confirm('Delete this video permanently?');if(!ok)return;await deleteVideo(id)}
async function deleteVideo(id){
  await new Promise((resolve)=>{const tx=db.transaction('videos','readwrite');const store=tx.objectStore('videos');store.delete(id).onsuccess=()=>resolve()})
  const cache=await caches.open('blobs');await cache.delete('./blob/'+id)
  if(currentId===id){
    try{player.pause()}catch(e){}
    if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=null}
    player.removeAttribute('src');player.load();
    markerBar.innerHTML='';currentId=null;currentMeta=null;updateHUD()
    document.getElementById('playToggle').textContent='Play'
  }
  refreshLibrary()
}

document.getElementById('freeSpace').onclick=async()=>{
  if(!('storage' in navigator)&&!navigator.storage?.estimate){alert('Not supported');return}
  const e=await navigator.storage.estimate();const used=e.usage||0;const quota=e.quota||0;const free=Math.max(0,quota-used)
  const pct=quota?((used/quota)*100).toFixed(1):'0'
  alert(`Used: ${(used/1048576).toFixed(1)} MB\nFree: ${(free/1048576).toFixed(1)} MB\nQuota: ${(quota/1048576).toFixed(1)} MB\nUsage: ${pct}%`)
}
