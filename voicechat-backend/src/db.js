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

    // Auto-normalize any legacy _downloaded in phrases collection so company names stay unified
    const downloadedPhrases = await mongoose.connection.collection("phrases").find({
      companyId: { $regex: /_downloaded$/i }
    }).toArray();
    if (downloadedPhrases.length > 0) {
      for (const p of downloadedPhrases) {
        const cleanCompany = String(p.companyId).replace(/_downloaded$/i, "").trim();
        await mongoose.connection.collection("phrases").updateOne(
          { _id: p._id },
          { $set: { companyId: cleanCompany, isDownloaded: true } }
        );
      }
      console.log(`[DB] Normalized ${downloadedPhrases.length} phrases with legacy '_downloaded' companyId back to core company names.`);
    }

    // Auto-normalize any archived phrases so their original phraseId is immediately re-usable
    const unrenamedArchived = await mongoose.connection.collection("phrases").find({
      isArchivedFromCompanyWorkload: true,
      phraseId: { $not: /_archived_/ }
    }).toArray();
    if (unrenamedArchived.length > 0) {
      for (const p of unrenamedArchived) {
        await mongoose.connection.collection("phrases").updateOne(
          { _id: p._id },
          { $set: { phraseId: `${p.phraseId}_archived_${p._id}`, originalPhraseId: p.phraseId } }
        );
      }
      console.log(`[DB] Freed ${unrenamedArchived.length} original phrase IDs from legacy archived records.`);
    }
  } catch (err) {
    // Ignore if collection doesn't exist yet
  }
  return mongoose;
}
