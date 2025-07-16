const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Word = require("./model/Word");
const cors = require("cors");
const http = require("http");

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

// Utility function to create a delay
// const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

//to update all the words just in case
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
// 		const wordsToProcess = allWords.filter(
// 			(word) =>
// 				!word.mnemonic ||
// 				word.mnemonic === "" ||
// 				!word.breakdown ||
// 				word.breakdown === ""
// 		);

// 		if (wordsToProcess.length === 0) {
// 			return res.status(200).json({
// 				message: "All words already have mnemonic and breakdown.",
// 				updatedWords: [],
// 			});
// 		}

// 		const BATCH_SIZE = 20; // Adjust depending on your AI token limits
// 		const updatedWords = [];

// 		for (let i = 0; i < wordsToProcess.length; i += BATCH_SIZE) {
// 			const batch = wordsToProcess.slice(i, i + BATCH_SIZE);
// 			const wordsArray = batch.map((w) => w.word);
// 			console.log("The words array is : ");
// 			console.log(wordsArray);

// 			const prompt = `You are an expert English language assistant.

// I will give you a list of English words.

// For each word, return a JSON object with these exact fields:
// {
//   "word": "<the word>",
//   "pronunciation": "<phonetic IPA pronunciation> | <simple phonetic pronunciation, e.g., uhn·taylz>",
//   "meaning": [
//     { "meaning": "<first meaning (max 10 words)>", "example": "<clear example sentence using the word>" },
//     { "meaning": "<second meaning if available>", "example": "<clear example sentence using the word>" }
//   ],
//   "origin": "<short, clear origin like 'Latin', 'Greek', with 1-sentence explanation>",
//   "relate_with": "<a simple mental image, feeling, or situation to help remember this word>",
//   "mnemonic": "<a super short, clever, and highly memorable phrase or sound-alike trick that directly hints at the word's meaning. It should be instantly recalled and directly connect to what the word means. Prioritize creative acronyms or vivid sound-alikes that make the meaning 'click'. Avoid simple, technical splits like 'PRE + JUDGE'. For example: 'Ubiquitous: U B Quick To See It Everywhere.' (means found everywhere). 'Ephemeral: Every Photo Eventually Melts Away, Really A Little.' (means short-lived). 'Cacophony: Cats And Cows Often Fight, Oh No! Yikes!' (means loud, messy noise).>",
//   "breakdown": "<a simple, vivid, story-based, or visual explanation that directly clarifies how the 'mnemonic' helps remember the word's meaning. Explain the connection between the mnemonic's parts and the word's definition. For example: 'For Ubiquitous (U B Quick To See It Everywhere): This mnemonic uses the sound of 'U B Quick' to remind you of 'ubiquitous' and then tells you that something 'everywhere' is quick to see, linking the sound to the meaning.' 'For Ephemeral (Every Photo Eventually Melts Away, Really A Little): This mnemonic starts with 'Every Photo' (EP) to sound like 'ephemeral' and then uses the idea of photos 'melting away' quickly to show it means lasting only a very short time.' 'For Cacophony (Cats And Cows Often Fight, Oh No! Yikes!): This mnemonic uses the first sounds 'Ca-Co' to remind you of 'cacophony' and then paints a picture of fighting cats and cows, making a very loud, messy noise.'>",
//   "synonyms": ["<synonym1>", "<synonym2>", "<synonym3>"],
//   "antonyms": ["<antonym1>", "<antonym2>", "<antonym3>"]
// }

// Important instructions:
// ✅ Always give at least one meaning & example.
// ✅ If there are multiple common meanings, provide them (up to 2).
// ✅ Use **clear, simple, child-friendly English** throughout.
// ✅ For "mnemonic", prioritize:
//   - **Creative, meaning-rich acronyms or phrases** using the letters.
//   - **Sound-alike tricks** that directly hint at the meaning.
//   - The mnemonic must be **instantly helpful for recall** and not just a mechanical split or addition. It should make the meaning 'click'.
//   - Make it instantly memorable and intuitive for recall, avoiding complex or technical breakdowns.
//   - Ensure it directly reflects the meaning with a vivid image or action.
// ✅ For "breakdown", give a **visual, story-based, or situation-based memory hook** in plain English. This must directly explain how the *mnemonic* helps remember the word's meaning.
// ✅ For "pronunciation", provide both the **IPA** and a **simple, easy-to-read phonetic spelling** (using standard English letters and dots for syllables).
// ✅ Use common, simple English words for synonyms and antonyms if available.
// ✅ Return **only** a **valid JSON array** with no extra explanation.

// Here is the list of words:
// ${wordsArray.join(", ")}`;

// 			try {
// 				const response = await talkWithAI(prompt);
// 				console.log("The responsed array of words from the ai is : ");
// 				console.log(response.text);

// 				const enrichedWords = cleanAndConvertJsonString(response.text);

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
