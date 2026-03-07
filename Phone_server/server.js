const express = require("express");
const app = express();
const port = 3000;
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const twilio = require("twilio");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");
const fileUpload = require("express-fileupload");
const Agenda = require("agenda");

require("dotenv").config();

// Models
const User = require("./models/User");
const Contact = require("./models/Contact");

// Twilio setup
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

// Agenda setup for background jobs
const agenda = new Agenda({
  db: {
    address: process.env.MONGO_URI,
    collection: "jobs",
  },
});

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3001",
      process.env.FRONTEND_URL,
    ],
    credentials: true,
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
  }),
);
app.use(express.json());
app.use(fileUpload());

// serve static images from the Image folder so Twilio can fetch them for MMS
app.use("/images", express.static(path.join(__dirname, "Image")));

// ==================== AUTH MIDDLEWARE ====================
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret_key");
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
};


// health check route
app.get("/ping", (req, res) => {
  res.status(200).json({ status: "alive" });
});

// ==================== AUTH ROUTES ====================
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "Missing required fields" });

    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ error: "User already exists" });

    const user = await User.create({ name, email, password });

    // use process.env.JWT_SECRET at sign time
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    );
    res.json({
      success: true,
      user: { id: user._id, name: user.name, email: user.email },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || "secret_key",
      { expiresIn: "30d" },
    );
    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// ==================== CRM ROUTES ====================
app.get("/crm/:userId", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.id !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const contacts = await Contact.find({ userId });
    res.json(contacts);
  } catch (err) {
    console.error("Error fetching CRM:", err);
    res.status(500).json({ error: "Error fetching CRM data" });
  }
});

function normalizePhoneNumber(phone) {
  if (!phone) return null;

  let digits = String(phone).replace(/\D/g, "");

  // If 11 digits and starts with 1 → valid US
  if (digits.length === 11 && digits.startsWith("1")) {
    return "+" + digits;
  }

  // If 10 digits → assume US and prepend 1
  if (digits.length === 10) {
    return "+1" + digits;
  }

  // If more than 11 digits but ends with valid 10 digits
  if (digits.length > 11) {
    digits = digits.slice(-10);
    return "+1" + digits;
  }

  return null;
}

app.post("/crm-upload", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.files.file;
    const workBook = xlsx.read(file.data, { type: "buffer" });
    const sheetName = workBook.SheetNames[0];
    const sheet = workBook.Sheets[sheetName];
    let data = xlsx.utils.sheet_to_json(sheet);

    if (!data.length) {
      return res.status(400).json({ error: "File is empty" });
    }

    const REQUIRED_FIELDS = ["Phone Number"];
    const allColumns = Object.keys(data[0] || {});
    console.log("COLUMNS FROM FILE:", allColumns);

    const missingRequired = REQUIRED_FIELDS.filter(
      (field) => !allColumns.includes(field)
    );

    if (missingRequired.length > 0) {
      return res.status(400).json({
        error: `Invalid file: missing required columns: ${missingRequired.join(
          ", "
        )}`,
      });
    }

    let skippedRows = [];

    // 🔥 Normalize + Skip Invalid
    data = data
      .map((row, idx) => {
        const rawPhone = row["Phone Number"];
        const phoneValue = normalizePhoneNumber(rawPhone);

        if (!phoneValue) {
          skippedRows.push(idx + 2); // Excel row number
          return null;
        }

        return {
          PhoneNumber: phoneValue,
        };
      })
      .filter(Boolean); // remove nulls

    // 🔥 Deduplicate within upload
    const seen = new Set();
    data = data.filter((row) => {
      const key = row.PhoneNumber;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 🔥 Optional: Prevent duplicates already in DB
    const existingNumbers = await Contact.find({
      userId,
      PhoneNumber: { $in: data.map((d) => d.PhoneNumber) },
    }).select("PhoneNumber");

    const existingSet = new Set(existingNumbers.map((c) => c.PhoneNumber));

    const contactsToInsert = data
      .filter((row) => !existingSet.has(row.PhoneNumber))
      .map((row) => ({
        userId,
        ...row,
      }));

    if (contactsToInsert.length > 0) {
      await Contact.insertMany(contactsToInsert);
    }

    console.log(`✅ Inserted ${contactsToInsert.length}`);
    console.log(`⏭ Skipped ${skippedRows.length}`);

    res.json({
      success: true,
      inserted: contactsToInsert.length,
      skippedInvalid: skippedRows.length,
      skippedDuplicates: existingSet.size,
    });
  } catch (error) {
    console.error("❌ Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

app.post("/crm-add", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { contacts } = req.body;

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: "Missing contacts array" });
    }

    const contactsToInsert = contacts
      .map(({ _unsaved, ...row }) => {
        const normalized = normalizePhoneNumber(row.PhoneNumber);
        if (!normalized) return null;

        return {
          userId,
          ...row,
          PhoneNumber: normalized,
        };
      })
      .filter(Boolean);

    await Contact.insertMany(contactsToInsert);
    res.json({ success: true, count: contactsToInsert.length });
  } catch (error) {
    console.error("Error adding contacts:", error);
    res.status(500).json({ error: "Failed to add contacts" });
  }
});

app.delete("/crm", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await Contact.deleteMany({ userId });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting CRM:", err);
    res.status(500).json({ error: "Failed to delete contacts" });
  }
});

app.delete("/crm/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.id;
    const deleted = await Contact.findOneAndDelete({ _id: contactId, userId });

    if (!deleted) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting contact:", err);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

app.patch("/crm/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.id;
    const update = req.body || {};

    const updated = await Contact.findOneAndUpdate(
      { _id: contactId, userId },
      { $set: update },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json({ success: true, contact: updated });
  } catch (err) {
    console.error("Error updating contact:", err);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

// ==================== SEND BATCH SMS ====================

app.post("/send-batch-sms", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    // Fetch all contacts for this user
    const contacts = await Contact.find({ userId });

    if (contacts.length === 0) {
      return res.status(400).json({ error: "No contacts to send to" });
    }

    // determine which media URL should be sent
    const resolvedMediaUrl = `${process.env.SERVER_URL || "http://localhost:" + port}/images/Nelson.jpg`;

    // Queue the send job
    await agenda.schedule("now", "send-sms-batch", {
      userId,
      message,
      contactIds: contacts.map((c) => c._id.toString()),
      mediaUrl: resolvedMediaUrl,
    });

    res.json({
      success: true,
      message: `✅ Message queued for sending to ${contacts.length} contacts. You can close this page.`,
    });
  } catch (error) {
    console.error("❌ Error queuing SMS:", error);
    res.status(500).json({ error: "Failed to queue SMS" });
  }
});

app.post("/sms-webhook", async (req, res) => {
  try {
    const incomingMessage = (req.body.Body || "").trim().toLowerCase();
    const fromNumber = req.body.From;

    const stopKeywords = [
      "stop",
      "stopall",
      "unsubscribe",
      "cancel",
      "end",
      "quit",
    ];
    const startKeywords = ["start", "unstop"];

    const contact = await Contact.findOne({ PhoneNumber: fromNumber });

    if (!contact) {
      return res.sendStatus(200);
    }

    // Handle STOP
    if (stopKeywords.includes(incomingMessage)) {
      contact.optedOut = true;
      contact.optedOutAt = new Date();
      await contact.save();

      console.log(`🚫 ${fromNumber} opted out`);
    }

    // Handle START / UNSTOP
    if (startKeywords.includes(incomingMessage)) {
      contact.optedOut = false;
      contact.optedOutAt = null;
      await contact.save();

      console.log(`✅ ${fromNumber} opted back in`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// ==================== DATABASE CONNECTION ====================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ==================== BATCH SENDING CONFIGURATION ====================
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 100; // messages per batch
const BATCH_DELAY_MS = process.env.BATCH_DELAY_MS ? parseInt(process.env.BATCH_DELAY_MS) : 2000; // delay between batches (ms)

// Helper function to send messages in batches with delays
async function sendMessagesInBatches(contacts, message, now) {
  let sent = 0;
  let skipped = 0;

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(contacts.length / BATCH_SIZE);

    console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} contacts)`);

    for (const contact of batch) {
      if (contact.optedOut) {
        skipped++;
        console.log(`🚫 ${contact.PhoneNumber} has opted out`);
        continue;
      }

      if (!contact.PhoneNumber) {
        skipped++;
        continue; // Skip if no phone number
      }

      // Check if contact can receive (rate limiting)
      if (contact.lastSentMessage) {
        const timeSinceLastMessage = now - new Date(contact.lastSentMessage);
        if (timeSinceLastMessage < ONE_WEEK_MS) {
          skipped++;
          console.log(`⏸️ ${contact.PhoneNumber} is rate limited`);
          continue;
        }
      }

      try {
        await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_NUMBER,
          to: contact.PhoneNumber,
          // use URL supplied by job (or fall back to env/static path)
          mediaUrl: [
            // should always be provided by job, but fallback just in case
            `${process.env.SERVER_URL || "http://localhost:" + port}/images/Nelson.jpg`,
          ],
        });

        // Update lastSentMessage timestamp
        await Contact.findByIdAndUpdate(contact._id, {
          lastSentMessage: now,
        });

        sent++;
        console.log(`✅ SMS sent to ${contact.PhoneNumber}`);
      } catch (err) {
        console.error(
          `❌ Failed to send SMS to ${contact.PhoneNumber}:`,
          err.message,
        );
      }
    }

    // Add delay between batches (except after the last batch)
    if (i + BATCH_SIZE < contacts.length) {
      console.log(`⏱️  Waiting ${BATCH_DELAY_MS}ms before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return { sent, skipped };
}

// ==================== AGENDA JOB DEFINITION ====================
agenda.define("send-sms-batch", async (job) => {
  const { userId, message, contactIds, mediaUrl } = job.attrs.data;

  try {
    const contacts = await Contact.find({ _id: { $in: contactIds } });

    if (contacts.length === 0) {
      console.log("❌ No contacts found for batch send");
      return;
    }

    const now = new Date();
    console.log(`🚀 Starting batch send to ${contacts.length} contacts with batch size ${BATCH_SIZE}`);

    const { sent, skipped } = await sendMessagesInBatches(contacts, message, now);

    console.log(
      `📊 Job completed: Sent ${sent}, Skipped ${skipped} out of ${contacts.length}`,
    );
  } catch (error) {
    console.error("❌ Error in send-sms-batch job:", error);
    throw error;
  }
});

// ==================== START AGENDA ====================
(async () => {
  await agenda.start();
  console.log("🔄 Agenda started - Background jobs enabled");
})();

// ==================== SERVER STARTUP ====================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: err?.message || "Server error" });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await agenda.stop();
  process.exit(0);
});
