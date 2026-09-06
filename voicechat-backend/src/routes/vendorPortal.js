import express from "express";
import { requireVendorAuth } from "../auth.js";
import {
  vendorLogin,
  getVendorMe,
  getVendorCommunity,
  getVendorProjects,
  getVendorQualityInsights,
  updateVendorPayoutSettings,
  createVendorUser,
  createStudioArtist,
  updateArtistPayrate
} from "../controllers/vendorController.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Public vendor login
router.post("/login", vendorLogin);

// Protected vendor portal endpoints
router.get("/me", requireVendorAuth(JWT_SECRET), getVendorMe);
router.get("/community", requireVendorAuth(JWT_SECRET), getVendorCommunity);
router.get("/projects", requireVendorAuth(JWT_SECRET), getVendorProjects);
router.get("/quality-insights", requireVendorAuth(JWT_SECRET), getVendorQualityInsights);
router.put("/payout-settings", requireVendorAuth(JWT_SECRET), updateVendorPayoutSettings);

// Vendor-initiated contributor / artist account creation
router.post("/users", requireVendorAuth(JWT_SECRET), createVendorUser);
router.post("/artists", requireVendorAuth(JWT_SECRET), createVendorUser);
router.put("/artists/:artistId/payrate", requireVendorAuth(JWT_SECRET), updateArtistPayrate);

export default router;
