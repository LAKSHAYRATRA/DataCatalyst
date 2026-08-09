import mongoose from "mongoose";

export async function connectDb(mongoUri) {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }
  await mongoose.connect(mongoUri);
  try {
    const indexes = await mongoose.connection.collection("users").indexes();
    const speakerIdIdx = indexes.find((idx) => idx.name === "speaker_id_1");
    if (speakerIdIdx && !speakerIdIdx.sparse) {
      await mongoose.connection.collection("users").dropIndex("speaker_id_1");
      console.log("[DB] Dropped legacy non-sparse speaker_id_1 index for proper sparse indexing.");
    }
  } catch (err) {
    // Ignore if collection doesn't exist yet
  }
  return mongoose;
}
