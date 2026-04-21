class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const ch0 = input[0];
    const out = new Int16Array(ch0.length);

    for (let i = 0; i < ch0.length; i++) {
      let s = ch0[i];
      if (s > 1) s = 1;
      if (s < -1) s = -1;
      out[i] = (s * 0x7fff) | 0;
    }

    this.port.postMessage(out.buffer, [out.buffer]);
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
