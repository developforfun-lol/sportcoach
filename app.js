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
let tInt=null,elapsed=0
const tDisp=document.getElementById('timerDisplay')
document.getElementById('timerStart').onclick=()=>{if(tInt)return;tInt=setInterval(()=>{elapsed++;const m=String(Math.floor(elapsed/60)).padStart(2,'0');const s=String(elapsed%60).padStart(2,'0');tDisp.textContent=m+':'+s},1000)}
document.getElementById('timerStop').onclick=()=>{clearInterval(tInt);tInt=null}
document.getElementById('timerReset').onclick=()=>{elapsed=0;tDisp.textContent='00:00';clearInterval(tInt);tInt=null}
let db
const req=indexedDB.open('sportcoach',3)
req.onupgradeneeded=e=>{db=e.target.result;if(!db.objectStoreNames.contains('videos'))db.createObjectStore('videos',{keyPath:'id'})}
req.onsuccess=e=>{db=e.target.result}
let stream,recorder,chunks=[],currentMime=null
const preview=document.getElementById('preview')
const cameraSel=document.getElementById('camera')
const resSel=document.getElementById('resolution')
const recStatus=document.getElementById('recStatus')
async function listCams(){const ds=await navigator.mediaDevices.enumerateDevices();const vids=ds.filter(d=>d.kind==='videoinput');cameraSel.innerHTML='';vids.forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||('Camera '+(i+1));cameraSel.appendChild(o)})}
async function startPreview(){const res=resSel.value.split('x').map(Number);const constraints={video:{width:{ideal:res[0]},height:{ideal:res[1]},facingMode:'environment'},audio:true};if(cameraSel.value)constraints.video.deviceId={exact:cameraSel.value};stream=await navigator.mediaDevices.getUserMedia(constraints);preview.srcObject=stream}
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
async function refreshLibrary(){listEl.innerHTML='';const tx=db.transaction('videos','readonly');const r=tx.objectStore('videos').getAll();r.onsuccess=()=>{r.result.sort((a,b)=>b.createdAt-a.createdAt).forEach(v=>{const li=document.createElement('li');const left=document.createElement('div');left.textContent=new Date(v.createdAt).toLocaleString()+' • '+Math.round(v.size/1024/1024)+' MB';const right=document.createElement('div');const play=document.createElement('button');play.textContent='Load';play.onclick=()=>loadVideo(v.id);const dl=document.createElement('button');dl.textContent='Download';dl.onclick=()=>downloadVideo(v.id);const del=document.createElement('button');del.textContent='Delete';del.onclick=()=>deleteVideo(v.id);right.appendChild(play);right.appendChild(dl);right.appendChild(del);li.appendChild(left);li.appendChild(right);listEl.appendChild(li)})}}
async function getBlobUrl(id){const cache=await caches.open('blobs');const url='./blob/'+id;const r=await cache.match(url);if(!r)return null;const b=await r.blob();return URL.createObjectURL(b)}
const player=document.getElementById('player');const canvas=document.getElementById('canvas');const ctx=canvas.getContext('2d')
let drawing=false;let paths=[];let drawMode=false;let speeds=[0.5,1,1.5,2];let speedIdx=1
function resize(){const r=document.getElementById('wrap');canvas.width=r.clientWidth;canvas.height=r.clientHeight;redraw()}
function redraw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineWidth=3;paths.forEach(p=>{ctx.beginPath();p.forEach((pt,i)=>{if(i===0)ctx.moveTo(pt.x,pt.y);else ctx.lineTo(pt.x,pt.y)});ctx.strokeStyle='#ff4757';ctx.stroke()})}
window.addEventListener('resize',resize);setTimeout(resize,0)
canvas.style.touchAction='none';canvas.style.userSelect='none'
canvas.addEventListener('pointerdown',e=>{if(!drawMode)return;drawing=true;e.preventDefault();paths.push([{x:e.offsetX,y:e.offsetY,t:player.currentTime}])})
canvas.addEventListener('pointermove',e=>{if(!drawing||!drawMode)return;e.preventDefault();paths[paths.length-1].push({x:e.offsetX,y:e.offsetY,t:player.currentTime});redraw()})
canvas.addEventListener('pointerup',()=>{drawing=false})
document.getElementById('undo').onclick=()=>{paths.pop();redraw()}
document.getElementById('saveAnnot').onclick=()=>{const data=JSON.stringify(paths);const blob=new Blob([data],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='annotations.json';document.body.appendChild(a);a.click();a.remove()}
document.getElementById('download').onclick=()=>{if(!player.src)return;const a=document.createElement('a');a.href=player.src;a.download='clip.webm';document.body.appendChild(a);a.click();a.remove()}
document.getElementById('playToggle').onclick=()=>{if(player.paused){player.play()}else{player.pause()}}
document.getElementById('back5').onclick=()=>{player.currentTime=Math.max(0,player.currentTime-5)}
document.getElementById('fwd5').onclick=()=>{player.currentTime=Math.min(player.duration||1,player.currentTime+5)}
document.getElementById('speed').onclick=()=>{speedIdx=(speedIdx+1)%speeds.length;player.playbackRate=speeds[speedIdx];document.getElementById('speed').textContent=speeds[speedIdx].toFixed(1)+'x'}
document.getElementById('drawToggle').onclick=()=>{drawMode=!drawMode;document.getElementById('drawToggle').textContent='Draw: '+(drawMode?'On':'Off');player.style.pointerEvents=drawMode?'none':'auto'}
document.getElementById('fsBtn').onclick=()=>{const el=document.getElementById('wrap');if(document.fullscreenElement){document.exitFullscreen?.()}else{(el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen||el.mozRequestFullScreen)?.call(el)}}
async function loadVideo(id){const u=await getBlobUrl(id);if(!u)return;player.src=u;player.playbackRate=speeds[speedIdx];paths=[];redraw();await player.play().catch(()=>{})}
refreshLibrary()
