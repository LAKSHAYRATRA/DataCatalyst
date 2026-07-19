import express from "express";
import crypto from "crypto";
import { requireAuth } from "../auth.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const TURN_SECRET = process.env.TURN_STATIC_AUTH_SECRET;
const TURN_HOST = process.env.TURN_HOST;
const TURN_TTL_SECONDS = 5 * 60;

const STUN_ONLY = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

router.get("/credentials", requireAuth(JWT_SECRET), (req, res) => {
  if (!TURN_SECRET || !TURN_HOST) {
    return res.json({ iceServers: STUN_ONLY, ttl: TURN_TTL_SECONDS });
  }

  const unixExpiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  const username = `${unixExpiry}:${req.user._id}`;
  const credential = crypto
    .createHmac("sha1", TURN_SECRET)
    .update(username)
    .digest("base64");

  res.json({
    iceServers: [
      ...STUN_ONLY,
      {
        urls: [
          `turn:${TURN_HOST}?transport=udp`,
          `turn:${TURN_HOST}?transport=tcp`,
        ],
        username,
        credential,
      },
    ],
    ttl: TURN_TTL_SECONDS,
  });
});

export default router;
