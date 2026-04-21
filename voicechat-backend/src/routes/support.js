import express from "express";
import SupportTicket from "../models/SupportTicket.js";

const router = express.Router();

// Submit a support ticket
router.post("/", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const newTicket = new SupportTicket({
      name,
      email,
      subject,
      message,
    });

    await newTicket.save();

    res.status(201).json({
      success: true,
      message: "Support ticket submitted successfully. We will get back to you soon!",
      ticket: newTicket,
    });
  } catch (error) {
    console.error("Support submission error:", error);
    res.status(500).json({ error: "Internal server error. Please try again later." });
  }
});

export default router;
