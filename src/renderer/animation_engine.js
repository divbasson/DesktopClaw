
export class AnimationEngine {
  constructor({ app, mouth, config }) {
    this.app = app;
    this.mouth = mouth;
    this.config = config;
    this.quirkTimer = null;
    this.pulseTimer = null;
    this._musicMode = false;
    this._sleepActive = false;
  }

  updateConfig(config) {
    this.config = config;
  }

  setState(state) {
    // Don't interrupt sleep quirk for non-critical state changes
    // (Only break sleep for user interaction states)
    if (this._sleepActive && !['listening', 'thinking', 'speaking', 'error'].includes(state)) {
      return;
    }
    if (this._sleepActive) {
      this._endSleep();
    }

    this.app.className = `state-${state}${this._musicMode ? ' is-music-mode' : ''}`;

    if (state === 'error') {
      this._triggerErrorShake();
    }
  }
  // ── Music Mode ──────────────────────────────────────
  setMusicMode(enabled) {
    this._musicMode = enabled;

    // Don't stack on sleep or active interaction states
    if (this._sleepActive && enabled) {
      this._endSleep();
    }

    const hasMusic = this.app.classList.contains('is-music-mode');
    if (enabled && !hasMusic) {
      this.app.classList.add('is-music-mode');
    } else if (!enabled && hasMusic) {
      this.app.classList.remove('is-music-mode');
    }
  }

  _triggerErrorShake() {
    // The CSS animation is on .state-error #pet — re-triggering forces a
    // fresh play by briefly removing the class and re-adding it.
    const pet = this.app.querySelector('#pet');
    if (!pet) return;
    pet.style.animation = 'none';
    // Force reflow
    void pet.offsetWidth; // eslint-disable-line no-void
    pet.style.animation = '';
  }

  setMouth(level) {
    this.mouth.classList.remove('mouth-closed', 'mid', 'open');
    if (level < 0.18)      this.mouth.classList.add('mouth-closed');
    else if (level < 0.42) this.mouth.classList.add('mid');
    else                   this.mouth.classList.add('open');
  }

  stopSpeechAnimation() {
    clearTimeout(this.pulseTimer);
    this.pulseTimer = null;
    this.setMouth(0);
  }

  animateSpeechText(text) {
    this.stopSpeechAnimation();
    let index = 0;
    const pulses = text.split('').map((char) => {
      if (/[aeiouAEIOU]/.test(char)) return 0.75;
      if (/[.,!?;:]/.test(char))     return 0.04;
      if (/[ \t]/.test(char))        return 0.08;
      if (/[bmpBMP]/.test(char))     return 0.55;
      return 0.32;
    });

    const tick = () => {
      if (!this.app.className.includes('state-speaking')) {
        this.setMouth(0);
        return;
      }
      this.setMouth(pulses[index % Math.max(pulses.length, 1)] ?? 0.15);
      index += 1;
      this.pulseTimer = setTimeout(tick, 68);
    };
    tick();
  }

  // Eating mouth chomp – alternates open/closed independently of speech state
  animateEating() {
    this.stopSpeechAnimation();
    let t = 0;
    const chompTick = () => {
      if (!this.app.classList.contains('quirk-eat')) {
        this.setMouth(0);
        return;
      }
      // 3 open frames then 2 closed, rhythm ~220ms per step
      this.setMouth(t % 5 < 3 ? 0.75 : 0.04);
      t++;
      this.pulseTimer = setTimeout(chompTick, 210);
    };
    chompTick();
  }

  // ── Sleep helpers ────────────────────────────────────
  _endSleep() {
    this._sleepActive = false;
    this.app.classList.remove('quirk-sleep');
    // Trigger a stretch after waking
    setTimeout(() => {
      if (this.app.className.includes('state-idle')) {
        this.app.classList.add('quirk-stretch');
        setTimeout(() => this.app.classList.remove('quirk-stretch'), 1200);
      }
    }, 200);
  }

  // ── Quirk Scheduler ─────────────────────────────────
  scheduleQuirk() {
    clearTimeout(this.quirkTimer);
    const { quirkMinSeconds, quirkMaxSeconds } = this.config.idle;
    const delay =
      (Math.floor(Math.random() * (quirkMaxSeconds - quirkMinSeconds + 1)) +
        quirkMinSeconds) * 1000;

    this.quirkTimer = setTimeout(() => {
      if (!this.app.className.includes('state-idle')) return this.scheduleQuirk();

      const quirks = [
        // ── Classic physical quirks ──
        { name: 'quirk-hop',     duration: 1400,  weight: 6 },
        { name: 'quirk-wiggle',  duration: 1800,  weight: 6 },
        { name: 'quirk-look',    duration: 1800,  weight: 6 },
        { name: 'quirk-stretch', duration: 1200,  weight: 6 },
        { name: 'quirk-spin',    duration:  900,  weight: 4 },
        { name: 'quirk-wave',    duration: 2000,  weight: 5 },

        // ── Activity quirks ──
        { name: 'quirk-read',    duration: 7000,  weight: 4, onStart: () => {},            onEnd: () => {} },
        { name: 'quirk-code',    duration: 7000,  weight: 4, onStart: () => {},            onEnd: () => {} },
        { name: 'quirk-sleep',   duration: 11000, weight: 3, onStart: () => this._startSleep(), onEnd: () => this._endSleep() },
        { name: 'quirk-eat',     duration: 4000,  weight: 4, onStart: () => this.animateEating(), onEnd: () => this.stopSpeechAnimation() },
      ];

      // Weighted random selection
      const totalWeight = quirks.reduce((s, q) => s + q.weight, 0);
      let rand = Math.random() * totalWeight;
      let chosen = quirks[0];
      for (const q of quirks) {
        rand -= q.weight;
        if (rand <= 0) { chosen = q; break; }
      }

      this.app.classList.add(chosen.name);
      chosen.onStart?.();

      setTimeout(() => {
        this.app.classList.remove(chosen.name);
        chosen.onEnd?.();
        this.scheduleQuirk();
      }, chosen.duration);
    }, delay);
  }

  _startSleep() {
    this._sleepActive = true;
    this.stopSpeechAnimation();
    this.setMouth(0);
  }
}
