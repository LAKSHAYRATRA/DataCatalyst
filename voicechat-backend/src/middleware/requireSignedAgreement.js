import { AGREEMENT_VERSION } from "../services/agreementPdf.js";

export function requireSignedAgreement(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const ca = req.user.contributorAgreement;
  if (!ca || ca.signed !== true) {
    return res.status(403).json({ error: "agreement_not_signed" });
  }
  if (ca.agreementVersion !== AGREEMENT_VERSION) {
    return res.status(403).json({
      error: "agreement_version_outdated",
      currentVersion: AGREEMENT_VERSION,
    });
  }
  if (ca.adminReviewStatus !== "approved") {
    return res.status(403).json({
      error: "agreement_pending_admin_review",
      status: ca.adminReviewStatus || "pending",
    });
  }
  next();
}
