// Offline audio: CC0 cat recordings, optional classic designed voices, and music.
// Recordings are bundled with the app; there are no remote audio requests.
const nowMs = () => globalThis.performance?.now?.() ?? Date.now();
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const STYLE_IDS = new Set(['otter', 'bunny', 'cat', 'bear', 'sheep']);
const MUSIC_LEVEL = .14;
const PET_GAP_MS = 1900;
const CAT_SAMPLES = Object.freeze({
  mew: 'assets/audio/cat-mew.wav',
  mew2: 'assets/audio/cat-mew-2.wav',
  soft: 'assets/audio/cat-soft-mew.wav',
  purr: 'assets/audio/cat-purr-loop.wav',
});

export class MomoAudio {
  constructor() {
    this._context = null;
    this._sound = true;
    this._music = false;
    this._paused = false;
    this._unlocked = false;
    this._destroyed = false;
    this._awakeUntil = 0;
    this._transition = null;
    this._idleTimer = null;
    this._musicTimer = null;
    this._duckTimer = null;
    this._musicNodes = [];
    this._calls = new Set();
    this._fadingCalls = new Set();
    this._petEpoch = 0;
    this._lastPet = -Infinity;
    this._lastError = null;
    this._contextCount = 0;
    this._petCount = 0;
    this._throttledCalls = 0;
    this._events = [];
    this._voiceMode = 'recorded';
    this._sampleBuffers = new Map();
    this._sampleLoad = null;
    this._sampleStatus = 'not-loaded';
    this._catSampleIndex = 0;
    this._purr = null;
    this._purrFade = null;
    this._strokeStarted = null;
    this._lastStrokeAt = -Infinity;
    this._strokeTimer = null;
    this._focusHeld = false;
    this._focusPaused = false;
  }

  _requestFocus() {
    if (this._focusHeld && !this._focusPaused) return true;
    const native = globalThis.MomoNative;
    if (typeof native?.requestAudioFocus !== 'function') { this._focusPaused = false; return true; }
    try {
      this._focusHeld = native.requestAudioFocus() === true;
      if (this._focusHeld) this._focusPaused = false;
      if (!this._focusHeld) this._error('Audio focus is unavailable');
      return this._focusHeld;
    } catch (error) { this._error(error); return false; }
  }

  _releaseFocus() {
    if (!this._focusHeld) return;
    this._focusHeld = false;
    try { globalThis.MomoNative?.abandonAudioFocus?.(); } catch (error) { this._error(error); }
  }

  async _loadSamples() {
    if (this._sampleLoad) return this._sampleLoad;
    if (!this._context || typeof globalThis.fetch !== 'function') return false;
    this._sampleStatus = 'loading';
    this._sampleLoad = Promise.all(Object.entries(CAT_SAMPLES).map(async ([key, path]) => {
      const response = await fetch(new URL(path, import.meta.url));
      if (!response.ok) throw new Error(`Bundled cat sound is unavailable (${response.status})`);
      const buffer = await this._context.decodeAudioData(await response.arrayBuffer());
      if (!this._destroyed) this._sampleBuffers.set(key, buffer);
    })).then(() => {
      this._sampleStatus = this._destroyed ? 'disposed' : 'ready';
      this._event('recordings-ready');
      return !this._destroyed;
    }).catch(error => {
      this._sampleStatus = 'unavailable';
      this._error(error);
      // Keep failure cached: rapid touches must not cause repeated requests.
      // Do not silently pass a generated cat sound off as a recording.
      return false;
    });
    return this._sampleLoad;
  }

  setVoiceMode(mode) {
    const next = mode === 'classic' ? 'classic' : 'recorded';
    if (next === this._voiceMode) return;
    this.stopPetSounds();
    this._voiceMode = next;
    if (next === 'recorded' && this._context) void this._loadSamples();
    this._event('voice-mode', { mode: next });
  }

  _event(type, detail = {}) {
    this._events.push({ type, at: nowMs(), ...detail });
    if (this._events.length > 24) this._events.shift();
  }

  _error(error) {
    this._lastError = String(error?.message || error || 'Audio unavailable');
    this._event('error', { message: this._lastError });
  }

  _createContext() {
    if (this._context || this._destroyed) return;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio is unavailable on this device');
    const context = new AudioContext();
    this._context = context;
    this._contextCount++;

    // This is the original app.js friction recipe and original signal levels.
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let smooth = 0;
    for (let i = 0; i < data.length; i++) {
      smooth = (smooth + .025 * (Math.random() * 2 - 1)) / 1.025;
      data[i] = smooth * 5;
    }
    this._noiseSource = context.createBufferSource();
    this._noiseSource.buffer = buffer;
    this._noiseSource.loop = true;
    this._filter = context.createBiquadFilter();
    this._filter.type = 'lowpass';
    this._filter.frequency.value = 900;
    this._frictionGain = context.createGain();
    this._frictionGain.gain.value = 0;
    this._noiseSource.connect(this._filter).connect(this._frictionGain).connect(context.destination);
    this._noiseSource.start();

    this._breathBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const breath = this._breathBuffer.getChannelData(0);
    for (let i = 0; i < breath.length; i++) breath[i] = Math.random() * 2 - 1;
    this._event('context-created');
  }

  _wantsRunning() {
    return this._unlocked && !this._destroyed && !this._paused && !this._focusPaused &&
      (this._music || (this._sound && nowMs() < this._awakeUntil));
  }

  // Serialize resume/suspend, then reconcile the latest intent. If a background
  // event arrives while resume is pending, it is followed by suspend, not music.
  _syncState() {
    if (this._transition) return this._transition;
    if (!this._context || this._destroyed) return Promise.resolve(false);
    const wanted = this._wantsRunning(), running = this._context.state === 'running';
    if (wanted === running) {
      if (!running && !this._focusPaused) this._releaseFocus();
      try { if (running && this._music) this._startMusic(); }
      catch (error) { this._error(error); return Promise.resolve(false); }
      return Promise.resolve(running);
    }
    const work = async () => {
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          if (this._destroyed || this._context.state === 'closed') return false;
          const wanted = this._wantsRunning();
          if (wanted && this._context.state !== 'running') {
            if (!this._requestFocus()) return false;
            await this._context.resume();
            this._event('resumed');
          } else if (!wanted && this._context.state === 'running') {
            await this._context.suspend();
            if (!this._focusPaused) this._releaseFocus();
            this._event('suspended');
          } else break;
          if (wanted === this._wantsRunning()) break;
        }
        if (this._wantsRunning() && this._context.state === 'running' && this._music) this._startMusic();
        return this._context.state === 'running' && this._wantsRunning();
      } catch (error) {
        this._releaseFocus();
        this._error(error);
        return false;
      }
    };
    // work() calls resume synchronously before its first await, retaining the
    // user gesture permission. Every caller receives a non-rejecting promise.
    this._transition = work().finally(() => { this._transition = null; });
    return this._transition;
  }

  _scheduleIdle() {
    clearTimeout(this._idleTimer);
    this._idleTimer = null;
    if (this._destroyed || this._paused || this._music || !this._context) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (this._wantsRunning()) this._scheduleIdle();
      else void this._syncState();
    }, Math.max(30, this._awakeUntil - nowMs() + 30));
  }

  _wake(milliseconds) {
    if (this._destroyed || this._paused || !this._unlocked) return Promise.resolve(false);
    this._awakeUntil = Math.max(this._awakeUntil, nowMs() + milliseconds);
    this._scheduleIdle();
    return this._syncState();
  }

  async unlock() {
    if (this._destroyed) return false;
    this._unlocked = true;
    if (this._paused || (!this._sound && !this._music)) return false;
    const epoch = this._petEpoch;
    try {
      if (!this._requestFocus()) return false;
      this._createContext();
      const running = await this._wake(900);
      if (running && this._voiceMode === 'recorded') await this._loadSamples();
      if (epoch !== this._petEpoch || this._paused || this._destroyed || (!this._sound && !this._music)) return false;
      return running && await this._wake(900);
    } catch (error) {
      this._releaseFocus();
      this._error(error);
      return false;
    }
  }

  setSoundEnabled(enabled) {
    this._sound = Boolean(enabled);
    if (!this._sound) this.stopPetSounds();
    else if (this._unlocked && !this._paused) void this.unlock();
    if (!this._sound && !this._music) this._releaseFocus();
  }

  setMusicEnabled(enabled) {
    this._music = Boolean(enabled);
    if (!this._music) {
      this._stopMusic();
      if (this._focusPaused || !this._sound) this._releaseFocus();
      this._scheduleIdle();
    } else if (this._unlocked && !this._paused) void this.unlock();
  }

  stroke(styleId, speed) {
    if (!this._frictionGain || !this._sound || this._paused || this._focusPaused || this._destroyed || !this._unlocked) return;
    speed = clamp(speed, 0, 1000);
    void this._wake(650);
    // Preserve the exact friction envelope and filter motion from version 1.
    const now = this._context.currentTime;
    this._frictionGain.gain.cancelScheduledValues(now);
    this._frictionGain.gain.setTargetAtTime(Math.min(.3, .015 + speed * .014), now, .045);
    this._frictionGain.gain.setTargetAtTime(0, now + .075, .1);
    this._filter.frequency.setTargetAtTime(500 + Math.min(1200, speed * 45), now, .08);
    if (styleId === 'cat' && this._voiceMode === 'recorded') {
      const time = nowMs();
      if (this._strokeStarted === null || time - this._lastStrokeAt > 300) this._strokeStarted = time;
      this._lastStrokeAt = time;
      clearTimeout(this._strokeTimer);
      this._strokeTimer = setTimeout(() => this._endPurrStroke(), 320);
      if (time - this._strokeStarted >= 700) this._startPurr();
    } else this._endPurrStroke();
  }

  endStroke() {
    this._endPurrStroke();
    if (!this._context || !this._frictionGain) return;
    const now = this._context.currentTime;
    this._frictionGain.gain.cancelScheduledValues(now);
    this._frictionGain.gain.setTargetAtTime(0, now, .03);
    // Leave the already-started happy sound intact after a short tap.
    this._awakeUntil = Math.max(nowMs() + 400, ...[...this._calls].map(call => call.endsAt + 100));
    this._scheduleIdle();
  }

  pet(styleId, { intensity = 1 } = {}) {
    if (!this._sound || this._paused || this._focusPaused || this._destroyed || !this._unlocked || !this._context) return false;
    if (nowMs() - this._lastPet < PET_GAP_MS || this._calls.size > 0) {
      this._throttledCalls++;
      return false;
    }
    this._lastPet = nowMs();
    const epoch = this._petEpoch;
    const id = STYLE_IDS.has(styleId) ? styleId : 'otter';
    // wake may be pending due to browser autoplay policy. Cancelled taps/styles
    // never become a stale sound after a later foreground or unmute event.
    void this._wake(1600).then(running => {
      if (!running || epoch !== this._petEpoch || !this._sound || this._paused || this._destroyed) return;
      try {
        if (id === 'cat' && this._voiceMode === 'recorded') this._playRecordedCat(clamp(intensity, .25, 1));
        else this._playPet(id, clamp(intensity, .25, 1));
      }
      catch (error) { this._error(error); this.stopPetSounds(); }
    }).catch(error => this._error(error));
    return true;
  }

  _playRecordedCat(intensity) {
    if (this._sampleStatus !== 'ready') return;
    const keys = ['mew', 'soft', 'mew2'];
    const key = keys[this._catSampleIndex++ % keys.length], buffer = this._sampleBuffers.get(key);
    if (!buffer) return;
    const context = this._context, now = context.currentTime;
    const group = this._group(buffer.duration + .04, intensity);
    const source = context.createBufferSource(); source.buffer = buffer;
    const gain = context.createGain(); gain.gain.value = .33;
    source.connect(gain).connect(group.gain);
    group.nodes.push(source, gain); group.sources.push(source);
    source.start(now); source.stop(now + buffer.duration + .02);
    this._petCount++;
    this._event('pet', { style: 'cat', mode: 'recorded', sample: key });
    this._duckMusic(buffer.duration);
  }

  _startPurr() {
    if (this._purr || this._sampleStatus !== 'ready' || this._context.state !== 'running') return;
    const buffer = this._sampleBuffers.get('purr');
    if (!buffer) return;
    if (this._purrFade) this._disposePurr(this._purrFade);
    const context = this._context, source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.loop = true;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(.32, context.currentTime, .16);
    source.connect(gain).connect(context.destination); source.start();
    this._purr = { source, gain, timer: null };
    this._event('purr-start');
    this._duckMusic(0);
  }

  _disposePurr(purr) {
    if (!purr) return;
    clearTimeout(purr.timer);
    try { purr.source.stop(); purr.source.disconnect(); purr.gain.disconnect(); } catch {}
    if (this._purr === purr) this._purr = null;
    if (this._purrFade === purr) this._purrFade = null;
  }

  _endPurrStroke(immediate = false) {
    clearTimeout(this._strokeTimer); this._strokeTimer = null;
    this._strokeStarted = null; this._lastStrokeAt = -Infinity;
    if (immediate) {
      this._disposePurr(this._purr); this._disposePurr(this._purrFade);
    } else if (this._purr) {
      const purr = this._purr, time = this._context.currentTime;
      this._purr = null; this._purrFade = purr;
      purr.gain.gain.cancelScheduledValues(time);
      purr.gain.gain.setTargetAtTime(0, time, .07);
      purr.source.stop(time + .32);
      purr.timer = setTimeout(() => { this._disposePurr(purr); this._restoreMusic(); }, 350);
      this._awakeUntil = Math.max(this._awakeUntil, nowMs() + 400);
      this._event('purr-end');
    }
    if (immediate || !this._purrFade) this._restoreMusic();
  }

  _group(duration, intensity) {
    const gain = this._context.createGain();
    gain.gain.value = .72 + intensity * .28;
    gain.connect(this._context.destination);
    const group = { gain, nodes: [], sources: [], endsAt: nowMs() + duration * 1000, timer: null };
    this._calls.add(group);
    group.timer = setTimeout(() => this._disposeGroup(group), duration * 1000 + 80);
    this._awakeUntil = Math.max(this._awakeUntil, group.endsAt + 150);
    this._scheduleIdle();
    return group;
  }

  _envelope(param, start, duration, amplitude, attack = .06) {
    param.setValueAtTime(0, start);
    param.linearRampToValueAtTime(amplitude, start + Math.min(attack, duration * .25));
    param.setTargetAtTime(amplitude * .68, start + duration * .35, duration * .18);
    param.linearRampToValueAtTime(0, start + duration);
  }

  _tone(group, { offset = 0, duration = .4, frequencies = [300, 380, 320], amplitude = .025,
    type = 'triangle', cutoff = 1200, pulse = 0, vibrato = 0 }) {
    const context = this._context, start = context.currentTime + .015 + offset;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequencies[0], start);
    frequencies.slice(1).forEach((frequency, index) => oscillator.frequency.exponentialRampToValueAtTime(
      frequency, start + duration * (index + 1) / (frequencies.length - 1)));
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = .5;
    const envelope = context.createGain();
    this._envelope(envelope.gain, start, duration, amplitude);
    let input = oscillator;
    if (pulse) {
      const pulsed = context.createGain(); pulsed.gain.value = .7;
      const lfo = context.createOscillator(); lfo.frequency.value = pulse;
      const depth = context.createGain(); depth.gain.value = .3;
      lfo.connect(depth).connect(pulsed.gain);
      oscillator.connect(pulsed); input = pulsed;
      lfo.start(start); lfo.stop(start + duration + .02);
      group.nodes.push(lfo, depth, pulsed); group.sources.push(lfo);
    }
    if (vibrato) {
      const lfo = context.createOscillator(); lfo.frequency.value = 4.5;
      const depth = context.createGain(); depth.gain.value = vibrato;
      lfo.connect(depth).connect(oscillator.frequency);
      lfo.start(start); lfo.stop(start + duration + .02);
      group.nodes.push(lfo, depth); group.sources.push(lfo);
    }
    input.connect(filter).connect(envelope).connect(group.gain);
    oscillator.start(start); oscillator.stop(start + duration + .025);
    group.nodes.push(oscillator, filter, envelope); group.sources.push(oscillator);
  }

  _breath(group, { offset = 0, duration = .2, amplitude = .02, frequency = 850 }) {
    const context = this._context, start = context.currentTime + .015 + offset;
    const source = context.createBufferSource(); source.buffer = this._breathBuffer;
    const filter = context.createBiquadFilter(); filter.type = 'bandpass';
    filter.frequency.value = frequency; filter.Q.value = .75;
    const envelope = context.createGain();
    this._envelope(envelope.gain, start, duration, amplitude, .07);
    source.connect(filter).connect(envelope).connect(group.gain);
    source.start(start); source.stop(start + duration + .025);
    group.nodes.push(source, filter, envelope); group.sources.push(source);
  }

  _playPet(style, intensity) {
    const duration = style === 'cat' ? 1.12 : style === 'bear' ? .96 : .86;
    const group = this._group(duration, intensity);
    switch (style) {
      case 'bunny':
        this._breath(group, { duration: .23, amplitude: .028, frequency: 620 });
        this._breath(group, { offset: .31, duration: .29, amplitude: .024, frequency: 810 });
        this._tone(group, { offset: .13, duration: .48, frequencies: [205, 228, 215], amplitude: .009, cutoff: 550, type: 'sine' });
        break;
      case 'cat':
        this._tone(group, { duration: .99, frequencies: [92, 100, 94], amplitude: .026, cutoff: 520, pulse: 25 });
        this._tone(group, { offset: .15, duration: .56, frequencies: [258, 335, 408, 345], amplitude: .018, cutoff: 1120, vibrato: 2 });
        this._tone(group, { offset: .17, duration: .48, frequencies: [516, 670, 816, 690], amplitude: .004, cutoff: 1000, type: 'sine' });
        break;
      case 'bear':
        this._tone(group, { duration: .82, frequencies: [106, 137, 121], amplitude: .032, cutoff: 680, vibrato: 2.3 });
        this._tone(group, { offset: .07, duration: .64, frequencies: [212, 266, 242], amplitude: .006, cutoff: 750, type: 'sine' });
        this._breath(group, { offset: .24, duration: .41, amplitude: .012, frequency: 470 });
        break;
      case 'sheep':
        this._tone(group, { duration: .68, frequencies: [253, 299, 270, 235], amplitude: .026, cutoff: 1250, pulse: 7.5, vibrato: 3 });
        this._tone(group, { offset: .03, duration: .61, frequencies: [759, 880, 804, 705], amplitude: .006, cutoff: 1400, type: 'sine', pulse: 7.5 });
        this._breath(group, { offset: .09, duration: .45, amplitude: .014, frequency: 1350 });
        break;
      default:
        this._tone(group, { duration: .3, frequencies: [570, 760, 690], amplitude: .020, cutoff: 1400, type: 'sine' });
        this._tone(group, { offset: .36, duration: .33, frequencies: [660, 870, 755], amplitude: .017, cutoff: 1400, type: 'sine' });
        this._breath(group, { offset: .08, duration: .39, amplitude: .009, frequency: 960 });
    }
    this._petCount++;
    this._event('pet', { style });
    this._duckMusic(duration);
  }

  _disposeGroup(group) {
    if (group.disposed) return;
    group.disposed = true;
    this._calls.delete(group);
    this._fadingCalls.delete(group);
    clearTimeout(group.timer);
    for (const node of group.nodes) { try { node.disconnect(); } catch {} }
    try { group.gain.disconnect(); } catch {}
    if (!this._calls.size) this._restoreMusic();
    this._scheduleIdle();
  }

  stopPetSounds() {
    this._petEpoch++;
    this._lastPet = -Infinity;
    this.endStroke();
    this._endPurrStroke(true);
    const context = this._context;
    if (!context) return;
    for (const group of [...this._calls]) {
      // Explicit style changes can answer immediately. Keep the old nodes only
      // for a 70 ms click-free fade, outside the active-call throttle.
      this._calls.delete(group);
      this._fadingCalls.add(group);
      group.gain.gain.cancelScheduledValues(context.currentTime);
      group.gain.gain.setTargetAtTime(0, context.currentTime, .015);
      for (const source of group.sources) { try { source.stop(context.currentTime + .07); } catch {} }
      clearTimeout(group.timer);
      group.timer = setTimeout(() => this._disposeGroup(group), 90);
    }
    this._awakeUntil = nowMs() + 200;
    this._scheduleIdle();
    clearTimeout(this._duckTimer);
    this._restoreMusic();
  }

  _startMusic() {
    if (this._musicGain || !this._music || this._paused || this._destroyed) return;
    const context = this._context, time = context.currentTime;
    this._musicGain = context.createGain();
    this._musicGain.gain.value = 0;
    this._musicGain.gain.setTargetAtTime(this._calls.size || this._purr ? MUSIC_LEVEL * .4 : MUSIC_LEVEL, time, .9);
    this._musicGain.connect(context.destination);
    // A continuous, unhurried C-major pad. Sparse pentatonic bells share its
    // key, and the continuously running pad has no file-loop seam.
    [[130.813, .075, -2], [196, .055, 2], [329.628, .03, -1]].forEach(([frequency, level, detune]) => {
      const oscillator = context.createOscillator(); oscillator.type = 'sine';
      oscillator.frequency.value = frequency; oscillator.detune.value = detune;
      const gain = context.createGain(); gain.gain.value = level;
      oscillator.connect(gain).connect(this._musicGain); oscillator.start();
      this._musicNodes.push({ source: oscillator, nodes: [oscillator, gain] });
    });
    this._bellIndex = 0;
    this._nextBell = time + 1.6;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 400);
    this._event('music-start');
  }

  _scheduleMusic() {
    if (!this._musicGain || !this._music || this._paused || this._destroyed || this._context.state !== 'running') return;
    try {
      const context = this._context;
      if (this._nextBell > context.currentTime + .75) return;
      // Slow tab timers must not produce a burst of missed notes.
      const start = Math.max(context.currentTime + .02, this._nextBell);
      const notes = [523.251, 659.255, 587.33, 783.991, 659.255, 880, 783.991, 587.33];
      const frequency = notes[this._bellIndex % notes.length];
      const oscillator = context.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      const gain = context.createGain(); this._envelope(gain.gain, start, 2.8, .045, .16);
      oscillator.connect(gain).connect(this._musicGain);
      const voice = { source: oscillator, nodes: [oscillator, gain] };
      this._musicNodes.push(voice);
      oscillator.onended = () => {
        for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
        const index = this._musicNodes.indexOf(voice); if (index >= 0) this._musicNodes.splice(index, 1);
      };
      oscillator.start(start); oscillator.stop(start + 2.9);
      this._nextBell = start + [3.9, 4.7, 3.4, 5.1][this._bellIndex++ % 4];
    } catch (error) { this._error(error); this._stopMusic(); }
  }

  _duckMusic(duration) {
    clearTimeout(this._duckTimer);
    if (!this._musicGain) return;
    const now = this._context.currentTime;
    this._musicGain.gain.cancelScheduledValues(now);
    this._musicGain.gain.setTargetAtTime(MUSIC_LEVEL * .4, now, .08);
    this._duckTimer = setTimeout(() => this._restoreMusic(), duration * 1000 + 80);
  }

  _restoreMusic() {
    if (!this._musicGain || !this._music || this._paused || this._focusPaused) return;
    const now = this._context.currentTime;
    this._musicGain.gain.cancelScheduledValues(now);
    this._musicGain.gain.setTargetAtTime(this._purr || this._purrFade || this._calls.size ? MUSIC_LEVEL * .4 : MUSIC_LEVEL, now, .65);
  }

  _stopMusic() {
    clearInterval(this._musicTimer); clearTimeout(this._duckTimer);
    this._musicTimer = null; this._duckTimer = null;
    if (!this._musicGain || !this._context) return;
    const gain = this._musicGain, nodes = this._musicNodes, now = this._context.currentTime;
    this._musicGain = null; this._musicNodes = [];
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, .02);
    for (const voice of nodes) { try { voice.source.stop(now + .1); } catch {} }
    setTimeout(() => {
      for (const voice of nodes) for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
      try { gain.disconnect(); } catch {}
    }, 140);
    this._event('music-stop');
  }

  setPaused(paused) {
    if (this._destroyed) return;
    const wasPaused = this._paused;
    this._paused = Boolean(paused);
    if (this._paused) {
      this.stopPetSounds();
      this._stopMusic();
      clearTimeout(this._idleTimer); this._idleTimer = null;
      void this._syncState();
      this._releaseFocus();
    } else {
      if (wasPaused) this._focusPaused = false;
      if (this._music && this._unlocked) void this.unlock();
    }
  }

  // OS focus interruption is separate from app visibility. Retain the native
  // request after transient loss so Android can deliver AUDIOFOCUS_GAIN later.
  setFocusPaused(paused) {
    if (this._destroyed) return;
    this._focusPaused = Boolean(paused);
    if (this._focusPaused) {
      this.stopPetSounds(); this._stopMusic();
      clearTimeout(this._idleTimer); this._idleTimer = null;
      void this._syncState();
    } else if (this._music && this._unlocked && !this._paused) void this.unlock();
    else this._releaseFocus();
  }

  destroy() {
    if (this._destroyed) return;
    this.stopPetSounds(); this._stopMusic();
    this._destroyed = true; this._petEpoch++;
    this._releaseFocus(); this._sampleBuffers.clear();
    clearTimeout(this._idleTimer); clearTimeout(this._duckTimer); clearInterval(this._musicTimer);
    for (const group of [...this._calls, ...this._fadingCalls]) this._disposeGroup(group);
    try { this._noiseSource?.stop(); this._noiseSource?.disconnect(); } catch {}
    try { this._frictionGain?.disconnect(); this._filter?.disconnect(); } catch {}
    try { const closing = this._context?.close(); closing?.catch(error => this._error(error)); }
    catch (error) { this._error(error); }
  }

  diagnostics() {
    return {
      state: this._context?.state || 'uninitialized', contextCount: this._contextCount,
      soundEnabled: this._sound, musicEnabled: this._music, musicActive: Boolean(this._musicGain),
      paused: this._paused, unlocked: this._unlocked, destroyed: this._destroyed,
      activeCalls: this._calls.size, fadingCalls: this._fadingCalls.size,
      voiceMode: this._voiceMode, recordings: this._sampleStatus, recordingCount: this._sampleBuffers.size,
      purrActive: Boolean(this._purr), purrFading: Boolean(this._purrFade), audioFocusHeld: this._focusHeld,
      focusPaused: this._focusPaused,
      petCount: this._petCount, throttledCalls: this._throttledCalls,
      lastError: this._lastError, events: this._events.map(event => ({ ...event })),
    };
  }
}
