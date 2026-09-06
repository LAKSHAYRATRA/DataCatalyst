import express from "express";
import { requireAuth } from "../auth.js";
import { isAdmin } from "../middleware/isAdmin.js";
import {
  getSubprojectsCatalog,
  getAllVendorsAdmin,
  createVendorAdmin,
  getVendorByIdAdmin,
  updateVendorAdmin,
  updateVendorPasswordAdmin,
  updateVendorAssignmentsAdmin,
  deleteVendorAdmin,
  suspendVendorAdmin,
  reactivateVendorAdmin,
  getVendorAgreementPdfAdmin,
  getVendorAnalyticsAdmin,
  recordVendorPayoutAdmin,
  getVendorPayoutsAdmin,
  deleteVendorPayoutAdmin
} from "../controllers/vendorController.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Catalog of available subprojects across Call, Scripted Call, and Phrases
router.get("/catalog", requireAuth(JWT_SECRET), isAdmin, getSubprojectsCatalog);

// List all vendors with metrics
router.get("/", requireAuth(JWT_SECRET), isAdmin, getAllVendorsAdmin);

// Create a new vendor
router.post("/", requireAuth(JWT_SECRET), isAdmin, createVendorAdmin);

// Get vendor by ID with community roster
router.get("/:id", requireAuth(JWT_SECRET), isAdmin, getVendorByIdAdmin);

// Get deep hierarchical analytics (Projects -> Languages -> Contributors with approval/rejection rates)
router.get("/:id/analytics", requireAuth(JWT_SECRET), isAdmin, getVendorAnalyticsAdmin);

// Vendor Payouts recording and history
router.get("/:id/payouts", requireAuth(JWT_SECRET), isAdmin, getVendorPayoutsAdmin);
router.post("/:id/payouts", requireAuth(JWT_SECRET), isAdmin, recordVendorPayoutAdmin);
router.delete("/:id/payouts/:payoutId", requireAuth(JWT_SECRET), isAdmin, deleteVendorPayoutAdmin);

// Download vendor signed agreement PDF
router.get("/:id/agreement-pdf", requireAuth(JWT_SECRET), isAdmin, getVendorAgreementPdfAdmin);

// Update vendor profile and status
router.put("/:id", requireAuth(JWT_SECRET), isAdmin, updateVendorAdmin);

// Update vendor account password directly
router.patch("/:id/password", requireAuth(JWT_SECRET), isAdmin, updateVendorPasswordAdmin);

// Suspend vendor account and release contributors to normal community status
router.post("/:id/suspend", requireAuth(JWT_SECRET), isAdmin, suspendVendorAdmin);

// Reactivate suspended vendor account
router.post("/:id/reactivate", requireAuth(JWT_SECRET), isAdmin, reactivateVendorAdmin);

// Update vendor project assignments and quality margins
router.put("/:id/assignments", requireAuth(JWT_SECRET), isAdmin, updateVendorAssignmentsAdmin);

// Delete or deactivate vendor
router.delete("/:id", requireAuth(JWT_SECRET), isAdmin, deleteVendorAdmin);

export default router;
