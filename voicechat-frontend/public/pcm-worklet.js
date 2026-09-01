class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const currentRate = typeof sampleRate !== "undefined" ? sampleRate : 48000;
    this.rate = currentRate;
    this.bufferSize = Math.round(currentRate * 0.5);
    this.buffer = new Float32Array(this.bufferSize);
    this.offset = 0;

    this.port.onmessage = (e) => {
      if (e.data === "flush" && this.offset > 0) {
        const out = new Float32Array(this.buffer.slice(0, this.offset));
        this.port.postMessage(out.buffer, [out.buffer]);
        this.offset = 0;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    // Pure 100% Direct Hardware PCM Capture (Matching Audacity - No channel jumping, No filters)
    const ch = input[0];
    const len = ch.length;

    for (let i = 0; i < len; i++) {
      this.buffer[this.offset++] = ch[i];

      if (this.offset >= this.bufferSize) {
        const out = new Float32Array(this.buffer.slice(0, this.offset));
        this.port.postMessage(out.buffer, [out.buffer]);
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
