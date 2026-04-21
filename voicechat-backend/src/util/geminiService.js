import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
let ai = null;

if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
} else {
    console.warn("GEMINI_API_KEY is not set in environment variables. Speech evaluation will fail.");
}

export const evaluateSpeech = async (audioBase64, targetSentence) => {
    if (!ai) {
        throw new Error("Gemini API key is missing on the server.");
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: 'audio/webm',
                            data: audioBase64,
                        },
                    },
                    {
                        text: `The user is supposed to say: "${targetSentence}". 
            Compare their speech to this target. 
            Provide the transcription, a boolean isMatch (true if mostly correct), 
             a score from 0 to 100 for accuracy, and brief feedback.`,
                    },
                ],
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        transcription: { type: Type.STRING },
                        isMatch: { type: Type.BOOLEAN },
                        score: { type: Type.NUMBER },
                        feedback: { type: Type.STRING },
                    },
                    required: ["transcription", "isMatch", "score", "feedback"],
                },
            },
        });

        const resultStr = response.text();
        if (!resultStr) throw new Error("Empty response from Gemini");

        return JSON.parse(resultStr);
    } catch (error) {
        console.error("Gemini API Error:", error);
        return {
            transcription: "Error transcribing audio.",
            isMatch: false,
            score: 0,
            feedback: "There was an issue processing your voice. Please try again."
        };
    }
};
