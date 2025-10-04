// // Import dotenv to load environment variables from a .env file
// import "dotenv/config";

// import OpenAI from "openai";

// // Get the API key from environment variables
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// // Check if the API key is available
// if (!OPENAI_API_KEY) {
// 	throw new Error("OPENAI_API_KEY is not defined in your .env file");
// }

// // Initialize the OpenAI client with the API key
// const openai = new OpenAI({
// 	apiKey: OPENAI_API_KEY,
// });

// /**
//  * Sends a prompt to the OpenAI model and returns the text response.
//  * @param {string} prompt The text prompt to send to the AI.
//  * @returns {Promise<string>} The generated text response from the AI.
//  */
// const talkWithOpenAI = async (prompt) => {
// 	try {
// 		// Call the OpenAI Chat Completions API
// 		const response = await openai.chat.completions.create({
// 			model: "gpt-4o", // You can change to gpt-4o, gpt-4.1, gpt-3.5-turbo, etc.
// 			messages: [
// 				{ role: "system", content: "You are a helpful assistant." },
// 				{ role: "user", content: prompt },
// 			],
// 		});

// 		// Extract the message content
// 		const text = response.choices[0]?.message?.content?.trim() || "";

// 		console.log("Got response from the AI and it is:");
// 		console.log(text);

// 		return text;
// 	} catch (error) {
// 		console.error("Error communicating with the AI:", error);
// 		throw error;
// 	}
// };

// export default talkWithOpenAI;

// // Example of how to use the function (optional, for testing)
// /*
// async function runExample() {
//   const responseText = await talkWithAI("Write a short, futuristic poem about Ahmedabad.");
//   console.log("\n--- Final Output ---");
//   console.log(responseText);
// }

// runExample();
// */
