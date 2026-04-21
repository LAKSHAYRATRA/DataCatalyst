import { User } from "../models/User.js";

// Middleware to check if user is admin
export async function isAdmin(req, res, next) {
    if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        if (!user.isAdmin) {
            return res.status(403).json({ error: "Forbidden: Admin access required" });
        }

        req.user = user; // Attach user to request for use in routes if needed
        next();
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
}
