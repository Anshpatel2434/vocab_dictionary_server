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
				no_of_times_opened: -1, // 1 = descending (most to least)
				_id: -1, // Secondary sort by ID for consistent ordering
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
