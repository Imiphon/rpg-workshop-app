// js/audio-engine.js
// AudioEngine using HTMLAudioElement for simplicity and reliability.
// Crossfade is implemented by volume ramps.
// Ambient and Playback are mutually exclusive; Effects are polyphonic (max 4).

export default class AudioEngine {
  constructor() {
    // --- iOS unlock & WebAudio shims (minimal addition) ---
this._isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

this._iosUnlocked = false;
this._iosCtx = null;
this._iosAmbGain = null;
this._iosFxGain = null;
this._iosKindMap = new WeakMap();  // HTMLMediaElement -> 'amb' | 'fx'
this._iosPending = new Set();      // elements waiting for unlock/connect

if (this._isIOS) {
  this._installIOSUnlock();  // set up user-gesture listeners
}
    // --- Web Audio plumbing (iOS-friendly) ---
    this.audioCtx = null; // created on first user interaction
    this.masterGain = null; // master gain (mute control)
    this.ambGain = null; // ambient bus
    this.fxGain = null; // effects bus
    this._nodeMap = new WeakMap(); // HTMLMediaElement -> MediaElementAudioSourceNode
    this._unlocked = false; // true after first gesture unlock

    // Prepare lightweight unlock listeners (removed after first trigger)
    this._installUnlockHandlers();

    // Master volumes (user preferences)
    this.ambVol = 0.9;
    this.fxVol = 1.0;

    // Master mute flag
    this.muted = false;

    // Ambient playback (single, loop, crossfade between two tracks)
    this.currentAmbient = null; // {audio:HTMLAudioElement, key:string}
    this.prevAmbient = null; // for crossfade
    this.ambientKey = null; // logical key or path
    this.crossfadeMs = 400;

    // Playback (single) that interrupts ambient
    this.currentPlayback = null;

    // Effects pool (polyphony)
    this.effectPool = [];
    this.maxEffects = 4;
  }

  // --- Helpers ---
  _liveAmbVol() {
    return this.muted ? 0 : this.ambVol;
  }
  _liveFxVol() {
    return this.muted ? 0 : this.fxVol;
  }

  setVolumes(ambVol, fxVol) {
    // Update stored prefs
    if (ambVol != null) this.ambVol = +ambVol;
    if (fxVol != null) this.fxVol = +fxVol;

    // Apply live volumes considering mute
    if (this.currentAmbient)
      this.currentAmbient.audio.volume = this._liveAmbVol();
    this.effectPool.forEach((a) => {
      try {
        a.volume = this._liveFxVol();
      } catch (_) {}
    });
    if (this._isIOS) this._applyIOSGains();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // Helper to start an HTMLAudio with options
  _createAudio(src, loop = false, volume = 1.0) {
    const a = new Audio(src);
    a.preload = "auto";
    a.loop = loop;
    a.volume = volume;
    a.muted = this.muted; // iOS/Safari: respect master mute

    if (this._isIOS) {
  // Use loop flag to decide bus: loop=true -> 'amb', loop=false -> 'fx'
  this._registerAudioForIOS(a, loop ? 'amb' : 'fx');
}
    return a;
  }

  // --- Ambient ---
  playAmbient(src, key) {
    // If same ambient already running, keep it playing (no reload)
    if (this.currentAmbient && this.ambientKey === key) return;

    const next = this._createAudio(src, true, 0);
    const start = () => next.play().catch(() => {});

    if (this.currentAmbient) {
      // Crossfade
      const prev = this.currentAmbient.audio;
      this.prevAmbient = this.currentAmbient;

      this.currentAmbient = { audio: next, key };
      this.ambientKey = key;

      start();
      this._fade(prev, this._liveAmbVol(), 0, this.crossfadeMs, () => {
        prev.pause();
      });
      this._fade(next, 0, this._liveAmbVol(), this.crossfadeMs);
    } else {
      this.currentAmbient = { audio: next, key };
      this.ambientKey = key;
      start();
      this._fade(next, 0, this._liveAmbVol(), this.crossfadeMs);
    }
  }

  pauseAmbient() {
    if (this.currentAmbient) this.currentAmbient.audio.pause();
  }

  resumeAmbient() {
    if (this.currentAmbient) {
      this.currentAmbient.audio.volume = this._liveAmbVol();
      this.currentAmbient.audio.play().catch(() => {});
    }
  }

  stopAmbient() {
    if (this.currentAmbient) {
      this.currentAmbient.audio.pause();
      this.currentAmbient.audio.currentTime = 0;
      this.currentAmbient = null;
      this.ambientKey = null;
    }
  }

  // --- Playback (interrupts ambient) ---
  playPlayback(src) {
    if (this.currentPlayback) {
      this.currentPlayback.pause();
      this.currentPlayback = null;
    }
    if (this.currentAmbient) this.pauseAmbient();

    const a = this._createAudio(src, false, this._liveAmbVol());
    this.currentPlayback = a;
    a.onended = () => {
      this.currentPlayback = null;
      this.resumeAmbient();
    };
    a.play().catch(() => {});
  }

  stopPlayback() {
    if (this.currentPlayback) {
      this.currentPlayback.pause();
      this.currentPlayback.currentTime = 0;
      this.currentPlayback = null;
    }
  }

  // Ensure master mute works on iOS/Safari by toggling the element's muted flag
  setMuted(isMuted) {
    this.muted = !!isMuted;

    // Apply 'muted' to every currently alive element
    const setMutedFlag = (el) => {
      try {
        el.muted = this.muted;
      } catch (_) {}
    };

    if (this.currentAmbient) setMutedFlag(this.currentAmbient.audio);
    if (this.prevAmbient) setMutedFlag(this.prevAmbient.audio);
    if (this.currentPlayback) setMutedFlag(this.currentPlayback);
    if (this.effectPool && this.effectPool.length) {
      this.effectPool.forEach(setMutedFlag);
      if (this._isIOS) this._applyIOSGains();
    }

    // Keep existing volume logic so fades/restore-after-unmute still work everywhere
    if (this.currentAmbient)
      this.currentAmbient.audio.volume = this._liveAmbVol();
    if (this.currentPlayback) this.currentPlayback.volume = this._liveAmbVol();
    if (this.effectPool && this.effectPool.length) {
      this.effectPool.forEach((a) => {
        try {
          a.volume = this._liveFxVol();
        } catch (_) {}
      });
    }
  }

  // --- Effects (polyphonic up to maxEffects) ---
  playEffect(src) {
    // Trim pool if too many
    this.effectPool = this.effectPool.filter((a) => !a.ended && !a.paused);
    if (this.effectPool.length >= this.maxEffects) {
      const first = this.effectPool.shift();
      try {
        first.pause();
      } catch (e) {}
    }
    const a = this._createAudio(src, false, this._liveFxVol());
    this.effectPool.push(a);
    a.play().catch(() => {});
  }

  // --- Utils ---
  _fade(audio, from, to, ms, onDone) {
    const steps = Math.max(1, Math.floor(ms / 25));
    const delta = (to - from) / steps;
    let i = 0;
    audio.volume = from;
    const iv = setInterval(() => {
      i++;
      audio.volume = Math.max(0, Math.min(1, audio.volume + delta));
      if (i >= steps) {
        clearInterval(iv);
        audio.volume = to;
        if (onDone) onDone();
      }
    }, 25);
  }

  _ensureAudioGraph() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return; // fallback: keep HTMLAudioElement volumes
  if (this.audioCtx) return;

  this.audioCtx = new Ctx();

  // Create buses: master -> destination
  this.masterGain = this.audioCtx.createGain();
  this.masterGain.gain.value = this.muted ? 0 : 1;
  this.masterGain.connect(this.audioCtx.destination);

  // Ambient and FX sub-buses -> master
  this.ambGain = this.audioCtx.createGain();
  this.fxGain = this.audioCtx.createGain();
  this.ambGain.gain.value = this._liveAmbVol();
  this.fxGain.gain.value = this._liveFxVol();
  this.ambGain.connect(this.masterGain);
  this.fxGain.connect(this.masterGain);
}

// Connect a media element to the right bus exactly once
_connectToBus(mediaEl, kind /* 'amb' | 'fx' */) {
  if (!this.audioCtx) return;                // no Web Audio -> skip
  if (this._nodeMap.has(mediaEl)) return;    // already connected

  const src = this.audioCtx.createMediaElementSource(mediaEl);
  this._nodeMap.set(mediaEl, src);

  // Route to the requested bus
  (kind === 'fx' ? this.fxGain : this.ambGain).connect(this.masterGain);
  src.connect(kind === 'fx' ? this.fxGain : this.ambGain);

  // Avoid double output (only hear the WebAudio path)
  // On iOS this is safe once the context is unlocked.
  // mediaEl.muted = true;
}

// Unlock/resume context on first user gesture
_installUnlockHandlers() {
  const unlock = async () => {
    try {
      this._ensureAudioGraph();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      // Play a tiny empty buffer to satisfy iOS' gesture requirement
      if (this.audioCtx && !this._unlocked) {
        const buf = this.audioCtx.createBuffer(1, 1, 22050);
        const src = this.audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(this.masterGain);
        src.start(0);
      }
      this._unlocked = true;
    } catch (_) { /* no-op */ }
    // Remove listeners after first unlock
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('touchstart', unlock, true);
    window.removeEventListener('click', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };

  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('touchstart', unlock, true);
  window.addEventListener('click', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

_installIOSUnlock() {
  const unlock = async () => {
    try {
      this._ensureIOSCtx();
      if (this._iosCtx && this._iosCtx.state === 'suspended') {
        await this._iosCtx.resume();
      }
      // tiny silent buffer to satisfy iOS
      const buf = this._iosCtx.createBuffer(1, 1, 22050);
      const src = this._iosCtx.createBufferSource();
      src.buffer = buf;
      src.connect(this._iosAmbGain);
      src.start(0);

      this._iosUnlocked = true;

      // Connect all pending elements now and flip their output to WebAudio
      this._iosPending.forEach((el) => {
        this._connectIOSNow(el, this._iosKindMap.get(el) || 'fx');
      });
      this._iosPending.clear();

      // apply current volumes to gains
      this._applyIOSGains();
    } catch (_) {
      // ignore
    }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('touchstart', unlock, true);
    window.removeEventListener('click', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };

  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('touchstart', unlock, true);
  window.addEventListener('click', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

_ensureIOSCtx() {
  if (this._iosCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;

  this._iosCtx = new Ctx();
  // two simple buses: ambient and fx
  this._iosAmbGain = this._iosCtx.createGain();
  this._iosFxGain  = this._iosCtx.createGain();

  // initialize with current volumes (respect mute)
  this._iosAmbGain.gain.value = this.muted ? 0 : (this.ambVol ?? 1);
  this._iosFxGain.gain.value  = this.muted ? 0 : (this.fxVol  ?? 1);

  // mix to destination
  this._iosAmbGain.connect(this._iosCtx.destination);
  this._iosFxGain.connect(this._iosCtx.destination);
}

_registerAudioForIOS(mediaEl, kind /* 'amb' | 'fx' */) {
  // Before unlock: keep HTML audio audible, remember to connect later
  this._iosKindMap.set(mediaEl, kind);
  if (this._iosUnlocked) {
    this._connectIOSNow(mediaEl, kind);
  } else {
    this._iosPending.add(mediaEl);
  }
}

_connectIOSNow(mediaEl, kind) {
  this._ensureIOSCtx();
  if (!this._iosCtx) return;

  // If already connected, skip (idempotent)
  if (mediaEl._iosConnected) return;

  // Route element -> proper gain
  const srcNode = this._iosCtx.createMediaElementSource(mediaEl);
  const bus = (kind === 'amb') ? this._iosAmbGain : this._iosFxGain;
  srcNode.connect(bus);

  // Now that WebAudio path is live, mute the HTML element output
  mediaEl.muted = this.muted || true; // keep master mute respected

  mediaEl._iosConnected = true;
}

_applyIOSGains() {
  if (!this._iosCtx) return;
  const amb = (typeof this.ambVol === 'number') ? this.ambVol : 1;
  const fx  = (typeof this.fxVol  === 'number') ? this.fxVol  : 1;

  const master = this.muted ? 0 : 1;
  if (this._iosAmbGain) this._iosAmbGain.gain.value = master ? amb : 0;
  if (this._iosFxGain)  this._iosFxGain.gain.value  = master ? fx  : 0;
}


}
