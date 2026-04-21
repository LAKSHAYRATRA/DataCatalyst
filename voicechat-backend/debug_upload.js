import mongoose from "mongoose";
import dotenv from "dotenv";
import { Phrase } from "./src/models/Phrase.js";
dotenv.config();

const testRun = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const p = {
            "id": "tts_en_001",
            "language": "english",
            "script_type": "orthographic",
            "speaker_id": "spk_01",
            "text": "I honestly didn't expect things to go this smoothly [laughter], but I'm glad everything worked out better than we planned.",
            "emotion": "amused",
            "style": "conversational",
            "intent": "reflection",
            "pitch": "medium",
            "speed": "slightly_slow",
            "volume": "normal",
            "events": ["laughter"],
            "instruction": "Relaxed tone. Add a light laugh after 'smoothly', then continue warmly."
        };

        const doc = {
            companyId: null,
            language: p.language || "english",
            script_type: p.script_type || null,
            speaker_id: p.speaker_id || null,
            text: p.text,
            emotion: p.emotion || null,
            style: p.style || null,
            intent: p.intent || null,
            pitch: p.pitch || null,
            speed: p.speed || null,
            volume: p.volume || null,
            events: Array.isArray(p.events) ? p.events.join(", ") : (p.events || null),
            instructions: p.instructions || p.instruction || null,
        };
        console.log("Attempting to insert...");
        const result = await Phrase.create({ phraseId: String(p.id), ...doc });
        console.log("Success:", result);
    } catch(e) {
        console.error("Test Error:", e);
    } finally {
        process.exit();
    }
}
testRun();
