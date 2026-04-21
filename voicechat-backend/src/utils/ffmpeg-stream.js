import ffmpeg from "fluent-ffmpeg";

export function streamS3ToWav(s3ReadableStream, res, filename) {
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.wav"`);

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
}
