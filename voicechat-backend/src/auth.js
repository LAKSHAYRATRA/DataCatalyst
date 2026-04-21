import jwt from "jsonwebtoken";
import { User } from "./models/User.js";

export function signToken({ userId, tokenVersion }, jwtSecret) {
  return jwt.sign({ sub: userId, tokenVersion }, jwtSecret, { expiresIn: "30d" });
}

export function verifyToken(token, jwtSecret) {
  return jwt.verify(token, jwtSecret);
}

export function requireAuth(jwtSecret) {

  return async (req, res, next) => {
    // Try to get token from cookie first
    let token = req.cookies?.vc_token;

    // Fallback to Authorization header for backward compatibility
    if (!token) {
      const header = req.headers.authorization || "";
      const [kind, headerToken] = header.split(" ");

      if (kind === "Bearer" && headerToken) {
        token = headerToken;
      }
    }

    if (!token) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      const payload = verifyToken(token, jwtSecret);

      // Verify token version for single session enforcement
      const user = await User.findById(payload.sub);
      if (!user) {
        return res.status(401).json({ error: "unauthorized" });
      }

      // If token has version, it must match user's version
      if (payload.tokenVersion !== undefined && user.tokenVersion !== payload.tokenVersion) {
        return res.status(401).json({ error: "session_expired" });
      }

      req.userId = payload.sub;
      req.user = user; // Attach full user object for convenience
      next();
    } catch (e) {
      res.status(401).json({ error: "unauthorized" });
    }
  };
}
