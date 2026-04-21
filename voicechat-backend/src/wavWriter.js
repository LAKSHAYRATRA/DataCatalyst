import fs from "fs";
import path from "path";

function writeString(buf, offset, str) {
  buf.write(str, offset, "ascii");
}

export class WavWriter {
  constructor({ filePath, sampleRate, channels = 1, bitsPerSample = 16 }) {
    if (bitsPerSample !== 16) {
      throw new Error("Only 16-bit WAV is supported");
    }
    if (channels !== 1) {
      throw new Error("Only mono WAV is supported");
    }

    this.filePath = filePath;
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.bitsPerSample = bitsPerSample;
    this.dataSize = 0;

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.fd = fs.openSync(filePath, "w");

    const header = this.#buildHeader(0);
    fs.writeSync(this.fd, header, 0, header.length);
  }

  appendPcm16le(buffer) {
    const chunk = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    if (chunk.length % 2 !== 0) {
      throw new Error("PCM16LE chunk must have even byte length");
    }

    fs.writeSync(this.fd, chunk, 0, chunk.length, null);
    this.dataSize += chunk.length;
  }

  finalize() {
    if (this.fd == null) return;

    const riffSize = 36 + this.dataSize;

    const riffSizeBuf = Buffer.alloc(4);
    riffSizeBuf.writeUInt32LE(riffSize, 0);
    fs.writeSync(this.fd, riffSizeBuf, 0, 4, 4);

    const dataSizeBuf = Buffer.alloc(4);
    dataSizeBuf.writeUInt32LE(this.dataSize, 0);
    fs.writeSync(this.fd, dataSizeBuf, 0, 4, 40);

    fs.closeSync(this.fd);
    this.fd = null;
  }

  #buildHeader(dataSize) {
    const header = Buffer.alloc(44);
    writeString(header, 0, "RIFF");
    header.writeUInt32LE(36 + dataSize, 4);
    writeString(header, 8, "WAVE");
    writeString(header, 12, "fmt ");
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(this.channels, 22);
    header.writeUInt32LE(this.sampleRate, 24);
    const byteRate =
      this.sampleRate * this.channels * (this.bitsPerSample / 8);
    header.writeUInt32LE(byteRate, 28);
    const blockAlign = this.channels * (this.bitsPerSample / 8);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(this.bitsPerSample, 34);
    writeString(header, 36, "data");
    header.writeUInt32LE(dataSize, 40);
    return header;
  }
}
