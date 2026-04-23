export class AnimationEngine {
  constructor({ app, mouth, config }) {
    this.app = app;
    this.mouth = mouth;
    this.config = config;
    this.quirkTimer = null;
    this.pulseTimer = null;
  }

  updateConfig(config) {
    this.config = config;
  }

  setState(state) {
    this.app.className = `state-${state}`;

    // Trigger error shake once per error transition
    if (state === 'error') {
      this._triggerErrorShake();
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
    // Map each character to a mouth-open level
    const pulses = text.split('').map((char) => {
      if (/[aeiouAEIOU]/.test(char)) return 0.75;   // vowels → wide open
      if (/[.,!?;:]/.test(char))     return 0.04;   // punctuation → closed
      if (/[ \t]/.test(char))        return 0.08;   // space → nearly closed
      if (/[bmpBMP]/.test(char))     return 0.55;   // bilabials → mid-wide
      return 0.32;                                  // other consonants → mid
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

  scheduleQuirk() {
    clearTimeout(this.quirkTimer);
    const { quirkMinSeconds, quirkMaxSeconds } = this.config.idle;
    const delay =
      (Math.floor(Math.random() * (quirkMaxSeconds - quirkMinSeconds + 1)) +
       quirkMinSeconds) * 1000;

    this.quirkTimer = setTimeout(() => {
      if (!this.app.className.includes('state-idle')) return this.scheduleQuirk();

      const quirks = [
        { name: 'quirk-hop',     duration: 1400 },
        { name: 'quirk-wiggle',  duration: 1800 },
        { name: 'quirk-look',    duration: 1800 },
        { name: 'quirk-stretch', duration: 1200 },
        { name: 'quirk-spin',    duration:  900 },
        { name: 'quirk-wave',    duration: 2000 },
      ];

      const chosen = quirks[Math.floor(Math.random() * quirks.length)];
      this.app.classList.add(chosen.name);

      setTimeout(() => {
        this.app.classList.remove(chosen.name);
        this.scheduleQuirk();
      }, chosen.duration);
    }, delay);
  }
}
