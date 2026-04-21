import { User } from "../models/User.js";

/** Allows both admins and QA users */
export async function isAdminOrQA(req, res, next) {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(401).json({ error: "User not found" });
        if (!user.isAdmin && !user.isQA)
            return res.status(403).json({ error: "Forbidden: Admin or QA access required" });
        req.user = user;
        next();
    } catch {
        res.status(500).json({ error: "Internal server error" });
    }
}

/** Allows only admins (not QA users) */
export async function isAdminOnly(req, res, next) {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(401).json({ error: "User not found" });
        if (!user.isAdmin)
            return res.status(403).json({ error: "Forbidden: Admin access required" });
        req.user = user;
        next();
    } catch {
        res.status(500).json({ error: "Internal server error" });
    }
}
