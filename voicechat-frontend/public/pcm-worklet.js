class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Dynamic buffer size for exactly 0.5 seconds based on native hardware sample rate
    const currentRate = typeof sampleRate !== "undefined" ? sampleRate : 48000;
    this.rate = currentRate;
    this.bufferSize = Math.round(currentRate * 0.5);
    this.buffer = new Float32Array(this.bufferSize);
    this.offset = 0;

    // Controls
    this.noiseGateDb = 0; // 0 = RAW/OFF, -6, -10, -12, -15, -18 dB
    this.gainBoost = 1.0; // 1.0 = 0% (Original), 0.70 = -30%, 1.30 = +30%
    this.notch5kEnabled = true; // 5kHz static whine suppressor
    this.deHissMode = "off"; // "off", "14k", "12k", "10k"
    this.deEsserMode = "off"; // "off", "light", "medium", "strong"

    this.currentGain = 1.0;
    this.envelope = 0.0;

    // 1. High-pass filter state (80Hz cutoff)
    this.hpX1 = 0;
    this.hpY1 = 0;
    this.hpAlpha = Math.exp(-2 * Math.PI * 80 / currentRate);

    // 2. 5kHz Notch Filter Coefficients & State
    this.calc5kNotchCoeffs();
    this.n5k_x1 = 0; this.n5k_x2 = 0;
    this.n5k_y1 = 0; this.n5k_y2 = 0;

    // 3. De-Hiss Filter Coefficients & State
    this.calcDeHissCoeffs();
    this.dh_x1 = 0; this.dh_x2 = 0;
    this.dh_y1 = 0; this.dh_y2 = 0;

    // 4. De-Esser Bandpass Coefficients & State
    this.calcDeEsserBpCoeffs();
    this.de_x1 = 0; this.de_x2 = 0;
    this.de_y1 = 0; this.de_y2 = 0;
    this.sibilanceEnv = 0.0;
    this.broadbandEnv = 0.0;
    this.deEssGain = 1.0;

    this.port.onmessage = (e) => {
      if (typeof e.data === "object" && e.data !== null) {
        if (e.data.type === "setNoiseGate") {
          this.noiseGateDb = Math.min(0, parseInt(e.data.noiseGateDb) || 0);
        }
        if (e.data.type === "setGainBoost") {
          this.gainBoost = Math.max(0.5, Math.min(3.0, parseFloat(e.data.gainBoost) || 1.0));
        }
        if (e.data.type === "setNotch5k") {
          this.notch5kEnabled = !!e.data.notch5kEnabled;
        }
        if (e.data.type === "setDeHiss") {
          this.deHissMode = e.data.deHissMode || "off";
          this.calcDeHissCoeffs();
        }
        if (e.data.type === "setDeEsser") {
          this.deEsserMode = e.data.deEsserMode || "off";
        }
        if (e.data.type === "setAudioConfig") {
          if (e.data.noiseGateDb !== undefined) {
            this.noiseGateDb = Math.min(0, parseInt(e.data.noiseGateDb) || 0);
          }
          if (e.data.gainBoost !== undefined) {
            this.gainBoost = Math.max(0.5, Math.min(3.0, parseFloat(e.data.gainBoost) || 1.0));
          }
          if (e.data.notch5kEnabled !== undefined) {
            this.notch5kEnabled = !!e.data.notch5kEnabled;
          }
          if (e.data.deHissMode !== undefined) {
            this.deHissMode = e.data.deHissMode || "off";
            this.calcDeHissCoeffs();
          }
          if (e.data.deEsserMode !== undefined) {
            this.deEsserMode = e.data.deEsserMode || "off";
          }
        }
      } else if (e.data === "flush" && this.offset > 0) {
        const out = new Float32Array(this.buffer.subarray(0, this.offset));
        this.port.postMessage(out.buffer, [out.buffer]);
        this.offset = 0;
      }
    };
  }

  calc5kNotchCoeffs() {
    const f0 = 5000;
    const Q = 10.0;
    if (this.rate <= f0 * 2) {
      // Sample rate too low for 5kHz notch
      this.n5k_b0 = 1; this.n5k_b1 = 0; this.n5k_b2 = 0;
      this.n5k_a1 = 0; this.n5k_a2 = 0;
      return;
    }
    const w0 = 2 * Math.PI * f0 / this.rate;
    const alpha = Math.sin(w0) / (2 * Q);
    const b0 = 1;
    const b1 = -2 * Math.cos(w0);
    const b2 = 1;
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(w0);
    const a2 = 1 - alpha;

    this.n5k_b0 = b0 / a0;
    this.n5k_b1 = b1 / a0;
    this.n5k_b2 = b2 / a0;
    this.n5k_a1 = a1 / a0;
    this.n5k_a2 = a2 / a0;
  }

  calcDeHissCoeffs() {
    let cutoff = 0;
    if (this.deHissMode === "14k") cutoff = 14000;
    else if (this.deHissMode === "12k") cutoff = 12000;
    else if (this.deHissMode === "10k") cutoff = 10000;

    if (!cutoff || this.rate <= cutoff * 2) {
      this.dh_b0 = 1; this.dh_b1 = 0; this.dh_b2 = 0;
      this.dh_a1 = 0; this.dh_a2 = 0;
      return;
    }

    // High-shelf filter with -9 dB cut above cutoff
    const gainDb = -9.0;
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * cutoff / this.rate;
    const sinW = Math.sin(w0);
    const cosW = Math.cos(w0);
    const alpha = (sinW / 2) * Math.SQRT2;

    const b0 = A * ((A + 1) + (A - 1) * cosW + 2 * Math.sqrt(A) * alpha);
    const b1 = -2 * A * ((A - 1) + (A + 1) * cosW);
    const b2 = A * ((A + 1) + (A - 1) * cosW - 2 * Math.sqrt(A) * alpha);
    const a0 = (A + 1) - (A - 1) * cosW + 2 * Math.sqrt(A) * alpha;
    const a1 = 2 * ((A - 1) - (A + 1) * cosW);
    const a2 = (A + 1) - (A - 1) * cosW - 2 * Math.sqrt(A) * alpha;

    this.dh_b0 = b0 / a0;
    this.dh_b1 = b1 / a0;
    this.dh_b2 = b2 / a0;
    this.dh_a1 = a1 / a0;
    this.dh_a2 = a2 / a0;
  }

  calcDeEsserBpCoeffs() {
    // 6.5 kHz Band-pass filter (Q = 1.8) to detect sibilant friction
    const f0 = 6500;
    const Q = 1.8;
    if (this.rate <= f0 * 2) {
      this.de_b0 = 0; this.de_b1 = 0; this.de_b2 = 0;
      this.de_a1 = 0; this.de_a2 = 0;
      return;
    }
    const w0 = 2 * Math.PI * f0 / this.rate;
    const alpha = Math.sin(w0) / (2 * Q);
    const b0 = alpha;
    const b1 = 0;
    const b2 = -alpha;
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(w0);
    const a2 = 1 - alpha;

    this.de_b0 = b0 / a0;
    this.de_b1 = b1 / a0;
    this.de_b2 = b2 / a0;
    this.de_a1 = a1 / a0;
    this.de_a2 = a2 / a0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const ch0 = input[0];
    const ch1 = input[1];
    const hasStereo = !!(ch1 && ch1.length === ch0.length);

    const noiseGateActive = this.noiseGateDb < 0;
    const gateThresholdRms = 0.005; // ~ -46 dBFS threshold
    const minGain = noiseGateActive ? Math.pow(10, this.noiseGateDb / 20) : 1.0;
    const boost = this.gainBoost;

    // De-esser target attenuation
    let deEsserMaxAtten = 1.0;
    if (this.deEsserMode === "light") deEsserMaxAtten = 0.707; // -3dB
    else if (this.deEsserMode === "medium") deEsserMaxAtten = 0.500; // -6dB
    else if (this.deEsserMode === "strong") deEsserMaxAtten = 0.354; // -9dB

    for (let i = 0; i < ch0.length; i++) {
      let sample = ch0[i];

      // Smart channel selection for 2-channel USB/XLR interfaces
      if (hasStereo) {
        const s0 = ch0[i];
        const s1 = ch1[i];
        if (Math.abs(s1) > Math.abs(s0)) {
          sample = s1;
        }
      }

      // 1. High-Pass Filter (80Hz - removes sub-rumble and AC electrical hum)
      const hpSample = this.hpAlpha * (this.hpY1 + sample - this.hpX1);
      this.hpX1 = sample;
      this.hpY1 = hpSample;
      sample = hpSample;

      // 2. 5 kHz Static Whine Notch Filter
      if (this.notch5kEnabled) {
        const nOut = this.n5k_b0 * sample + this.n5k_b1 * this.n5k_x1 + this.n5k_b2 * this.n5k_x2
                     - this.n5k_a1 * this.n5k_y1 - this.n5k_a2 * this.n5k_y2;
        this.n5k_x2 = this.n5k_x1;
        this.n5k_x1 = sample;
        this.n5k_y2 = this.n5k_y1;
        this.n5k_y1 = nOut;
        sample = nOut;
      }

      // 3. De-Hiss Filter (High-shelf roll-off)
      if (this.deHissMode !== "off") {
        const dhOut = this.dh_b0 * sample + this.dh_b1 * this.dh_x1 + this.dh_b2 * this.dh_x2
                      - this.dh_a1 * this.dh_y1 - this.dh_a2 * this.dh_y2;
        this.dh_x2 = this.dh_x1;
        this.dh_x1 = sample;
        this.dh_y2 = this.dh_y1;
        this.dh_y1 = dhOut;
        sample = dhOut;
      }

      // 4. De-Esser (Dynamic High-Frequency Sibilance Control)
      if (this.deEsserMode !== "off") {
        // Extract 6.5kHz bandpass energy
        const bpOut = this.de_b0 * sample + this.de_b1 * this.de_x1 + this.de_b2 * this.de_x2
                      - this.de_a1 * this.de_y1 - this.de_a2 * this.de_y2;
        this.de_x2 = this.de_x1;
        this.de_x1 = sample;
        this.de_y2 = this.de_y1;
        this.de_y1 = bpOut;

        const absBp = Math.abs(bpOut);
        const absFull = Math.abs(sample);
        this.sibilanceEnv = 0.90 * this.sibilanceEnv + 0.10 * absBp;
        this.broadbandEnv = 0.95 * this.broadbandEnv + 0.05 * absFull;

        // Trigger dynamic de-essing when sibilance band dominates
        const isSibilant = this.sibilanceEnv > 0.35 * this.broadbandEnv && this.sibilanceEnv > 0.012;
        const targetDeEss = isSibilant ? deEsserMaxAtten : 1.0;
        const deEssSpeed = targetDeEss < this.deEssGain ? 0.10 : 0.005; // 1ms attack, ~40ms recovery
        this.deEssGain += deEssSpeed * (targetDeEss - this.deEssGain);
        sample *= this.deEssGain;
      }

      // 5. Gain Scaling (-100% to +100%)
      if (boost !== 1.0) {
        sample *= boost;
        if (sample > 0.95) sample = 0.95;
        else if (sample < -0.95) sample = -0.95;
      }

      // 6. Noise Gate
      if (noiseGateActive) {
        const absSample = Math.abs(sample);
        this.envelope = 0.95 * this.envelope + 0.05 * absSample;

        const isVoice = this.envelope > gateThresholdRms;
        const targetGain = isVoice ? 1.0 : minGain;
        const alpha = targetGain > this.currentGain ? 0.02 : 0.001; // ~5ms attack, ~200ms smooth release
        this.currentGain += alpha * (targetGain - this.currentGain);
        sample *= this.currentGain;
      }

      this.buffer[this.offset++] = sample;
      
      if (this.offset >= this.bufferSize) {
        const out = new Float32Array(this.buffer);
        this.port.postMessage(out.buffer, [out.buffer]);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
