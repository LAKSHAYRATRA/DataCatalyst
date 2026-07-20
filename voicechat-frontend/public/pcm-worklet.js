class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Buffer size for 0.5 seconds at 48000 Hz = 24000 samples
    this.bufferSize = 24000;
    this.buffer = new Float32Array(this.bufferSize);
    this.offset = 0;

    this.port.onmessage = (e) => {
      if (e.data === "flush" && this.offset > 0) {
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
    for (let i = 0; i < ch0.length; i++) {
      this.buffer[this.offset++] = ch0[i];
      
      if (this.offset >= this.bufferSize) {
        // Buffer is full, send it!
        const out = new Float32Array(this.buffer);
        this.port.postMessage(out.buffer, [out.buffer]);
        this.offset = 0; // Reset offset
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
