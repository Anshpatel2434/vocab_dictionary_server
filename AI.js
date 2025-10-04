// Import dotenv to load environment variables from a .env file
import "dotenv/config";

import { GoogleGenerativeAI } from "@google/generative-ai";

// Get the API key from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Check if the API key is available
if (!GEMINI_API_KEY) {
	throw new Error("GEMINI_API_KEY is not defined in your .env file");
}

// Initialize the GoogleGenerativeAI client with the API key
const ai = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Sends a prompt to the Gemini model and returns the text response.
 * @param {string} prompt The text prompt to send to the AI.
 * @returns {Promise<string>} The generated text response from the AI.
 */
const talkWithAI = async (prompt) => {
	try {
		// Get the specified generative model
		const model = ai.getGenerativeModel({ model: "gemini-2.5-pro" });

		// Generate content based on the prompt
		const result = await model.generateContent(prompt);

		// Get the response object from the result
		const response = result.response;

		// Extract the text content from the response
		const text = response.text();

		console.log("Got response from the AI and it is: ");
		console.log(text);

		return text; // Return only the text string
	} catch (error) {
		console.error("Error communicating with the AI:", error);
		// Optionally, re-throw the error or return a specific error message
		throw error;
	}
};

export default talkWithAI;

// Example of how to use the function (optional, for testing)
/*
async function runExample() {
  const responseText = await talkWithAI("Write a short, futuristic poem about Ahmedabad.");
  console.log("\n--- Final Output ---");
  console.log(responseText);
}

runExample();
*/
