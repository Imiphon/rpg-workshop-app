// AudioEngine using HTMLAudioElement for simplicity and reliability.
// Crossfade is implemented by volume ramps.
// Ambient and Playback are mutually exclusive; Effects are polyphonic (max 4).


export default class AudioEngine {

  constructor() {
    // Master volumes
    this.ambVol = 0.9;
    this.fxVol = 1.0;

    // Ambient playback (single, loop, crossfade between two tracks)
    this.currentAmbient = null;   // {audio:HTMLAudioElement, key:string}
    this.prevAmbient = null;      // for crossfade
    this.ambientKey = null;       // logical key or path
    this.crossfadeMs = 400;

    // Playback (single) that interrupts ambient
    this.currentPlayback = null;

    // Effects pool (polyphony)
    this.effectPool = [];
    this.maxEffects = 4;
  }

  setVolumes(ambVol, fxVol){
    if(ambVol!=null){ this.ambVol = +ambVol; if(this.currentAmbient) this.currentAmbient.audio.volume = this.ambVol; }
    if(fxVol!=null){ this.fxVol = +fxVol; this.effectPool.forEach(a=>a.volume = this.fxVol); }
  }

  // Helper to start an HTMLAudio with options
  _createAudio(src, loop=false, volume=1.0){
    const a = new Audio(src);
    a.preload = "auto";
    a.loop = loop;
    a.volume = volume;
    return a;
  }

  // --- Ambient ---
  playAmbient(src, key){
    // If same ambient already running, keep it playing (no reload)
    if (this.currentAmbient && this.ambientKey === key) return;

    const next = this._createAudio(src, true, 0);
    const start = () => next.play().catch(()=>{});

    if (this.currentAmbient){
      // Crossfade
      const prev = this.currentAmbient.audio;
      this.prevAmbient = this.currentAmbient;

      this.currentAmbient = { audio: next, key };
      this.ambientKey = key;

      start();
      this._fade(prev, this.ambVol, 0, this.crossfadeMs, () => { prev.pause(); });
      this._fade(next, 0, this.ambVol, this.crossfadeMs);
    } else {
      this.currentAmbient = { audio: next, key };
      this.ambientKey = key;
      start();
      this._fade(next, 0, this.ambVol, this.crossfadeMs);
    }
  }

  pauseAmbient(){
    if (this.currentAmbient){
      this.currentAmbient.audio.pause();
    }
  }

  resumeAmbient(){
    if (this.currentAmbient){
      this.currentAmbient.audio.volume = this.ambVol;
      this.currentAmbient.audio.play().catch(()=>{});
    }
  }

  stopAmbient(){
    if (this.currentAmbient){
      this.currentAmbient.audio.pause();
      this.currentAmbient.audio.currentTime = 0;
      this.currentAmbient = null;
      this.ambientKey = null;
    }
  }

  // --- Playback (interrupts ambient) ---
  playPlayback(src){
    // Stop previous playback
    if (this.currentPlayback){
      this.currentPlayback.pause();
      this.currentPlayback = null;
    }
    // Pause ambient while playback runs
    if (this.currentAmbient) this.pauseAmbient();

    const a = this._createAudio(src, false, this.ambVol);
    this.currentPlayback = a;
    a.onended = () => {
      this.currentPlayback = null;
      // Resume last ambient
      this.resumeAmbient();
    };
    a.play().catch(()=>{});
  }

  stopPlayback(){
    if (this.currentPlayback){
      this.currentPlayback.pause();
      this.currentPlayback.currentTime = 0;
      this.currentPlayback = null;
    }
  }

  // --- Effects (polyphonic up to maxEffects) ---
  playEffect(src){
    console.log('soundfile:', src)
    // Trim pool if too many
    this.effectPool = this.effectPool.filter(a => !a.ended && !a.paused);
    if (this.effectPool.length >= this.maxEffects){
      const first = this.effectPool.shift();
      try { first.pause(); } catch(e){}
    }
    const a = this._createAudio(src, false, this.fxVol);
    this.effectPool.push(a);
    a.play().catch(()=>{});
  }

  // --- Utils ---
  _fade(audio, from, to, ms, onDone){
    const steps = Math.max(1, Math.floor(ms / 25));
    const delta = (to - from) / steps;
    let i = 0;
    audio.volume = from;
    const iv = setInterval(() => {
      i++;
      audio.volume = Math.max(0, Math.min(1, audio.volume + delta));
      if (i >= steps){
        clearInterval(iv);
        audio.volume = to;
        if (onDone) onDone();
      }
    }, 25);
  }
}
