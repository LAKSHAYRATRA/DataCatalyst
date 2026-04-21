// Speech evaluation is proxied through the backend to keep the Gemini API key
// server-side only. The backend endpoint /api/test/analyze-speech handles the
// actual Gemini call — no VITE_GEMINI_API_KEY needed in the frontend .env.

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export const evaluateSpeech = async (audioBase64, targetSentence) => {
    try {
        const res = await fetch(`${BACKEND_URL}/api/test/analyze-speech`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include", // send vc_token cookie
            body: JSON.stringify({ audio: audioBase64, sentence: targetSentence }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Server error ${res.status}`);
        }

        return await res.json();
    } catch (error) {
        console.error("Speech evaluation error:", error);
        return {
            transcription: "Error transcribing audio.",
            isMatch: false,
            score: 0,
            feedback: "There was an issue processing your voice. Please try again.",
        };
    }
};
