import mongoose from "mongoose";
import dotenv from "dotenv";
import { Language } from "./src/models/Language.js";

dotenv.config();

const addHinglish = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const existing = await Language.findOne({ code: "hinglish" });
        if (!existing) {
            await Language.create({
                name: "Hinglish",
                code: "hinglish",
                hourlyPayout: 10,
                enabled: true
            });
            console.log("Hinglish added to Database!");
        } else {
            console.log("Hinglish already exists.");
        }
    } catch(e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
};

addHinglish();
