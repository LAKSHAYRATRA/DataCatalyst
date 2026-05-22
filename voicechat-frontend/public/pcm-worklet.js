class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    // Send raw Float32 — preserves the full ~24-bit dynamic range the
    // Web Audio API provides. The old Int16 conversion discarded 4 bits
    // of precision (96 dB vs 120 dB), causing the "compressed" sound.
    const ch0 = input[0];
    const out = new Float32Array(ch0);
    this.port.postMessage(out.buffer, [out.buffer]);
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
