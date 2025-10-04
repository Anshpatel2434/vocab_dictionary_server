const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Word = require("./model/Word");
const cors = require("cors");
const http = require("http");
// const { default: talkWithAI } = require("./AI");

dotenv.config();

const app = express();
app.use(express.json()); // for parsing JSON
app.use(cors({ origin: "*", credentials: true }));

const PORT = process.env.PORT || 5000;
const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
	console.error("MONGO_URL is not defined in environment variables.");
	process.exit(1);
}

const server = http.createServer(app);

mongoose
	.connect(MONGO_URL, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	})
	.then(() => {
		console.log("Database connected successfully");
		server.listen(PORT, () => {
			console.log(`Server is running on port ${PORT}`);
		});
	})
	.catch((error) => console.log(error));

app.get("/api/v1", (req, res) => {
	res.send("Vocabulary API is running ✅");
});

//to check the password
app.post("/api/v1/verifyPassword", async (req, res) => {
	try {
		const password = req.body.password; // expect array of word objects
		if (password === process.env.PASSWORD || password === process.env.TOKEN) {
			res.status(200).json({
				message: "Password is correct",
				token: process.env.TOKEN,
			});
		} else {
			res.status(401).json({ message: "Password is incorrect" });
		}
	} catch (error) {
		console.error(error);
		res.status(500).json({
			message: "Error while verifying password",
			error: error.message,
		});
	}
});

// 1️⃣ POST: Add multiple words with duplicate check
app.post("/api/v1/postWords", async (req, res) => {
	try {
		const words = req.body.words; // expect array of word objects

		if (!Array.isArray(words) || words.length === 0) {
			return res
				.status(400)
				.json({ message: "Please provide an array of words." });
		}

		// Convert all input word names to lowercase
		const wordNamesLower = words.map((w) => w.word.toLowerCase());

		// Find existing words in DB using case-insensitive search
		const existingWords = await Word.find({
			word: { $in: wordNamesLower.map((name) => new RegExp(`^${name}$`, "i")) },
		});

		const existingWordNamesLower = existingWords.map((w) =>
			w.word.toLowerCase()
		);

		// Filter out duplicates (case-insensitive)
		const uniqueWords = words.filter(
			(w) => !existingWordNamesLower.includes(w.word.toLowerCase())
		);

		if (uniqueWords.length === 0) {
			return res.status(400).json({
				message:
					"All provided words already exist in the database (case-insensitive check).",
			});
		}

		// Insert only unique words
		const savedWords = await Word.insertMany(uniqueWords);

		res.status(201).json({
			message: `${savedWords.length} words added successfully.`,
			addedWords: savedWords,
			skippedWords: existingWordNamesLower,
		});
	} catch (error) {
		console.error(error);
		res
			.status(500)
			.json({ message: "Failed to add words", error: error.message });
	}
});

// 2️⃣ GET: Paginated words list (sorted by least opened first)
app.get("/api/v1/getWords", async (req, res) => {
	try {
		const limit = parseInt(req.query.limit) || 10;
		const page = parseInt(req.query.page) || 1;
		const skip = (page - 1) * limit;

		const totalCount = await Word.countDocuments();
		const totalPages = Math.ceil(totalCount / limit);

		// Sort by no_of_times_opened (descending - most opened first)
		// Handle cases where no_of_times_opened might be null/undefined
		const words = await Word.find()
			.sort({
				createdAt: -1, // Descending - newest first
				_id: -1, // Secondary sort for consistency
			})
			.skip(skip)
			.limit(limit);

		res.status(200).json({
			totalCount,
			totalPages,
			currentPage: page,
			words,
		});
	} catch (error) {
		console.error(error);
		res
			.status(500)
			.json({ message: "Failed to fetch words", error: error.message });
	}
});

// 3️⃣ GET: Filtered words
app.get("/api/v1/words/filter", async (req, res) => {
	try {
		console.log(req);
		const { word } = req.query;
		const filter = {};

		if (word) {
			filter.word = { $regex: word, $options: "i" }; // case-insensitive search
		}

		const words = await Word.find(filter);
		res.json({
			count: words.length,
			words,
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({
			message: "Failed to fetch filtered words",
			error: error.message,
		});
	}
});

// 5️⃣ POST: Increase the count of no_of_times_opened (Simplified Atomic Version)
app.post("/api/v1/increase_open_count", async (req, res) => {
	try {
		const { id } = req.body;

		// Validate input
		if (!id) {
			return res.status(400).json({
				success: false,
				message: "Word ID is required",
			});
		}

		// Validate MongoDB ObjectId format
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid word ID format",
			});
		}

		// Use simple $inc operation - MongoDB will handle undefined fields gracefully
		const updatedWord = await Word.findByIdAndUpdate(
			id,
			{ $inc: { no_of_times_opened: 1 } },
			{
				new: true, // Return the updated document
				runValidators: true, // Run schema validators
			}
		);

		// Check if word was found
		if (!updatedWord) {
			return res.status(404).json({
				success: false,
				message: "Word not found",
			});
		}

		// Success response
		res.status(200).json({
			success: true,
			message: "Open count increased successfully",
			data: {
				wordId: updatedWord._id,
				word: updatedWord.word,
				no_of_times_opened: updatedWord.no_of_times_opened,
			},
		});
	} catch (error) {
		console.error("Error increasing open count:", error);

		// Handle specific MongoDB errors
		if (error.name === "CastError") {
			return res.status(400).json({
				success: false,
				message: "Invalid word ID format",
			});
		}

		// Generic server error
		res.status(500).json({
			success: false,
			message: "Failed to increase open count",
		});
	}
});

// 5️⃣ POST: Decrease the count of no_of_times_opened (Simplified Atomic Version)
app.post("/api/v1/decrease_open_count", async (req, res) => {
	try {
		const { id } = req.body;

		// Validate input
		if (!id) {
			return res.status(400).json({
				success: false,
				message: "Word ID is required",
			});
		}

		// Validate MongoDB ObjectId format
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid word ID format",
			});
		}

		// Use simple $inc operation - MongoDB will handle undefined fields gracefully
		const updatedWord = await Word.findByIdAndUpdate(
			id,
			{ $inc: { no_of_times_opened: -1 } },
			{
				new: true, // Return the updated document
				runValidators: true, // Run schema validators
			}
		);

		// Check if word was found
		if (!updatedWord) {
			return res.status(404).json({
				success: false,
				message: "Word not found",
			});
		}

		// Success response
		res.status(200).json({
			success: true,
			message: "Open count decreased successfully",
			data: {
				wordId: updatedWord._id,
				word: updatedWord.word,
				no_of_times_opened: updatedWord.no_of_times_opened,
			},
		});
	} catch (error) {
		console.error("Error decreasing open count:", error);

		// Handle specific MongoDB errors
		if (error.name === "CastError") {
			return res.status(400).json({
				success: false,
				message: "Invalid word ID format",
			});
		}

		// Generic server error
		res.status(500).json({
			success: false,
			message: "Failed to decrease open count",
		});
	}
});

// 🔥 GET: Fetch words with different sorting options
app.get("/api/v1/getWordsByType", async (req, res) => {
	try {
		const limit = parseInt(req.query.limit) || 20;
		const page = parseInt(req.query.page) || 1;
		const type = req.query.type || "normal"; // Default to normal
		const skip = (page - 1) * limit;

		// Validate pagination parameters
		if (limit < 1 || limit > 100) {
			return res.status(400).json({
				success: false,
				message: "Limit must be between 1 and 100",
			});
		}

		if (page < 1) {
			return res.status(400).json({
				success: false,
				message: "Page must be greater than 0",
			});
		}

		const totalCount = await Word.countDocuments();
		const totalPages = Math.ceil(totalCount / limit);

		let sortCriteria = {};
		let description = "";

		// Define sorting based on type
		switch (type.toLowerCase()) {
			case "least_revised":
				sortCriteria = {
					no_of_times_revised: 1, // Ascending - least revised first
					_id: 1, // Secondary sort for consistency
				};
				description = "Words sorted by least revised (ascending)";
				break;

			case "most_difficult":
				sortCriteria = {
					no_of_times_opened: -1, // Descending - most opened first
					_id: -1, // Secondary sort for consistency
				};
				description = "Words sorted by most difficult (most opened)";
				break;

			case "normal":
				sortCriteria = {
					no_of_times_revised: 1, // Ascending - normal sequence
					_id: 1, // Secondary sort for consistency
				};
				description =
					"Words sorted in normal sequence (revised count ascending)";
				break;

			case "most_revised":
				sortCriteria = {
					no_of_times_revised: -1, // Descending - most revised first
					_id: -1, // Secondary sort for consistency
				};
				description = "Words sorted by most revised (descending)";
				break;

			case "least_opened":
				sortCriteria = {
					no_of_times_opened: 1, // Ascending - least opened first
					_id: 1, // Secondary sort for consistency
				};
				description = "Words sorted by least opened (easiest words)";
				break;

			case "newest_first":
				sortCriteria = {
					createdAt: -1, // Descending - newest first
					_id: -1, // Secondary sort for consistency
				};
				description = "Words sorted by newest first";
				break;

			case "oldest_first":
				sortCriteria = {
					createdAt: 1, // Ascending - oldest first
					_id: 1, // Secondary sort for consistency
				};
				description = "Words sorted by oldest first";
				break;

			case "alphabetical":
				sortCriteria = {
					word: 1, // Ascending - A to Z
					_id: 1, // Secondary sort for consistency
				};
				description = "Words sorted alphabetically (A to Z)";
				break;

			case "reverse_alphabetical":
				sortCriteria = {
					word: -1, // Descending - Z to A
					_id: -1, // Secondary sort for consistency
				};
				description = "Words sorted reverse alphabetically (Z to A)";
				break;

			default:
				return res.status(400).json({
					success: false,
					message:
						"Invalid type. Supported types: least_revised, most_difficult, normal, most_revised, least_opened, newest_first, oldest_first, alphabetical, reverse_alphabetical",
				});
		}

		// Fetch words with sorting
		const words = await Word.find().sort(sortCriteria).skip(skip).limit(limit);

		res.status(200).json({
			success: true,
			message: "Words fetched successfully",
			data: {
				totalCount,
				totalPages,
				currentPage: page,
				limit,
				type,
				description,
				words,
			},
		});
	} catch (error) {
		console.error("Error fetching words by type:", error);
		res.status(500).json({
			success: false,
			message: "Failed to fetch words",
			error: error.message,
		});
	}
});

// 📈 POST: Increase the count of no_of_times_revised
app.post("/api/v1/increase_revision_count", async (req, res) => {
	try {
		const { id } = req.body;

		// Validate input
		if (!id) {
			return res.status(400).json({
				success: false,
				message: "Word ID is required",
			});
		}

		// Validate MongoDB ObjectId format
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid word ID format",
			});
		}

		// Use $inc operation to increment no_of_times_revised by 1
		const updatedWord = await Word.findByIdAndUpdate(
			id,
			{ $inc: { no_of_times_revised: 1 } },
			{
				new: true, // Return the updated document
				runValidators: true, // Run schema validators
			}
		);

		// Check if word was found
		if (!updatedWord) {
			return res.status(404).json({
				success: false,
				message: "Word not found",
			});
		}

		// Success response
		res.status(200).json({
			success: true,
			message: "Revision count increased successfully",
			data: {
				wordId: updatedWord._id,
				word: updatedWord.word,
				no_of_times_revised: updatedWord.no_of_times_revised,
				no_of_times_opened: updatedWord.no_of_times_opened,
			},
		});
	} catch (error) {
		console.error("Error increasing revision count:", error);

		// Handle specific MongoDB errors
		if (error.name === "CastError") {
			return res.status(400).json({
				success: false,
				message: "Invalid word ID format",
			});
		}

		// Generic server error
		res.status(500).json({
			success: false,
			message: "Failed to increase revision count",
		});
	}
});

// 📊 GET: Get available word sorting types (Helper endpoint)
app.get("/api/v1/getWordSortingTypes", (req, res) => {
	try {
		const sortingTypes = [
			{
				type: "least_revised",
				description: "Words sorted by least revised (ascending)",
				useCase: "Practice words you haven't revised much",
			},
			{
				type: "most_difficult",
				description: "Words sorted by most difficult (most opened)",
				useCase: "Focus on challenging words you open frequently",
			},
			{
				type: "normal",
				description:
					"Words sorted in normal sequence (revised count ascending)",
				useCase: "Default learning sequence",
			},
			{
				type: "most_revised",
				description: "Words sorted by most revised (descending)",
				useCase: "Review words you've practiced the most",
			},
			{
				type: "least_opened",
				description: "Words sorted by least opened (easiest words)",
				useCase: "Start with easier, less frequently accessed words",
			},
			{
				type: "newest_first",
				description: "Words sorted by newest first",
				useCase: "Focus on recently added vocabulary",
			},
			{
				type: "oldest_first",
				description: "Words sorted by oldest first",
				useCase: "Review foundational vocabulary",
			},
			{
				type: "alphabetical",
				description: "Words sorted alphabetically (A to Z)",
				useCase: "Systematic alphabetical learning",
			},
			{
				type: "reverse_alphabetical",
				description: "Words sorted reverse alphabetically (Z to A)",
				useCase: "Reverse alphabetical learning",
			},
		];

		res.status(200).json({
			success: true,
			message: "Available word sorting types",
			data: {
				totalTypes: sortingTypes.length,
				sortingTypes,
			},
		});
	} catch (error) {
		console.error("Error fetching sorting types:", error);
		res.status(500).json({
			success: false,
			message: "Failed to fetch sorting types",
		});
	}
});

// Utility function to create a delay
// const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// //to update all the words just in case
// app.put("/api/v1/updateWordsWithMnemonics", async (req, res) => {
// 	console.log("Got the request ? ");
// 	try {
// 		const allWords = await Word.find({});
// 		if (!allWords || allWords.length === 0) {
// 			return res
// 				.status(404)
// 				.json({ message: "No words found in the database." });
// 		}

// 		// Filter words missing mnemonic or breakdown
// 		// const wordsToProcess = allWords.filter(
// 		// 	(word) =>
// 		// 		!word.mnemonic ||
// 		// 		word.mnemonic === "" ||
// 		// 		!word.breakdown ||
// 		// 		word.breakdown === ""
// 		// );

// 		// if (wordsToProcess.length === 0) {
// 		// 	return res.status(200).json({
// 		// 		message: "All words already have mnemonic and breakdown.",
// 		// 		updatedWords: [],
// 		// 	});
// 		// }

// 		const BATCH_SIZE = 30; // Adjust depending on your AI token limits
// 		const updatedWords = [];

// 		for (let i = 0; i < allWords.length; i += BATCH_SIZE) {
// 			const batch = allWords.slice(i, i + BATCH_SIZE);
// 			const wordsArray = batch.map((w) => w.word);
// 			console.log("The words array is : ");
// 			console.log(wordsArray);

// 			const prompt = `You are Lexi, a world-renowned memory artist and narrative linguist. You believe that words are not just definitions; they are stories, feelings, and images waiting to be unlocked. Your singular talent is forging unforgettable mnemonics that are miniature works of art—clever, surprising, and deeply resonant.

// Your core philosophy is **Word-First Recall**: the most powerful mnemonic is found *within the sounds of the word itself*. The goal is for someone to see the word, instantly recall its phonetic hook, and remember the meaning without imagining a complex external scene.

// Your task is to analyze the list of English words provided and, for each one, generate a single JSON object that strictly follows the "Lexi Method."

// JSON Object Structure:
//  {
//    "word": "<the word>",
//    "pronunciation": "<phonetic IPA pronunciation> | <simple phonetic pronunciation, e.g., fuh·neh·tuhk>",
//    "meaning": [
//      { "meaning": "<first meaning (max 10 words)>", "example": "<clear example sentence using the word>" },
//      { "meaning": "<second meaning if available>", "example": "<clear example sentence using the word>" }
//    ],
//    "origin": "<short, clear origin like 'Latin', 'Greek', with 1-sentence explanation>",
//    "relate_with": "<A simple, direct feeling or idea linked to the word's meaning.>",
//    "mnemonic": "<A high-impact mnemonic built by deconstructing the word's sounds into a defining phrase.>",
//    "breakdown": "<A simple, clear explanation of how the mnemonic's phonetic parts create the word's meaning.>",
//    "synonyms": ["<synonym1>", "<synonym2>", "<synonym3>"],
//    "antonyms": ["<antonym1>", "<antonym2>", "<antonym3>"]
//  }

//  ### CRITICAL INSTRUCTIONS: THE LEXI METHOD

//  You MUST build your mnemonic using the **Core Principles of Word-First Recall**. This means you will deconstruct the word into sound-alike fragments that form a new phrase defining the word.

//  * **Principle 1: Sound-Alike Decomposition.** Break the target word into phonetic chunks that sound like simpler, common English words.
//  * **Principle 2: The Defining Phrase.** Combine these sound-alike chunks into a very short, memorable phrase or "equation" that directly explains or demonstrates the word's meaning.
//  * **Principle 3: Direct Link, No Detours.** The mnemonic **must** come from the word's sound. Avoid creating external stories, metaphorical objects, or complex scenarios that are not directly suggested by the word's phonetics.

//  **Example of the Method in Action:**

// * **Word:** Insidious
// * **Weak Mnemonic:** "He's a villain who lives *in the city*." (This is an external story, not based on the word's sound).
// * **LEXI METHOD:** \`It hides **INSIDE** and is **HIDEOUS**.\`

//  **Breakdown Must Justify the Mnemonic:**
//  Your \`breakdown\` must clearly explain how the sound-alike parts in your mnemonic logically connect to the word's definition.
// * **Example Breakdown for Insidious:** "The mnemonic breaks the word into two core ideas: \`Inside\` points to its hidden, subtle, and sneaky nature. \`Hideous\` points to its truly ugly and harmful result. Together, they define something that is harmful in a subtle way."

//  **Language & Tone:**
//  Maintain a simple, direct, and encouraging tone. Your creativity should shine through the cleverness of the phonetic links, not through complex vocabulary.

//  **Final Output Format:**
//  Return **ONLY a single, valid JSON array**. Do **NOT** include any introductory text or explanations. Your entire response must start with \`[\` and end with \`]\`.

// Here is the list of words:
// ${wordsArray.join(", ")}`;

// 			try {
// 				const response = await talkWithAI(prompt);
// 				console.log("The responsed array of words from the ai is : ");
// 				console.log(response);

// 				const enrichedWords = cleanAndConvertJsonString(response);

// 				for (const enrichedWord of enrichedWords) {
// 					// Update the word by finding case-insensitively
// 					await Word.findOneAndUpdate(
// 						{ word: { $regex: new RegExp(`^${enrichedWord.word}$`, "i") } },
// 						{
// 							pronunciation: enrichedWord.pronunciation,
// 							meaning: enrichedWord.meaning,
// 							origin: enrichedWord.origin,
// 							relate_with: enrichedWord.relate_with,
// 							synonyms: enrichedWord.synonyms,
// 							antonyms: enrichedWord.antonyms,
// 							mnemonic: enrichedWord.mnemonic,
// 							breakdown: enrichedWord.breakdown,
// 						},
// 						{ new: true }
// 					);
// 					updatedWords.push(enrichedWord.word);
// 					console.log(
// 						`${updatedWords.length} words updated with mnemonic and breakdown.`
// 					);
// 				}
// 				// Add 2-minute delay after each batch (120,000 ms)
// 				if (i + BATCH_SIZE < allWords.length) {
// 					console.log("Waiting 5 minutes before processing next batch...");
// 					await delay(300000);
// 				}
// 			} catch (error) {
// 				console.error("Error updating batch:", error);
// 				// Continue to next batch instead of stopping everything
// 			}
// 		}

// 		res.status(200).json({
// 			message: `${updatedWords.length} words updated with mnemonic and breakdown.`,
// 			updatedWords,
// 		});
// 	} catch (error) {
// 		console.error(error);
// 		res
// 			.status(500)
// 			.json({ message: "Failed to update words", error: error.message });
// 	}
// });

// function cleanAndConvertJsonString(jsonString) {
// 	try {
// 		// Remove triple backticks and 'json' marker
// 		const cleanedString = jsonString
// 			.trim()
// 			.replace(/^```json\s*/i, "") // remove ```json at start
// 			.replace(/```$/i, "") // remove ``` at end
// 			.trim();

// 		const parsed = JSON.parse(cleanedString);

// 		if (Array.isArray(parsed)) {
// 			console.log("✅ Successfully converted to array of objects!");
// 			return parsed;
// 		} else {
// 			console.error("⚠ Parsed JSON is not an array.");
// 			return [];
// 		}
// 	} catch (error) {
// 		console.error("❌ Failed to parse JSON string:", error.message);
// 		return [];
// 	}
// }

// 4️⃣ (Optional) DELETE all words — useful for admin cleanup
// app.delete("/words", async (req, res) => {
// 	try {
// 		await Word.deleteMany({});
// 		res.json({ message: "All words deleted" });
// 	} catch (error) {
// 		console.error(error);
// 		res
// 			.status(500)
// 			.json({ message: "Failed to delete words", error: error.message });
// 	}
// });
