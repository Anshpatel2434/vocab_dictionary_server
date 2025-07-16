import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const talkWithAI = async (prompt) => {
	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

	try {
		const response = await ai.models.generateContent({
			model: "gemini-2.0-flash",
			contents: prompt,
		});
		console.log("Got response from the AI and it is : ");
		console.log(response);
		return response;
	} catch (error) {
		console.error("Error:", error);
	}
};

export default talkWithAI;
