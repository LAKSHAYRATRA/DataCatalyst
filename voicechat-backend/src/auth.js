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
    const secret = jwtSecret || process.env.JWT_SECRET;
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

    // Fallback to query parameter token for download links
    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      const payload = verifyToken(token, secret);

      // Verify token version for single session enforcement
      const user = await User.findById(payload.sub);
      if (!user || user.isDeleted || user.status === "blacklisted" || user.isBlacklisted) {
        return res.status(401).json({ success: false, error: "Account deactivated or deleted" });
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

export function optionalAuth(jwtSecret) {
  return async (req, res, next) => {
    const secret = jwtSecret || process.env.JWT_SECRET;
    let token = req.cookies?.vc_token;

    if (!token) {
      const header = req.headers.authorization || "";
      const [kind, headerToken] = header.split(" ");
      if (kind === "Bearer" && headerToken) {
        token = headerToken;
      }
    }

    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return next();
    }

    try {
      const payload = verifyToken(token, secret);
      const user = await User.findById(payload.sub);
      if (user && (payload.tokenVersion === undefined || user.tokenVersion === payload.tokenVersion)) {
        req.userId = payload.sub;
        req.user = user;
      }
    } catch (e) {
      // ignore invalid token for optional auth
    }
    next();
  };
}

export function signVendorToken({ vendorId }, jwtSecret) {
  const secret = jwtSecret || process.env.JWT_SECRET;
  return jwt.sign({ sub: vendorId, role: "vendor" }, secret, { expiresIn: "30d" });
}

export function requireVendorAuth(jwtSecret) {
  return async (req, res, next) => {
    const secret = jwtSecret || process.env.JWT_SECRET;
    let token = null;

    // 1. Prioritize explicit Authorization header (standard for SPA Bearer tokens)
    const header = req.headers.authorization || "";
    const [kind, headerToken] = header.split(" ");
    if (kind === "Bearer" && headerToken) {
      token = headerToken;
    }

    // 2. Fallback to vendor-specific cookie (NEVER fall back to user's vc_token!)
    if (!token && req.cookies?.vc_vendor_token) {
      token = req.cookies.vc_vendor_token;
    }

    // 3. Fallback to query parameter (for direct file downloads/PDF links)
    if (!token && req.query?.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: "unauthorized", message: "No vendor authentication token provided." });
    }

    try {
      const payload = verifyToken(token, secret);

      // Verify payload role if present
      if (payload.role && payload.role !== "vendor") {
        return res.status(401).json({ error: "unauthorized", message: "Invalid token role for vendor portal." });
      }

      const { Vendor } = await import("./models/Vendor.js");
      const vendor = await Vendor.findById(payload.sub);

      if (!vendor) {
        return res.status(401).json({ error: "unauthorized", message: "Vendor account not found or removed." });
      }

      if (vendor.status === "suspended") {
        return res.status(403).json({ error: "forbidden", message: "Vendor account has been suspended." });
      }

      req.vendorId = vendor._id;
      req.vendor = vendor;
      next();
    } catch (e) {
      return res.status(401).json({ error: "unauthorized", message: "Invalid or expired vendor token." });
    }
  };
}

