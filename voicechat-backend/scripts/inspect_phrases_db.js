import mongoose from "mongoose";
import { Phrase } from "../src/models/Phrase.js";
import { User } from "../src/models/User.js";
import { Company } from "../src/models/Company.js";

async function main() {
    await mongoose.connect("mongodb://localhost:27017/voicechat");
    console.log("Connected to MongoDB!");

    // 1. Get all phrases in DB
    const phrases = await Phrase.find({}).select("phraseId companyId language status").lean();
    console.log(`\n--- ALL PHRASES IN DATABASE (${phrases.length}) ---`);
    phrases.forEach(p => {
        console.log(`ID: ${p.phraseId} | Company: "${p.companyId}" | Lang: "${p.language}" | Status: "${p.status}"`);
    });

    // 2. Get all companies
    const companies = await Company.find({}).lean();
    console.log(`\n--- ALL COMPANIES IN DATABASE (${companies.length}) ---`);
    companies.forEach(c => {
        console.log(`Name: "${c.name}" | ProjectName: "${c.projectName}" | Languages: ${JSON.stringify(c.languages)}`);
    });

    // 3. Get all users and their approved phrase applications
    const users = await User.find({}).lean();
    console.log(`\n--- USERS & APPROVED PHRASE APPLICATIONS ---`);
    users.forEach(u => {
        const approvedApps = (u.languageApplications || []).filter(a => a.status === "approved" && a.applicationType === "phrase");
        if (approvedApps.length > 0) {
            console.log(`User: ${u.username} (${u.accountStatus})`);
            approvedApps.forEach(a => {
                console.log(`  - CompanyId: "${a.companyId}" | Lang: "${a.languageCode}"`);
            });
        }
    });

    await mongoose.disconnect();
}

main().catch(console.error);
