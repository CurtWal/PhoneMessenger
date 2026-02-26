const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  PhoneNumber: { type: String, required: true },
  lastSentMessage: { type: Date, default: null },
  optedOut: { type: Boolean, default: false },
  optedOutAt: { type: Date, default: null }, 
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Contact", contactSchema);
