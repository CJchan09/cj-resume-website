const IDS = ['otter','bunny','cat','bear','sheep'];
export function readPreferences(storage) {
  const defaults = { style:'cat', sound:true, music:false, haptic:true, reducedMotion:false, voiceMode:'classic', hasPetted:false };
  try {
    const raw = storage.getItem('fluffmori-prefs') ?? storage.getItem('momo-prefs');
    const s = JSON.parse(raw || '{}');
    if (!s || typeof s !== 'object' || Array.isArray(s)) return defaults;
    return { style:IDS.includes(s.style)?s.style:'cat', sound:s.sound!==false, music:s.music===true, haptic:s.haptic!==false, reducedMotion:s.reducedMotion===true, voiceMode:s.voiceMode==='recorded'?'recorded':'classic', hasPetted:s.hasPetted===true };
  } catch { return defaults; }
}
export function writePreferences(storage,prefs) {
  try { storage.setItem('fluffmori-prefs',JSON.stringify(prefs)); } catch { /* Private/ephemeral storage still allows play. */ }
}
