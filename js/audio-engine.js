// js/audio-engine.js
// AudioEngine using HTMLAudioElement for simplicity and reliability.
// Crossfade is implemented by volume ramps.
// Ambient and Playback are mutually exclusive; Effects are polyphonic (max 4).

export default class AudioEngine {
  constructor() {
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
}
