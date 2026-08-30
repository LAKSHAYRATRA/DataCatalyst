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
    this.deHissMode = "off"; // "off", "14k", "12k", "10k", "8k"
    this.deEsserMode = "off"; // "off", "light", "medium", "strong"

    this.currentGateGain = 1.0;
    this.gateEnvelope = 0.0;

    // 1. High-Pass Filter state (80Hz cutoff)
    this.hpX1 = 0;
    this.hpY1 = 0;
    this.hpAlpha = Math.exp(-2 * Math.PI * 80 / currentRate);

    // 2. 5kHz Notch Filter (Q = 6.0 for deep suppression of 5kHz USB whine)
    this.calc5kNotchCoeffs();
    this.n5k_x1 = 0; this.n5k_x2 = 0;
    this.n5k_y1 = 0; this.n5k_y2 = 0;

    // 3. 4-Pole Steep De-Hiss Filter State
    this.calcDeHissCoeffs();
    this.dh1_x1 = 0; this.dh1_x2 = 0; this.dh1_y1 = 0; this.dh1_y2 = 0;
    this.dh2_x1 = 0; this.dh2_x2 = 0; this.dh2_y1 = 0; this.dh2_y2 = 0;

    // 4. Split-Band De-Esser Filter & Envelope State
    this.calcDeEsserCrossover();
    this.de_x1 = 0; this.de_x2 = 0; this.de_y1 = 0; this.de_y2 = 0;
    this.sibilanceEnv = 0.0;
    this.broadbandEnv = 0.0;
    this.deEssGain = 1.0;

    this.port.onmessage = (e) => {
      if (typeof e.data === "object" && e.data !== null) {
        if (e.data.type === "setNoiseGate") {
          this.noiseGateDb = Math.min(0, parseInt(e.data.noiseGateDb) || 0);
        }
        if (e.data.type === "setGainBoost") {
          this.gainBoost = Math.max(0.2, Math.min(4.0, parseFloat(e.data.gainBoost) || 1.0));
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
            this.gainBoost = Math.max(0.2, Math.min(4.0, parseFloat(e.data.gainBoost) || 1.0));
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
    const Q = 6.0;
    if (this.rate <= f0 * 2) {
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
    else if (this.deHissMode === "8k") cutoff = 8000;

    if (!cutoff || this.rate <= cutoff * 2) {
      this.dh_active = false;
      return;
    }

    this.dh_active = true;
    const w0 = 2 * Math.PI * cutoff / this.rate;
    const cosW = Math.cos(w0);
    const sinW = Math.sin(w0);

    // 4th-order Butterworth Low-Pass (2 cascaded biquad stages)
    // Stage 1 (Q = 0.54119610)
    const a1_s1 = sinW / (2 * 0.54119610);
    const a0_1 = 1 + a1_s1;
    this.dh1_b0 = ((1 - cosW) / 2) / a0_1;
    this.dh1_b1 = (1 - cosW) / a0_1;
    this.dh1_b2 = ((1 - cosW) / 2) / a0_1;
    this.dh1_a1 = (-2 * cosW) / a0_1;
    this.dh1_a2 = (1 - a1_s1) / a0_1;

    // Stage 2 (Q = 1.3065630)
    const a1_s2 = sinW / (2 * 1.3065630);
    const a0_2 = 1 + a1_s2;
    this.dh2_b0 = ((1 - cosW) / 2) / a0_2;
    this.dh2_b1 = (1 - cosW) / a0_2;
    this.dh2_b2 = ((1 - cosW) / 2) / a0_2;
    this.dh2_a1 = (-2 * cosW) / a0_2;
    this.dh2_a2 = (1 - a1_s2) / a0_2;
  }

  calcDeEsserCrossover() {
    // 5.5 kHz High-Pass filter for sibilance crossover extraction
    const f0 = 5500;
    if (this.rate <= f0 * 2) {
      this.de_active = false;
      return;
    }
    this.de_active = true;
    const w0 = 2 * Math.PI * f0 / this.rate;
    const cosW = Math.cos(w0);
    const sinW = Math.sin(w0);
    const alpha = sinW / (2 * Math.SQRT1_2); // Butterworth Q = 0.707
    const a0 = 1 + alpha;

    this.de_b0 = ((1 + cosW) / 2) / a0;
    this.de_b1 = (-(1 + cosW)) / a0;
    this.de_b2 = ((1 + cosW) / 2) / a0;
    this.de_a1 = (-2 * cosW) / a0;
    this.de_a2 = (1 - alpha) / a0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const ch0 = input[0];
    const ch1 = input[1];
    const hasStereo = !!(ch1 && ch1.length === ch0.length);

    const noiseGateActive = this.noiseGateDb < 0;
    const gateThresholdRms = 0.004; // ~ -48 dBFS threshold
    const minGain = noiseGateActive ? Math.pow(10, this.noiseGateDb / 20) : 1.0;
    const boost = this.gainBoost;

    // De-Esser compression ratio
    let deEssMaxAtten = 1.0;
    if (this.deEsserMode === "light") deEssMaxAtten = 0.501; // -6 dB cut on sibilance
    else if (this.deEsserMode === "medium") deEssMaxAtten = 0.316; // -10 dB cut on sibilance
    else if (this.deEsserMode === "strong") deEssMaxAtten = 0.158; // -16 dB cut on sibilance

    for (let i = 0; i < ch0.length; i++) {
      let sample = ch0[i];

      // Smart channel selection for 2-channel audio interfaces
      if (hasStereo) {
        const s0 = ch0[i];
        const s1 = ch1[i];
        if (Math.abs(s1) > Math.abs(s0)) {
          sample = s1;
        }
      }

      // 1. High-Pass Filter (80Hz - removes sub-bass desk rumble & AC electrical hum)
      const hpSample = this.hpAlpha * (this.hpY1 + sample - this.hpX1);
      this.hpX1 = sample;
      this.hpY1 = hpSample;
      sample = hpSample;

      // 2. 5 kHz Static Whine Notch Filter (Broad Q=6 deep notch)
      if (this.notch5kEnabled) {
        const nOut = this.n5k_b0 * sample + this.n5k_b1 * this.n5k_x1 + this.n5k_b2 * this.n5k_x2
                     - this.n5k_a1 * this.n5k_y1 - this.n5k_a2 * this.n5k_y2;
        this.n5k_x2 = this.n5k_x1;
        this.n5k_x1 = sample;
        this.n5k_y2 = this.n5k_y1;
        this.n5k_y1 = nOut;
        sample = nOut;
      }

      // 3. 4-Pole Steep De-Hiss Filter (Cuts hiss above cutoff)
      if (this.dh_active && this.deHissMode !== "off") {
        // Stage 1
        const y1 = this.dh1_b0 * sample + this.dh1_b1 * this.dh1_x1 + this.dh1_b2 * this.dh1_x2
                   - this.dh1_a1 * this.dh1_y1 - this.dh1_a2 * this.dh1_y2;
        this.dh1_x2 = this.dh1_x1;
        this.dh1_x1 = sample;
        this.dh1_y2 = this.dh1_y1;
        this.dh1_y1 = y1;

        // Stage 2
        const y2 = this.dh2_b0 * y1 + this.dh2_b1 * this.dh2_x1 + this.dh2_b2 * this.dh2_x2
                   - this.dh2_a1 * this.dh2_y1 - this.dh2_a2 * this.dh2_y2;
        this.dh2_x2 = this.dh2_x1;
        this.dh2_x1 = y1;
        this.dh2_y2 = this.dh2_y1;
        this.dh2_y1 = y2;

        sample = y2;
      }

      // 4. Split-Band Professional De-Esser (Dynamic High-Band Sibilance Compression)
      if (this.de_active && this.deEsserMode !== "off") {
        // Extract 5.5kHz+ High-Band
        const highBand = this.de_b0 * sample + this.de_b1 * this.de_x1 + this.de_b2 * this.de_x2
                         - this.de_a1 * this.de_y1 - this.de_a2 * this.de_y2;
        this.de_x2 = this.de_x1;
        this.de_x1 = sample;
        this.de_y2 = this.de_y1;
        this.de_y1 = highBand;

        const lowBand = sample - highBand; // Linear-phase crossover subtractive reconstruction

        const absHigh = Math.abs(highBand);
        const absFull = Math.abs(sample);
        this.sibilanceEnv = 0.92 * this.sibilanceEnv + 0.08 * absHigh;
        this.broadbandEnv = 0.96 * this.broadbandEnv + 0.04 * absFull;

        // Compare high frequency energy against overall voice energy
        const isSibilant = (this.sibilanceEnv / (this.broadbandEnv + 1e-4)) > 0.28 && this.broadbandEnv > 0.002;
        const targetDeEss = isSibilant ? deEssMaxAtten : 1.0;
        const speed = targetDeEss < this.deEssGain ? 0.15 : 0.005; // 0.5ms ultra-fast attack, ~40ms recovery
        this.deEssGain += speed * (targetDeEss - this.deEssGain);

        // Recombine voice body with compressed sibilance
        sample = lowBand + (highBand * this.deEssGain);
      }

      // 5. Volume / Gain Scaling
      if (boost !== 1.0) {
        sample *= boost;
        if (sample > 0.98) sample = 0.98;
        else if (sample < -0.98) sample = -0.98;
      }

      // 6. Noise Gate
      if (noiseGateActive) {
        const absSample = Math.abs(sample);
        this.gateEnvelope = 0.95 * this.gateEnvelope + 0.05 * absSample;

        const isVoice = this.gateEnvelope > gateThresholdRms;
        const targetGain = isVoice ? 1.0 : minGain;
        const alpha = targetGain > this.currentGateGain ? 0.02 : 0.001; // ~5ms attack, ~200ms smooth release
        this.currentGateGain += alpha * (targetGain - this.currentGateGain);
        sample *= this.currentGateGain;
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
