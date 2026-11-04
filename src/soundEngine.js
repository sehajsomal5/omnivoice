// Web Audio API Synthetic Sound Engine (Zero external audio files required)
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playMicStart() {
    this.playSiriWake();
  }

  // Apple Siri Dual-Tone Wake Chime (F#5 -> B5)
  playSiriWake() {
    if (!this.enabled) return;
    try {
      this.init();
      const now = this.ctx.currentTime;
      
      // Tone 1: F#5
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(739.99, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      // Tone 2: B5
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.07);
      gain2.gain.setValueAtTime(0.22, now + 0.07);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.07);
      osc2.stop(now + 0.22);
    } catch (e) {
      console.warn("Audio play error:", e);
    }
  }

  // Siri Completion Tone (B5 -> F#5)
  playSiriDone() {
    if (!this.enabled) return;
    try {
      this.init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now);
      osc.frequency.setValueAtTime(739.99, now + 0.08);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      console.warn("Audio play error:", e);
    }
  }

  playSuccess() {
    if (!this.enabled) return;
    try {
      this.init();
      const now = this.ctx.currentTime;
      // Arpeggio chord (C5 - E5 - G5 - C6)
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.25);
      });
    } catch (e) {
      console.warn("Audio play error:", e);
    }
  }

  playTaskComplete() {
    if (!this.enabled) return;
    try {
      this.init();
      const now = this.ctx.currentTime;
      [880, 1174.66].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.3);
      });
    } catch (e) {
      console.warn("Audio play error:", e);
    }
  }

  playEmergencyAlert() {
    if (!this.enabled) return;
    try {
      this.init();
      const now = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now + i * 0.16);
        osc.frequency.linearRampToValueAtTime(1000, now + i * 0.16 + 0.1);
        gain.gain.setValueAtTime(0.2, now + i * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.16 + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.16);
        osc.stop(now + i * 0.16 + 0.14);
      }
    } catch (e) {
      console.warn("Audio play error:", e);
    }
  }
}

export const sounds = new SoundEngine();
