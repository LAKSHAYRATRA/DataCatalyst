import mongoose from "mongoose";
import "dotenv/config";
import { syncPendingScriptedSubmissions } from "../src/services/scriptedSync.js";

async function run() {
    console.log("Connecting to MongoDB:", process.env.MONGODB_URI ? "URI provided" : "No URI");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected! Running syncPendingScriptedSubmissions()...");
    
    const count = await syncPendingScriptedSubmissions();
    console.log(`\n✅ Sync complete! Created ${count} missing CallSession(s) for pending scripted submissions.`);
    
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error("Fatal sync error:", err);
    process.exit(1);
});
