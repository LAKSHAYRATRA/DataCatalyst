import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

// Helper to convert readable stream to buffer
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Convert an S3 readable stream to a fully-buffered WAV Buffer.
function padWavBuffer(wavBuffer, targetDurationMs, sampleRate = 48000, numChannels = 1, bytesPerSample = 3) {
  if (!targetDurationMs || targetDurationMs <= 0) return wavBuffer;

  const bytesPerSec = sampleRate * numChannels * bytesPerSample;
  const targetDataSize = Math.round((targetDurationMs / 1000) * bytesPerSec);
  
  if (wavBuffer.length < 44) return wavBuffer;
  const subchunk2Size = wavBuffer.readUInt32LE(40);
  
  if (subchunk2Size >= targetDataSize) {
    return wavBuffer; 
  }
  
  const paddingSize = targetDataSize - subchunk2Size;
  const paddingBuffer = Buffer.alloc(paddingSize, 0); 
  
  const newWavBuffer = Buffer.concat([wavBuffer, paddingBuffer]);
  
  newWavBuffer.writeUInt32LE(newWavBuffer.length - 8, 4);
  newWavBuffer.writeUInt32LE(targetDataSize, 40);
  
  return newWavBuffer;
}

export async function streamS3ToWav(s3ReadableStream, res, filename) {
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.wav"`);

  try {
    ffmpeg(s3ReadableStream)
      .format("wav")
      .outputOptions([
        "-ar 48000",
        "-acodec pcm_s24le"
      ])
      .on("error", (err) => {
        console.error("FFMPEG Stream Error:", err);
        if (!res.headersSent) res.status(500).end();
      })
      .pipe(res, { end: true });
  } catch (err) {
    console.error("FFMPEG Setup Error:", err);
    if (!res.headersSent) res.status(500).end();
  }
}

export function getWavStream(s3ReadableStream) {
  // Not used in core app, kept for compatibility
  return s3ReadableStream;
}

export async function getWavBuffer(s3ReadableStream, { offsetMs, durationMs } = {}) {
  const tempDir = path.join(process.cwd(), "scratch", "temp_audio");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  
  const tempInPath = path.join(tempDir, `in_${Date.now()}_${Math.random().toString(36).substring(7)}.flac`);
  const tempOutPath = path.join(tempDir, `out_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`);

  try {
    const buffer = await streamToBuffer(s3ReadableStream);
    fs.writeFileSync(tempInPath, buffer);

    await new Promise((resolve, reject) => {
      const cmd = ffmpeg(tempInPath);
      const filters = [];

      if (offsetMs && offsetMs > 0) {
        filters.push(`adelay=${Math.round(offsetMs)}|${Math.round(offsetMs)}`);
      }

      if (filters.length > 0) {
        cmd.audioFilters(filters);
      }

      cmd.format("wav")
        .outputOptions([
          "-ar 48000",
          "-acodec pcm_s24le",
          "-ac 1"
        ])
        .on("error", (err) => {
          console.error("FFMPEG Conversion Error:", err);
          reject(err);
        })
        .on("end", resolve)
        .save(tempOutPath);
    });

    let finalBuffer = fs.readFileSync(tempOutPath);

    if (durationMs && durationMs > 0) {
      finalBuffer = padWavBuffer(finalBuffer, durationMs);
    }

    return finalBuffer;
  } finally {
    try {
      if (fs.existsSync(tempInPath)) fs.unlinkSync(tempInPath);
      if (fs.existsSync(tempOutPath)) fs.unlinkSync(tempOutPath);
    } catch (cleanupErr) {
      console.error("Failed to clean up temp ffmpeg files:", cleanupErr);
    }
  }
}
