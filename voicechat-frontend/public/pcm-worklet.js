class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Buffer size for 0.5 seconds at 48000 Hz = 24000 samples
    this.bufferSize = 24000;
    this.buffer = new Float32Array(this.bufferSize);
    this.offset = 0;

    this.noiseGateDb = 0; // 0 = RAW/OFF, -6, -10, -12, -15, -18 dB
    this.gainBoost = 1.0; // 1.0 = 0% (Original), 0.70 = -30%, 1.30 = +30%
    this.currentGain = 1.0;
    this.envelope = 0.0;

    this.port.onmessage = (e) => {
      if (typeof e.data === "object" && e.data !== null) {
        if (e.data.type === "setNoiseGate") {
          this.noiseGateDb = Math.min(0, parseInt(e.data.noiseGateDb) || 0);
        }
        if (e.data.type === "setGainBoost") {
          this.gainBoost = Math.max(0.5, Math.min(3.0, parseFloat(e.data.gainBoost) || 1.0));
        }
      } else if (e.data === "flush" && this.offset > 0) {
        const out = new Float32Array(this.buffer.subarray(0, this.offset));
        this.port.postMessage(out.buffer, [out.buffer]);
        this.offset = 0;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const ch0 = input[0];
    const noiseGateActive = this.noiseGateDb < 0;
    const gateThresholdRms = 0.005; // ~ -46 dBFS threshold
    const minGain = noiseGateActive ? Math.pow(10, this.noiseGateDb / 20) : 1.0;
    const boost = this.gainBoost;

    for (let i = 0; i < ch0.length; i++) {
      let sample = ch0[i];

      // 1. Apply Gain Scaling (Percentage adjustment: -30% = 0.70x, +30% = 1.30x)
      if (boost !== 1.0) {
        sample *= boost;
        // Peak guard rail to prevent digital clipping
        if (sample > 0.95) sample = 0.95;
        else if (sample < -0.95) sample = -0.95;
      }

      // 2. Apply Noise Gate if enabled
      if (noiseGateActive) {
        const absSample = Math.abs(sample);
        // Envelope follower with fast tracking
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
