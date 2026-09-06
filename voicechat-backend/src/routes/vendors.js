import express from "express";
import { requireAuth } from "../auth.js";
import { isAdmin } from "../middleware/isAdmin.js";
import {
  getSubprojectsCatalog,
  getAllVendorsAdmin,
  createVendorAdmin,
  getVendorByIdAdmin,
  updateVendorAdmin,
  updateVendorAssignmentsAdmin,
  deleteVendorAdmin,
  suspendVendorAdmin,
  reactivateVendorAdmin
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

// Update vendor profile and status
router.put("/:id", requireAuth(JWT_SECRET), isAdmin, updateVendorAdmin);

// Suspend vendor account and release contributors to normal community status
router.post("/:id/suspend", requireAuth(JWT_SECRET), isAdmin, suspendVendorAdmin);

// Reactivate suspended vendor account
router.post("/:id/reactivate", requireAuth(JWT_SECRET), isAdmin, reactivateVendorAdmin);

// Update vendor project assignments and quality margins
router.put("/:id/assignments", requireAuth(JWT_SECRET), isAdmin, updateVendorAssignmentsAdmin);

// Delete or deactivate vendor
router.delete("/:id", requireAuth(JWT_SECRET), isAdmin, deleteVendorAdmin);

export default router;
