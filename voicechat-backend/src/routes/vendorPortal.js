import express from "express";
import { requireVendorAuth } from "../auth.js";
import {
  vendorLogin,
  vendorLogout,
  getVendorMe,
  getVendorCommunity,
  getVendorProjects,
  getProjectSquadSummary,
  getVendorQualityInsights,
  updateVendorPayoutSettings,
  createVendorUser,
  createStudioArtist,
  getAllocatedProjects,
  getArtistPayrates,
  getArtistAnalytics,
  updateArtistPayrate,
  updateArtistPayrates,
  signVendorAgreement,
  getVendorAgreementPdf,
  getVendorPayouts
} from "../controllers/vendorController.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Public vendor login & logout
router.post("/login", vendorLogin);
router.post("/logout", vendorLogout);

// Protected vendor portal endpoints
router.get("/me", requireVendorAuth(JWT_SECRET), getVendorMe);
router.get("/community", requireVendorAuth(JWT_SECRET), getVendorCommunity);
router.get("/projects", requireVendorAuth(JWT_SECRET), getVendorProjects);
router.get("/projects/:subprojectId/squad-summary", requireVendorAuth(JWT_SECRET), getProjectSquadSummary);
router.get("/quality-insights", requireVendorAuth(JWT_SECRET), getVendorQualityInsights);
router.get("/allocated-projects", requireVendorAuth(JWT_SECRET), getAllocatedProjects);
router.get("/payouts", requireVendorAuth(JWT_SECRET), getVendorPayouts);
router.put("/payout-settings", requireVendorAuth(JWT_SECRET), updateVendorPayoutSettings);

// Partner Master Agreement endpoints
router.post("/sign-agreement", requireVendorAuth(JWT_SECRET), signVendorAgreement);
router.get("/agreement-pdf", requireVendorAuth(JWT_SECRET), getVendorAgreementPdf);

// Vendor-initiated contributor / artist account creation
router.post("/users", requireVendorAuth(JWT_SECRET), createVendorUser);
router.post("/artists", requireVendorAuth(JWT_SECRET), createVendorUser);
router.get("/artists/:artistId/payrates", requireVendorAuth(JWT_SECRET), getArtistPayrates);
router.get("/artists/:artistId/analytics", requireVendorAuth(JWT_SECRET), getArtistAnalytics);
router.put("/artists/:artistId/payrates", requireVendorAuth(JWT_SECRET), updateArtistPayrates);
router.put("/artists/:artistId/payrate", requireVendorAuth(JWT_SECRET), updateArtistPayrates);

export default router;
