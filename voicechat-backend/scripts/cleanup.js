import "dotenv/config";
import { connectDb } from "../src/db.js";
import { Language } from "../src/models/Language.js";
import { Company } from "../src/models/Company.js";
import { Phrase } from "../src/models/Phrase.js";

const MONGODB_URI = process.env.MONGODB_URI || "";

async function cleanup() {
  await connectDb(MONGODB_URI);
  console.log("✅ Connected to database\n");

  // 1. Delete all Languages
  const langResult = await Language.deleteMany({});
  console.log(`🗑️  Deleted ${langResult.deletedCount} language(s)`);

  // 2. Delete all Phrases (all statuses)
  const phraseResult = await Phrase.deleteMany({});
  console.log(`🗑️  Deleted ${phraseResult.deletedCount} phrase(s)`);

  // 3. Delete all Companies
  const companyResult = await Company.deleteMany({});
  console.log(`🗑️  Deleted ${companyResult.deletedCount} company/companies`);

  console.log("\n✅ Cleanup complete.");
  process.exit(0);
}

cleanup().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
