export function createSoundSystem() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  let audioContext = null;
  let masterGain = null;
  let enabled = true;
  let noiseBuffer = null;

  function ensureContext() {
    if (!AudioContextClass) return null;

    if (!audioContext) {
      audioContext = new AudioContextClass();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.2;
      masterGain.connect(audioContext.destination);
    }

    return audioContext;
  }

  async function unlock() {
    const ctx = ensureContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // 忽略浏览器策略导致的恢复失败
      }
    }
  }

  function canPlay() {
    const ctx = ensureContext();
    if (!ctx) return null;
    if (!enabled) return null;
    if (ctx.state !== 'running') return null;
    return ctx;
  }

  function setEnabled(value) {
    enabled = Boolean(value);
  }

  function isEnabled() {
    return enabled;
  }

  function scheduleTone({
    type = 'sine',
    frequency = 440,
    frequencyEnd = frequency,
    duration = 0.12,
    gain = 0.08,
    attack = 0.002,
    release = 0.08,
    pan = 0
  }) {
    const ctx = canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.001, frequencyEnd), now + duration);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + release);

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, now);

    osc.connect(g);
    g.connect(panner);
    panner.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function getNoiseBuffer(ctx) {
    if (noiseBuffer) return noiseBuffer;

    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 0.25;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    noiseBuffer = buffer;
    return buffer;
  }

  function scheduleNoise({ duration = 0.06, gain = 0.05, highpass = 900, lowpass = 7000, pan = 0 }) {
    const ctx = canPlay();
    if (!ctx) return;

    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(highpass, now);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(lowpass, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, now);

    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(panner);
    panner.connect(masterGain);

    src.start(now);
    src.stop(now + duration + 0.02);
  }

  function playShoot(local = true) {
    scheduleTone({
      type: 'triangle',
      frequency: local ? 210 : 170,
      frequencyEnd: local ? 75 : 60,
      duration: 0.08,
      gain: local ? 0.07 : 0.045,
      release: 0.08,
      pan: local ? 0.25 : 0
    });

    scheduleNoise({
      duration: 0.05,
      gain: local ? 0.045 : 0.03,
      highpass: 1200,
      lowpass: 6500,
      pan: local ? 0.2 : 0
    });
  }

  function playHitConfirm() {
    scheduleTone({ type: 'square', frequency: 820, frequencyEnd: 900, duration: 0.05, gain: 0.045, release: 0.06 });
    scheduleTone({ type: 'square', frequency: 980, frequencyEnd: 1060, duration: 0.05, gain: 0.04, release: 0.06 });
  }

  function playDamage() {
    scheduleTone({ type: 'sawtooth', frequency: 210, frequencyEnd: 130, duration: 0.12, gain: 0.07, release: 0.12, pan: -0.12 });
    scheduleNoise({ duration: 0.08, gain: 0.03, highpass: 700, lowpass: 3000, pan: -0.1 });
  }

  function playDeath() {
    scheduleTone({ type: 'sawtooth', frequency: 220, frequencyEnd: 85, duration: 0.28, gain: 0.09, release: 0.28, pan: -0.05 });
  }

  function playRespawn() {
    scheduleTone({ type: 'sine', frequency: 380, frequencyEnd: 520, duration: 0.12, gain: 0.055, release: 0.13 });
    scheduleTone({ type: 'sine', frequency: 520, frequencyEnd: 700, duration: 0.16, gain: 0.05, release: 0.17 });
  }

  function playJoin() {
    scheduleTone({ type: 'triangle', frequency: 460, frequencyEnd: 620, duration: 0.1, gain: 0.04, release: 0.11 });
  }

  function playChat() {
    scheduleTone({ type: 'sine', frequency: 760, frequencyEnd: 880, duration: 0.045, gain: 0.03, release: 0.05 });
  }

  function playJump() {
    scheduleTone({ type: 'triangle', frequency: 260, frequencyEnd: 380, duration: 0.09, gain: 0.045, release: 0.1 });
  }

  return {
    unlock,
    setEnabled,
    isEnabled,
    playShoot,
    playHitConfirm,
    playDamage,
    playDeath,
    playRespawn,
    playJoin,
    playChat,
    playJump
  };
}
