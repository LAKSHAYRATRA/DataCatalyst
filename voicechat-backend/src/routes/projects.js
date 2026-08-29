import { Router } from "express";
import { requireAuth } from "../auth.js";
import { getProjects, getRecommendedProjects, updateProjectRates } from "../controllers/projectController.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

const router = Router();

const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
  next();
};

// Recommended & Boosted projects (Available for dashboard)
router.get("/recommended", getRecommendedProjects);

// Both contributors and admins need to see projects
router.get("/", requireAuth(JWT_SECRET), getProjects);

// Only admins can update rates
router.put("/:id/rates", requireAuth(JWT_SECRET), requireAdmin, updateProjectRates);

export default router;
