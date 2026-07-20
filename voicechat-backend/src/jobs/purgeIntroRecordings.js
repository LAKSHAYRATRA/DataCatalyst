import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import { User } from "../models/User.js";

const RETENTION_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function purgeIntroRecordings() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);

  const users = await User.find({
    introRecordingFile: { $ne: null },
    accountStatus: { $in: ["pending_approval", "rejected"] },
    introRecordingUploadedAt: { $lt: cutoff },
  }).select("_id introRecordingFile accountStatus introRecordingUploadedAt");

  if (users.length === 0) {
    console.log("[purgeIntroRecordings] nothing to purge");
    return { scanned: 0, deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;

  for (const user of users) {
    const key = user.introRecordingFile;
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
      await User.updateOne(
        { _id: user._id },
        { $set: { introRecordingFile: null } }
      );
      deleted++;
      console.log(`[purgeIntroRecordings] deleted ${key} for user ${user._id} (status=${user.accountStatus})`);
    } catch (err) {
      failed++;
      console.error(`[purgeIntroRecordings] failed to delete ${key} for user ${user._id}:`, err.message);
    }
  }

  console.log(`[purgeIntroRecordings] scanned=${users.length} deleted=${deleted} failed=${failed}`);
  return { scanned: users.length, deleted, failed };
}

export function startPurgeIntroRecordingsCron() {
  purgeIntroRecordings().catch(err =>
    console.error("[purgeIntroRecordings] initial run failed:", err)
  );
  const intervalMs = 24 * 60 * 60 * 1000;
  setInterval(() => {
    purgeIntroRecordings().catch(err =>
      console.error("[purgeIntroRecordings] scheduled run failed:", err)
    );
  }, intervalMs).unref();
}
