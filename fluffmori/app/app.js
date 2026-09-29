import { FurField } from './fur.js';
import { MomoAudio } from './audio.js';
import { styles, thumbnail, character } from './pets.js';
import { information } from './information.js';
import { readPreferences, writePreferences } from './preferences.js';

const $ = id => document.getElementById(id);
let storage; try { storage=localStorage; } catch { storage={getItem:()=>null,setItem:()=>{}}; }
const prefs=readPreferences(storage);
const save=()=>writePreferences(storage,prefs);
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
const lessMotion=()=>prefs.reducedMotion||motionQuery.matches;
const fur=new FurField($('fur'),{reducedMotion:lessMotion()});
const audio=new MomoAudio();
audio.setSoundEnabled(prefs.sound);audio.setMusicEnabled(prefs.music);audio.setVoiceMode(prefs.voiceMode);
let selected=styles.findIndex(s=>s.id===prefs.style),paused=false,nativePaused=false,immersive=false;
let toastTimer,moodTimer,blinkTimer,keyTimer,noseTimer,moodStartTimer;
let lastHeart=-Infinity,lastHaptic=0,lastFrame=0,frameId=0,audioEpoch=0;
let faceX=0,faceY=0,targetX=0,targetY=0,press=0,targetPress=0;
const pointers=new Map();
const nativeHaptics=typeof window.MomoNative?.haptic==='function';
const supportsHaptics=nativeHaptics||typeof navigator.vibrate==='function';
const soundIcon=on=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4 5 8H2v8h3l5 4z"/>${on?'<path d="M14 8q4 4 0 8m3-11q7 7 0 14"/>':'<path d="m15 9 6 6m0-6-6 6"/>'}</svg>`;
function notify(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
function updateSettings(){
  $('sound').innerHTML=soundIcon(prefs.sound);$('sound').setAttribute('aria-pressed',String(prefs.sound));$('sound').setAttribute('aria-label',prefs.sound?'Mute pet sounds':'Enable pet sounds');
  for(const [id,value] of [['sound-setting',prefs.sound],['music',prefs.music],['haptic',prefs.haptic&&supportsHaptics],['reduce-motion',lessMotion()]])$(id).setAttribute('aria-checked',String(value));
  $('haptic').disabled=!supportsHaptics;$('haptic-description').textContent=supportsHaptics?'A tiny touch of feedback':'Not available on this device';
  $('reduce-motion').disabled=motionQuery.matches;
  $('reduce-motion').setAttribute('aria-label',motionQuery.matches?'Less movement is on in your device settings':'Less movement');
  $('voice-real').setAttribute('aria-pressed',String(prefs.voiceMode==='recorded'));$('voice-classic').setAttribute('aria-pressed',String(prefs.voiceMode==='classic'));
  $('toy').classList.toggle('reduce-motion',lessMotion());$('toy').classList.toggle('has-petted',prefs.hasPetted);$('invitation').setAttribute('aria-hidden',String(prefs.hasPetted));
}
function selectStyle(index,announce=true){
  releaseAll();selected=index;const s=styles[index];prefs.style=s.id;save();fur.setStyle(s);
  $('character').innerHTML=character(s);$('character').className='pet-'+s.id;$('particles').replaceChildren();
  for(const [key,value] of Object.entries({base:s.base,ink:s.ink,accent:s.accent}))$('toy').style.setProperty('--'+key,value);
  $('pet-name').textContent=s.name;$('pet-mood').textContent='Here with you ♡';
  $('styles').querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  if(announce)notify(s.description);kickFace();
}
$('styles').innerHTML=styles.map((s,i)=>`<button class="pet-button" data-index="${i}" aria-label="${s.name}. ${s.description}" aria-pressed="false">${thumbnail(s)}<span>${s.short}</span></button>`).join('');
$('styles').addEventListener('click',e=>{const b=e.target.closest('button');if(b)selectStyle(Number(b.dataset.index));});
function vibrate(){if(!prefs.haptic||!supportsHaptics||paused||performance.now()-lastHaptic<140)return;lastHaptic=performance.now();try{if(nativeHaptics)window.MomoNative.haptic();else navigator.vibrate(7);}catch{}}
function happySound(intensity=.8,explicitId){
  if(paused||(!prefs.sound&&!prefs.music))return;
  const epoch=audioEpoch,id=explicitId||styles[selected].id;
  audio.unlock().then(ready=>{
    if(epoch!==audioEpoch||paused)return;
    if(!ready){if(audio.diagnostics().lastError)notify('Sound is unavailable on this device.');return;}
    if(prefs.sound&&id==='cat'&&prefs.voiceMode==='recorded'&&audio.diagnostics().recordings==='unavailable'){notify('Real cat sounds are unavailable. Try Classic in Settings.');return;}
    if(prefs.sound)audio.pet(id,{intensity});
  }).catch(()=>notify('Sound is unavailable right now.'));
}
function toggleSound(){prefs.sound=!prefs.sound;audioEpoch++;save();audio.setSoundEnabled(prefs.sound);updateSettings();if(prefs.sound)happySound(.65);}
$('sound').addEventListener('click',toggleSound);$('sound-setting').addEventListener('click',toggleSound);
$('music').addEventListener('click',()=>{prefs.music=!prefs.music;save();audio.setMusicEnabled(prefs.music);updateSettings();if(prefs.music)audio.unlock().then(ready=>{if(!ready&&!paused)notify('Music is unavailable right now.');}).catch(()=>notify('Music is unavailable right now.'));});
$('haptic').addEventListener('click',()=>{prefs.haptic=!prefs.haptic;save();updateSettings();if(prefs.haptic)vibrate();});
$('reduce-motion').addEventListener('click',()=>{prefs.reducedMotion=!prefs.reducedMotion;save();applyMotion();});
function chooseVoice(mode){audioEpoch++;audio.stopPetSounds();prefs.voiceMode=mode;audio.setVoiceMode(mode);save();updateSettings();happySound(.85,'cat');}
$('voice-real').addEventListener('click',()=>chooseVoice('recorded'));$('voice-classic').addEventListener('click',()=>chooseVoice('classic'));
function settingsPage(){ $('settings-content').hidden=false;$('info-content').hidden=true;$('sheet-back').hidden=true;$('sheet-title').textContent='Make yourself comfy';$('settings-sheet').scrollTop=0; }
function openSettings(){releaseAll();settingsPage();$('settings-sheet').showModal();$('settings-close').focus();}
function closeSettings(){$('settings-sheet').close();$('settings-open').focus();}
$('settings-open').addEventListener('click',openSettings);$('settings-close').addEventListener('click',closeSettings);$('sheet-back').addEventListener('click',settingsPage);
$('settings-sheet').addEventListener('click',e=>{if(e.target!==$('settings-sheet'))return;const r=e.target.getBoundingClientRect();if(e.clientY<r.top||e.clientX<r.left||e.clientX>r.right||e.clientY>r.bottom)closeSettings();});
for(const key of ['about','privacy','credits'])$(key+'-open').addEventListener('click',()=>{$('settings-content').hidden=true;$('info-content').hidden=false;$('sheet-back').hidden=false;$('sheet-title').textContent=information[key].title;$('info-content').innerHTML=information[key].body;$('settings-sheet').scrollTop=0;$('sheet-back').focus();});
function setImmersive(value){immersive=value;$('toy').classList.toggle('immersed',value);document.querySelectorAll('.chrome').forEach(el=>el.inert=value);$('immersive-exit').hidden=!value;(value?$('immersive-exit'):$('settings-open')).focus();}
$('immersive').addEventListener('click',()=>{$('settings-sheet').close();setImmersive(true);});$('immersive-exit').addEventListener('click',()=>setImmersive(false));
window.fluffmoriBack=()=>{if($('settings-sheet').open){if(!$('info-content').hidden){settingsPage();return true;}closeSettings();return true;}if(immersive){setImmersive(false);return true;}return false;};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&immersive){e.preventDefault();setImmersive(false);}});
function heart(x,y){if(lessMotion()||performance.now()-lastHeart<4200)return;lastHeart=performance.now();const el=document.createElement('span');el.className='heart';el.textContent='♡';el.style.left=x+'px';el.style.top=y+'px';$('particles').appendChild(el);setTimeout(()=>el.remove(),1800);}
function addGlow(x,y){if(lessMotion())return null;const el=document.createElement('span');el.className='touch-glow';el.style.left=x+'px';el.style.top=y+'px';$('particles').appendChild(el);return el;}
function removeGlow(el){if(!el)return;el.classList.add('fading');setTimeout(()=>el.remove(),400);}
function petMood(immediate=false){
  clearTimeout(moodTimer);clearTimeout(moodStartTimer);
  const smile=()=>{$('character').classList.add('petted');$('pet-mood').textContent=styles[selected].reaction;};
  if(immediate)smile();else moodStartTimer=setTimeout(smile,150);
  targetPress=1;if(!prefs.hasPetted){prefs.hasPetted=true;save();$('toy').classList.add('has-petted');$('invitation').setAttribute('aria-hidden','true');}kickFace();
}
function relax(){targetPress=0;targetX=0;targetY=0;clearTimeout(moodTimer);clearTimeout(moodStartTimer);clearTimeout(noseTimer);for(const key of ['--cheek-left','--cheek-right','--nose-poke'])$('character').style.setProperty(key,0);moodTimer=setTimeout(()=>{$('character').classList.remove('petted');$('pet-mood').textContent='Here with you ♡';},1400);kickFace();}
function kickFace(){if(!frameId&&!paused){lastFrame=0;frameId=requestAnimationFrame(animateFace);}}
function animateFace(time){
  frameId=0;if(paused)return;
  const dt=lastFrame?Math.min(2,(time-lastFrame)/16.67):1;lastFrame=time;
  const id=styles[selected].id,ease=1-Math.pow(id==='bear'?.91:.82,dt);
  faceX+=(targetX-faceX)*ease;faceY+=(targetY-faceY)*ease;press+=(targetPress-press)*ease;
  const tilt=id==='otter'?.3:id==='cat'?.18:.08,compress=id==='bear'?.047:.018;
  $('character').style.transform=lessMotion()?'none':`translate(${faceX}px,${faceY}px) rotate(${faceX*tilt}deg) scale(${1+press*.008},${1-press*compress})`;
  if(Math.abs(faceX-targetX)+Math.abs(faceY-targetY)+Math.abs(press-targetPress)>.004)frameId=requestAnimationFrame(animateFace);
}
function coordinates(e){const r=$('playground').getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function hotspot(e){const r=$('character').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*400,y=(e.clientY-r.top)/r.height*400;if(Math.hypot(x-200,y-245)<25)return'nose';if(Math.hypot((x-94)*.8,y-255)<40)return'left';if(Math.hypot((x-306)*.8,y-255)<40)return'right';return'fur';}
function updateLocalPressure(){for(const side of ['left','right'])$('character').style.setProperty('--cheek-'+side,[...pointers.values()].some(p=>p.zone===side)?1:0);}
$('playground').addEventListener('pointerdown',e=>{
  if(paused||e.button>0||$('settings-sheet').open)return;e.preventDefault();
  const p={...coordinates(e),zone:hotspot(e),started:performance.now(),travel:0};p.glow=addGlow(p.x,p.y);pointers.set(e.pointerId,p);$('playground').setPointerCapture(e.pointerId);fur.pointer(e.pointerId,p.x,p.y,0,0);updateLocalPressure();
  if(p.zone==='nose'){$('character').style.setProperty('--nose-poke',1);clearTimeout(noseTimer);noseTimer=setTimeout(()=>$('character').style.setProperty('--nose-poke',0),250);}
  petMood(true);vibrate();happySound(p.zone==='nose'?.6:.8);
});
$('playground').addEventListener('pointermove',e=>{
  const old=pointers.get(e.pointerId);if(!old||paused)return;
  const p={...old,...coordinates(e),zone:hotspot(e)},dx=p.x-old.x,dy=p.y-old.y,speed=Math.hypot(dx,dy);p.travel+=speed;pointers.set(e.pointerId,p);fur.pointer(e.pointerId,p.x,p.y,dx,dy);updateLocalPressure();
  if(p.glow){p.glow.style.left=p.x+'px';p.glow.style.top=p.y+'px';}
  const r=$('playground').getBoundingClientRect();targetX=Math.max(-9,Math.min(9,(p.x-r.width/2)*.055));targetY=Math.max(-6,Math.min(6,(p.y-r.height*.46)*.027));kickFace();
  if(speed>1){audio.stroke(styles[selected].id,speed);vibrate();}
  if(p.travel>100&&performance.now()-p.started>800)heart(p.x,p.y-16);
});
function releasePointer(e){const p=pointers.get(e.pointerId);if(!p)return;pointers.delete(e.pointerId);fur.release(e.pointerId);removeGlow(p.glow);updateLocalPressure();if(!pointers.size){relax();if(e.type==='pointercancel'){audioEpoch++;audio.stopPetSounds();}else audio.endStroke();}}
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('playground').addEventListener(name,releasePointer);
function releaseAll(){audioEpoch++;clearTimeout(keyTimer);fur.release(-1);for(const[id,p]of pointers){fur.release(id);removeGlow(p.glow);}pointers.clear();audio.stopPetSounds();relax();}
$('playground').addEventListener('keydown',e=>{if((e.code==='Space'||e.code==='Enter')&&!e.repeat&&!paused&&!$('settings-sheet').open){e.preventDefault();clearTimeout(keyTimer);const r=$('playground').getBoundingClientRect();fur.pointer(-1,r.width*.5,r.height*.45,20,0);petMood(true);vibrate();happySound(.8);keyTimer=setTimeout(()=>{fur.release(-1);audio.endStroke();if(!pointers.size)relax();},450);}});
function blink(){clearTimeout(blinkTimer);if(paused||lessMotion())return;blinkTimer=setTimeout(()=>{if(!pointers.size)$('character').classList.add('blinking');setTimeout(()=>$('character').classList.remove('blinking'),150);blink();},4800+Math.random()*2800);}
function applyMotion(){fur.setReducedMotion(lessMotion());$('particles').replaceChildren();updateSettings();blink();kickFace();}
function updatePause(){paused=nativePaused||document.hidden;fur.setPaused(paused);if(paused){releaseAll();if(frameId)cancelAnimationFrame(frameId);frameId=0;clearTimeout(blinkTimer);$('particles').replaceChildren();}else{kickFace();blink();}audio.setPaused(paused);}
window.momoPause=value=>{nativePaused=Boolean(value);updatePause();};
window.momoAudioFocus=hasFocus=>audio.setFocusPaused(!hasFocus);
document.addEventListener('visibilitychange',updatePause);window.addEventListener('blur',releaseAll);window.addEventListener('pagehide',()=>{nativePaused=true;updatePause();});window.addEventListener('pageshow',()=>{nativePaused=false;updatePause();});motionQuery.addEventListener('change',applyMotion);
updateSettings();selectStyle(selected,false);blink();
