const mongoose = require("mongoose");

const WordSchema = new mongoose.Schema(
	{
		word: {
			type: String,
			required: true,
		},
		pronunciation: {
			type: String,
		},
		meaning: [
			{
				meaning: {
					type: String,
				},
				example: {
					type: String,
				},
			},
		],
		synonyms: [
			{
				type: String,
			},
		],
		antonyms: [
			{
				type: String,
			},
		],
		origin: {
			type: String,
		},
		relate_with: {
			type: String,
		},
	},
	{ timestamps: true, collection: "Words" }
);

module.exports = mongoose.model("Word", WordSchema);
