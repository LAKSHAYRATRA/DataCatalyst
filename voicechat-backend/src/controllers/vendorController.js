import bcrypt from "bcryptjs";
import { Vendor } from "../models/Vendor.js";
import { User } from "../models/User.js";
import { Language } from "../models/Language.js";
import { ScriptedLanguage } from "../models/ScriptedLanguage.js";
import { Company } from "../models/Company.js";
import { Topic } from "../models/Topic.js";
import { ScriptedTopic } from "../models/ScriptedTopic.js";
import { Phrase } from "../models/Phrase.js";
import { PhraseRejection } from "../models/PhraseRejection.js";
import { CallSession } from "../models/CallSession.js";
import { ScriptedSubmission } from "../models/ScriptedSubmission.js";
import { Counter } from "../models/Counter.js";
import { signVendorToken } from "../auth.js";



// ─── HELPER: Project Rates Lookup ($/hr) ──────────────────────────────────────
async function getProjectRatesLookup() {
  const [langs, scriptedLangs, companies] = await Promise.all([
    Language.find({}).select("code hourlyPayout").lean(),
    ScriptedLanguage.find({}).select("code hourlyPayout").lean(),
    Company.find({}).select("_id hourlyPayout").lean()
  ]);

  const callRates = {};
  langs.forEach((l) => {
    if (l.code) callRates[String(l.code).toLowerCase().trim()] = Number(l.hourlyPayout) || 25;
  });

  const scriptedRates = {};
  scriptedLangs.forEach((sl) => {
    if (sl.code) scriptedRates[String(sl.code).toLowerCase().trim()] = Number(sl.hourlyPayout) || 25;
  });

  const phraseRates = {};
  companies.forEach((c) => {
    if (c._id) phraseRates[String(c._id)] = Number(c.hourlyPayout) || 25;
  });

  return { callRates, scriptedRates, phraseRates };
}

// ─── ADMIN: Get Catalog of Available Sub-Projects ─────────────────────────────
export async function getSubprojectsCatalog(req, res) {
  try {
    // 1. Call Subprojects (Languages & Topics)
    const callLangs = await Language.find({ enabled: true }).sort({ name: 1 }).lean();

    const callCatalog = callLangs.map((l) => {
      const payrate = Number(l.hourlyPayout) || 25;
      const defaultBaseRate = Number((payrate * 0.10).toFixed(2));
      return {
        subprojectId: `call_lang_${l.code}`,
        subprojectName: `${l.name} Conversational Calls`,
        category: "call",
        languageCode: l.code,
        languages: [l.code],
        hourlyPayout: Number(l.hourlyPayout) || 0, // Payrate in dollars ($/hr)
        defaultMarginType: "fixed_per_unit",
        defaultBaseRate, // 10% of contributor payrate ($/approved hr)
        unitLabel: "approved hr"
      };
    });

    // 2. Scripted Call Subprojects (Scripted Languages & Scripted Topics)
    const scriptedLangs = await ScriptedLanguage.find({ enabled: true }).sort({ name: 1 }).lean();
    const scriptedCatalog = scriptedLangs.map((sl) => {
      const payrate = Number(sl.hourlyPayout) || 25;
      const defaultBaseRate = Number((payrate * 0.10).toFixed(2));
      return {
        subprojectId: `scripted_lang_${sl.code}`,
        subprojectName: `${sl.name} Scripted Dialogue`,
        category: "scripted_call",
        languageCode: sl.code,
        languages: [sl.code],
        hourlyPayout: Number(sl.hourlyPayout) || 0, // Payrate in dollars ($/hr)
        defaultMarginType: "fixed_per_unit",
        defaultBaseRate, // 10% of contributor payrate ($/approved hr)
        unitLabel: "approved hr"
      };
    });

    // 3. Phrase Subprojects (Companies / Phrase Datasets)
    const companies = await Company.find({ isHidden: { $ne: true } }).sort({ name: 1 }).lean();
    const phraseCatalog = companies.map((c) => {
      const payrate = Number(c.hourlyPayout) || 25;
      const defaultBaseRate = Number((payrate * 0.10).toFixed(2));
      return {
        subprojectId: c._id.toString(),
        subprojectName: c.projectName ? `${c.name} (${c.projectName})` : c.name,
        category: "phrase",
        languageCode: c.languages?.[0] || "",
        languages: c.languages || [],
        hourlyPayout: Number(c.hourlyPayout) || 0, // Payrate in dollars ($/hr)
        defaultMarginType: "fixed_per_unit",
        defaultBaseRate, // 10% of contributor payrate ($/approved hr)
        unitLabel: "approved hr"
      };
    });

    res.json({
      catalog: {
        call: callCatalog,
        scripted_call: scriptedCatalog,
        phrase: phraseCatalog
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch catalog: " + err.message });
  }
}

// ─── ADMIN: List All Vendors with Aggregated Metrics ──────────────────────────
export async function getAllVendorsAdmin(req, res) {
  try {
    const [vendors, ratesLookup] = await Promise.all([
      Vendor.find({}).sort({ createdAt: -1 }).lean(),
      getProjectRatesLookup()
    ]);

    // Calculate aggregated community and performance statistics for each vendor
    const enrichedVendors = await Promise.all(
      vendors.map(async (vendor) => {
        const vendorUsers = await User.find({ vendorId: vendor._id })
          .select("_id perCallPayrate hourlyPhrasePayrate")
          .lean();
        const userIds = vendorUsers.map((u) => u._id);
        const totalWorkers = userIds.length;

        const userPayrateMap = new Map();
        vendorUsers.forEach((u) => {
          const rate = Number(u.hourlyPhrasePayrate || u.perCallPayrate) || 0;
          userPayrateMap.set(String(u._id), rate);
        });

        let totalApprovedPhrases = 0;
        let totalRejectedPhrases = 0;
        let totalApprovedPhraseDurationSec = 0;

        let totalApprovedCalls = 0;
        let totalRejectedCalls = 0;
        let totalApprovedCallDurationSec = 0;

        let totalApprovedScriptedVerses = 0;
        let totalRejectedScriptedVerses = 0;
        let totalApprovedScriptedDurationSec = 0;
        let approvedPhrases = [];
        let approvedCalls = [];
        let scriptedSubmissions = [];

        if (userIds.length > 0) {
          // Phrases stats
          approvedPhrases = await Phrase.find({
            contributorId: { $in: userIds },
            status: "approved"
          }).select("duration companyId contributorId language").lean();
          totalApprovedPhrases = approvedPhrases.length;
          totalApprovedPhraseDurationSec = approvedPhrases.reduce((acc, p) => acc + (p.duration || 0), 0);

          totalRejectedPhrases = await PhraseRejection.countDocuments({
            contributorId: { $in: userIds }
          });

          // Calls stats
          approvedCalls = await CallSession.find({
            $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
            callStatus: "approved",
            callActuallyStarted: true
          }).select("actualCallDuration language userA userB").lean();
          totalApprovedCalls = approvedCalls.length;
          totalApprovedCallDurationSec = approvedCalls.reduce((acc, c) => acc + (c.actualCallDuration || 0), 0);

          totalRejectedCalls = await CallSession.countDocuments({
            $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
            callStatus: "rejected"
          });

          // Scripted submissions stats
          scriptedSubmissions = await ScriptedSubmission.find({
            userId: { $in: userIds }
          }).select("verses language subtopicId userId").lean();

          scriptedSubmissions.forEach((sub) => {
            (sub.verses || []).forEach((v) => {
              if (v.status === "approved") {
                totalApprovedScriptedVerses++;
                totalApprovedScriptedDurationSec += (v.durationSec || 0);
              }
              if (v.status === "rejected") totalRejectedScriptedVerses++;
            });
          });
        }

        const totalApproved = totalApprovedPhrases + totalApprovedCalls + totalApprovedScriptedVerses;
        const totalRejected = totalRejectedPhrases + totalRejectedCalls + totalRejectedScriptedVerses;
        const totalAudited = totalApproved + totalRejected;
        const overallApprovalRate = totalAudited > 0 ? Number(((totalApproved / totalAudited) * 100).toFixed(1)) : 0;

        let estimatedMarginPayable = 0;
        let totalArtistPayout = 0;
        const assignedProjects = vendor.assignedProjects || [];

        if (vendor.isStudio) {
          // ─── STUDIO SPLIT MODEL ─────────────────────────────────────────────
          // Studio Margin = Sum(Approved Hours * max(0, Project Rate - Artist Rate))
          // Artist Payout = Sum(Approved Hours * Artist Rate)
          // Total Paid across Studio + Artist = Sum(Approved Hours * Project Rate)

          // 1. Phrases
          approvedPhrases.forEach((p) => {
            const durHours = (Number(p.duration) || 0) / 3600;
            if (durHours <= 0) return;
            const matchedProj = assignedProjects.find(pr => pr.category === "phrase" && pr.isActive !== false && String(pr.subprojectId) === String(p.companyId));
            if (!matchedProj) return;
            if (matchedProj.assignedLanguages && matchedProj.assignedLanguages.length > 0) {
              const langLower = String(p.language || "").toLowerCase().trim();
              if (!matchedProj.assignedLanguages.map(l => l.toLowerCase().trim()).includes(langLower)) return;
            }
            const projectRate = ratesLookup.phraseRates[String(p.companyId)] || 25;
            const artistRate = userPayrateMap.get(String(p.contributorId)) || 0;
            const studioMarginRate = Math.max(0, projectRate - artistRate);

            estimatedMarginPayable += durHours * studioMarginRate;
            totalArtistPayout += durHours * artistRate;
          });

          // 2. Calls
          approvedCalls.forEach((c) => {
            const durHours = (Number(c.actualCallDuration) || 0) / 3600;
            if (durHours <= 0) return;
            const langKey = String(c.language || "").toLowerCase().trim();
            const projectRate = ratesLookup.callRates[langKey] || 25;

            const idA = String(c.userA?._id || c.userA || "");
            const idB = String(c.userB?._id || c.userB || "");

            if (userPayrateMap.has(idA)) {
              const artistRate = userPayrateMap.get(idA) || 0;
              const studioMarginRate = Math.max(0, projectRate - artistRate);
              estimatedMarginPayable += durHours * studioMarginRate;
              totalArtistPayout += durHours * artistRate;
            }

            if (userPayrateMap.has(idB)) {
              const artistRate = userPayrateMap.get(idB) || 0;
              const studioMarginRate = Math.max(0, projectRate - artistRate);
              estimatedMarginPayable += durHours * studioMarginRate;
              totalArtistPayout += durHours * artistRate;
            }
          });

          // 3. Scripted Calls
          scriptedSubmissions.forEach((sub) => {
            const langKey = String(sub.language || "").toLowerCase().trim();
            const projectRate = ratesLookup.scriptedRates[langKey] || 25;
            const artistRate = userPayrateMap.get(String(sub.userId)) || 0;

            (sub.verses || []).forEach((v) => {
              if (v.status === "approved") {
                const durHours = (Number(v.durationSec) || 0) / 3600;
                if (durHours > 0) {
                  const studioMarginRate = Math.max(0, projectRate - artistRate);
                  estimatedMarginPayable += durHours * studioMarginRate;
                  totalArtistPayout += durHours * artistRate;
                }
              }
            });
          });
        } else {
          // ─── NON-STUDIO VENDOR MODEL ────────────────────────────────────────
          // Contributor receives 100% of Project Rate ($/hr).
          // Vendor Margin = Sum(Approved Hours * Admin Set baseRate $/hr).
          assignedProjects.forEach((proj) => {
            if (!proj.isActive) return;
            const marginRate = Number(proj.baseRate) || 0; // Rate in dollars ($/approved hr)

            if (proj.category === "call") {
              const langCode = String(proj.languageCode || proj.subprojectId.replace('call_lang_', '')).toLowerCase().trim();
              const projectRate = ratesLookup.callRates[langCode] || 25;
              const callsForProj = approvedCalls.filter(c => String(c.language || "").toLowerCase().trim() === langCode);
              const durSec = callsForProj.reduce((acc, c) => acc + (c.actualCallDuration || 0), 0);
              const approvedHours = durSec / 3600;
              estimatedMarginPayable += approvedHours * marginRate;
              totalArtistPayout += approvedHours * projectRate;
            } else if (proj.category === "phrase") {
              const projectRate = ratesLookup.phraseRates[String(proj.subprojectId)] || 25;
              const phrasesForProj = approvedPhrases.filter(p => {
                if (String(p.companyId) !== String(proj.subprojectId)) return false;
                if (proj.assignedLanguages && proj.assignedLanguages.length > 0) {
                  return proj.assignedLanguages.map(l => l.toLowerCase().trim()).includes(String(p.language || "").toLowerCase().trim());
                }
                return true;
              });
              const durSec = phrasesForProj.reduce((acc, p) => acc + (p.duration || 0), 0);
              const approvedHours = durSec / 3600;
              estimatedMarginPayable += approvedHours * marginRate;
              totalArtistPayout += approvedHours * projectRate;
            } else if (proj.category === "scripted_call") {
              const langCode = String(proj.languageCode || proj.subprojectId.replace('scripted_lang_', '')).toLowerCase().trim();
              const projectRate = ratesLookup.scriptedRates[langCode] || 25;
              const subsForProj = scriptedSubmissions.filter(s => String(s.language || "").toLowerCase().trim() === langCode);
              let durSec = 0;
              subsForProj.forEach(s => {
                (s.verses || []).forEach(v => {
                  if (v.status === "approved") durSec += (v.durationSec || 0);
                });
              });
              const approvedHours = durSec / 3600;
              estimatedMarginPayable += approvedHours * marginRate;
              totalArtistPayout += approvedHours * projectRate;
            }
          });
        }

        const totalApprovedSec = totalApprovedPhraseDurationSec + totalApprovedCallDurationSec + totalApprovedScriptedDurationSec;

        return {
          ...vendor,
          stats: {
            totalWorkers,
            totalApproved,
            totalRejected,
            totalAudited,
            overallApprovalRate,
            totalApprovedHours: Number((totalApprovedSec / 3600).toFixed(2)),
            totalApprovedCalls,
            estimatedMarginPayable: Number(estimatedMarginPayable.toFixed(2)),
            totalArtistPayout: Number(totalArtistPayout.toFixed(2)),
            totalProjectValue: Number((estimatedMarginPayable + totalArtistPayout).toFixed(2))
          }
        };
      })
    );

    res.json({ vendors: enrichedVendors });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendors: " + err.message });
  }
}

// ─── ADMIN: Create New Vendor ─────────────────────────────────────────────────
export async function createVendorAdmin(req, res) {
  try {
    const { name, vendorCode, contactPerson, email, phone, password, payoutDetails, assignedProjects, isStudio, notes } = req.body;

    if (!name || !vendorCode || !email || !password) {
      return res.status(400).json({ error: "Name, Vendor Code, Email, and Password are required." });
    }

    const cleanCode = vendorCode.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    const existingCode = await Vendor.findOne({ vendorCode: cleanCode }).lean();
    if (existingCode) {
      return res.status(400).json({ error: "A vendor with this Vendor Code already exists." });
    }

    const existingEmail = await Vendor.findOne({ email: cleanEmail }).lean();
    if (existingEmail) {
      return res.status(400).json({ error: "A vendor with this Email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newVendor = await Vendor.create({
      name: name.trim(),
      vendorCode: cleanCode,
      contactPerson: contactPerson ? contactPerson.trim() : "",
      email: cleanEmail,
      phone: phone ? phone.trim() : "",
      passwordHash,
      payoutDetails: payoutDetails || {},
      assignedProjects: assignedProjects || [],
      isStudio: Boolean(isStudio),
      notes: notes || ""
    });

    res.status(201).json({ ok: true, vendor: newVendor });
  } catch (err) {
    res.status(500).json({ error: "Failed to create vendor: " + err.message });
  }
}

// ─── ADMIN: Get Vendor Details & Community ────────────────────────────────────
export async function getVendorByIdAdmin(req, res) {
  try {
    const vendor = await Vendor.findById(req.params.id).lean();
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const communityWorkers = await User.find({ vendorId: vendor._id })
      .select("firstname lastname username email mobileNumber speaker_id accountStatus upiId createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // Fetch individual metrics for each worker
    const enrichedWorkers = await Promise.all(
      communityWorkers.map(async (u) => {
        const approvedPhrases = await Phrase.countDocuments({ contributorId: u._id, status: "approved" });
        const rejectedPhrases = await PhraseRejection.countDocuments({ contributorId: u._id });
        const approvedCalls = await CallSession.countDocuments({
          $or: [{ userA: u._id }, { userB: u._id }],
          callStatus: "approved",
          callActuallyStarted: true
        });

        const totalTasks = approvedPhrases + rejectedPhrases + approvedCalls;
        const approvalRate = totalTasks > 0 ? Number((((approvedPhrases + approvedCalls) / totalTasks) * 100).toFixed(1)) : 0;

        return {
          ...u,
          approvedPhrases,
          rejectedPhrases,
          approvedCalls,
          approvalRate
        };
      })
    );

    res.json({ vendor, community: enrichedWorkers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendor: " + err.message });
  }
}

// ─── ADMIN: Update Vendor Details ─────────────────────────────────────────────
export async function updateVendorAdmin(req, res) {
  try {
    const { name, contactPerson, email, phone, password, payoutDetails, isStudio, status, notes } = req.body;
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    if (name) vendor.name = name.trim();
    if (contactPerson !== undefined) vendor.contactPerson = contactPerson.trim();
    if (phone !== undefined) vendor.phone = phone.trim();
    if (status) vendor.status = status;
    if (notes !== undefined) vendor.notes = notes;
    if (isStudio !== undefined) vendor.isStudio = Boolean(isStudio);
    if (payoutDetails) vendor.payoutDetails = { ...vendor.payoutDetails, ...payoutDetails };

    if (password && password.trim().length >= 6) {
      vendor.passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    await vendor.save();
    res.json({ ok: true, vendor });
  } catch (err) {
    res.status(500).json({ error: "Failed to update vendor: " + err.message });
  }
}

// ─── ADMIN: Update Vendor Project Assignments & Margins ──────────────────────
export async function updateVendorAssignmentsAdmin(req, res) {
  try {
    const { assignedProjects } = req.body;
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    vendor.assignedProjects = assignedProjects || [];
    await vendor.save();

    res.json({ ok: true, assignedProjects: vendor.assignedProjects });
  } catch (err) {
    res.status(500).json({ error: "Failed to update project assignments: " + err.message });
  }
}

// ─── ADMIN: Delete Vendor (Releases Contributors to Normal Community Status) ─
export async function deleteVendorAdmin(req, res) {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    // Release all linked contributors under this vendor to normal community status
    const updateResult = await User.updateMany(
      { vendorId: vendor._id },
      {
        $set: {
          vendorId: null,
          vendorCode: null,
          perCallPayrate: 0,
          hourlyPhrasePayrate: 0,
          previousVendorId: vendor._id,
          previousVendorCode: vendor.vendorCode
        }
      }
    );

    // Permanently remove vendor document
    await Vendor.findByIdAndDelete(vendor._id);

    res.json({
      ok: true,
      message: `Vendor "${vendor.name}" deleted successfully. Released ${updateResult.modifiedCount} contributor account${updateResult.modifiedCount === 1 ? "" : "s"} to normal community status.`,
      releasedWorkersCount: updateResult.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete vendor: " + err.message });
  }
}

// ─── ADMIN: Suspend Vendor Account & Release All Contributors to Normal ────────
export async function suspendVendorAdmin(req, res) {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    vendor.status = "suspended";
    await vendor.save();

    // Turn all subaccounts / contributor accounts under this vendor into normal contributors
    const updateResult = await User.updateMany(
      { vendorId: vendor._id },
      {
        $set: {
          vendorId: null,
          vendorCode: null,
          perCallPayrate: 0,
          hourlyPhrasePayrate: 0,
          previousVendorId: vendor._id,
          previousVendorCode: vendor.vendorCode
        }
      }
    );

    res.json({
      ok: true,
      message: `Vendor "${vendor.name}" suspended. Released ${updateResult.modifiedCount} contributor account${updateResult.modifiedCount === 1 ? "" : "s"} to normal community status.`,
      vendor,
      releasedWorkersCount: updateResult.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to suspend vendor: " + err.message });
  }
}

// ─── ADMIN: Reactivate Suspended Vendor Account ───────────────────────────────
export async function reactivateVendorAdmin(req, res) {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    vendor.status = "active";
    await vendor.save();

    res.json({
      ok: true,
      message: `Vendor "${vendor.name}" has been reactivated.`,
      vendor
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to reactivate vendor: " + err.message });
  }
}

// ─── VENDOR PORTAL: Authentication & Login ────────────────────────────────────
export async function vendorLogin(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (vendor.status === "suspended") {
      return res.status(403).json({ error: "This vendor account has been suspended. Please contact DataCatalyst support." });
    }

    const match = await bcrypt.compare(password, vendor.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = signVendorToken({ vendorId: vendor._id }, process.env.JWT_SECRET);

    // Set cookie
    res.cookie("vc_vendor_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({
      ok: true,
      token,
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        vendorCode: vendor.vendorCode,
        contactPerson: vendor.contactPerson,
        email: vendor.email,
        phone: vendor.phone,
        status: vendor.status,
        payoutDetails: vendor.payoutDetails
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Vendor login failed: " + err.message });
  }
}

// ─── VENDOR PORTAL: Current Vendor Profile & Live Quality Stats ───────────────
export async function getVendorMe(req, res) {
  try {
    const vendor = req.vendor;
    const [vendorUsers, ratesLookup] = await Promise.all([
      User.find({ vendorId: vendor._id }).select("_id perCallPayrate hourlyPhrasePayrate").lean(),
      getProjectRatesLookup()
    ]);
    const userIds = vendorUsers.map((u) => u._id);

    const userPayrateMap = new Map();
    vendorUsers.forEach((u) => {
      const rate = Number(u.hourlyPhrasePayrate || u.perCallPayrate) || 0;
      userPayrateMap.set(String(u._id), rate);
    });

    let totalApprovedPhrases = 0;
    let totalRejectedPhrases = 0;
    let totalApprovedPhraseDurationSec = 0;
    let totalApprovedCalls = 0;
    let totalRejectedCalls = 0;
    let totalApprovedCallDurationSec = 0;
    let totalApprovedScriptedVerses = 0;
    let totalRejectedScriptedVerses = 0;
    let totalApprovedScriptedDurationSec = 0;
    let approvedPhrases = [];
    let approvedCalls = [];
    let scriptedSubs = [];

    if (userIds.length > 0) {
      approvedPhrases = await Phrase.find({
        contributorId: { $in: userIds },
        status: "approved"
      }).select("duration companyId contributorId language").lean();
      totalApprovedPhrases = approvedPhrases.length;
      totalApprovedPhraseDurationSec = approvedPhrases.reduce((acc, p) => acc + (p.duration || 0), 0);

      totalRejectedPhrases = await PhraseRejection.countDocuments({
        contributorId: { $in: userIds }
      });

      approvedCalls = await CallSession.find({
        $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
        callStatus: "approved",
        callActuallyStarted: true
      }).select("actualCallDuration language userA userB").lean();
      totalApprovedCalls = approvedCalls.length;
      totalApprovedCallDurationSec = approvedCalls.reduce((acc, c) => acc + (c.actualCallDuration || 0), 0);

      totalRejectedCalls = await CallSession.countDocuments({
        $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
        callStatus: "rejected"
      });

      scriptedSubs = await ScriptedSubmission.find({
        userId: { $in: userIds }
      }).select("verses language subtopicId userId").lean();

      scriptedSubs.forEach((sub) => {
        (sub.verses || []).forEach((v) => {
          if (v.status === "approved") {
            totalApprovedScriptedVerses++;
            totalApprovedScriptedDurationSec += (v.durationSec || 0);
          }
          if (v.status === "rejected") totalRejectedScriptedVerses++;
        });
      });
    }

    const totalApproved = totalApprovedPhrases + totalApprovedCalls + totalApprovedScriptedVerses;
    const totalRejected = totalRejectedPhrases + totalRejectedCalls + totalRejectedScriptedVerses;
    const totalAudited = totalApproved + totalRejected;
    const overallApprovalRate = totalAudited > 0 ? Number(((totalApproved / totalAudited) * 100).toFixed(1)) : 0;

    let totalMarginEarned = 0;
    let totalArtistPayout = 0;
    const assignedProjects = vendor.assignedProjects || [];

    if (vendor.isStudio) {
      // ─── STUDIO SPLIT MODEL ─────────────────────────────────────────────
      // Studio Margin = Sum(Approved Hours * max(0, Project Rate - Artist Rate))
      // Artist Direct Payout = Sum(Approved Hours * Artist Rate)

      // 1. Phrases
      approvedPhrases.forEach((p) => {
        const durHours = (Number(p.duration) || 0) / 3600;
        if (durHours <= 0) return;
        const matchedProj = assignedProjects.find(pr => pr.category === "phrase" && pr.isActive !== false && String(pr.subprojectId) === String(p.companyId));
        if (!matchedProj) return;
        if (matchedProj.assignedLanguages && matchedProj.assignedLanguages.length > 0) {
          const langLower = String(p.language || "").toLowerCase().trim();
          if (!matchedProj.assignedLanguages.map(l => l.toLowerCase().trim()).includes(langLower)) return;
        }
        const projectRate = ratesLookup.phraseRates[String(p.companyId)] || 25;
        const artistRate = userPayrateMap.get(String(p.contributorId)) || 0;
        const studioMarginRate = Math.max(0, projectRate - artistRate);

        totalMarginEarned += durHours * studioMarginRate;
        totalArtistPayout += durHours * artistRate;
      });

      // 2. Calls
      approvedCalls.forEach((c) => {
        const durHours = (Number(c.actualCallDuration) || 0) / 3600;
        if (durHours <= 0) return;
        const langKey = String(c.language || "").toLowerCase().trim();
        const projectRate = ratesLookup.callRates[langKey] || 25;

        const idA = String(c.userA?._id || c.userA || "");
        const idB = String(c.userB?._id || c.userB || "");

        if (userPayrateMap.has(idA)) {
          const artistRate = userPayrateMap.get(idA) || 0;
          const studioMarginRate = Math.max(0, projectRate - artistRate);
          totalMarginEarned += durHours * studioMarginRate;
          totalArtistPayout += durHours * artistRate;
        }

        if (userPayrateMap.has(idB)) {
          const artistRate = userPayrateMap.get(idB) || 0;
          const studioMarginRate = Math.max(0, projectRate - artistRate);
          totalMarginEarned += durHours * studioMarginRate;
          totalArtistPayout += durHours * artistRate;
        }
      });

      // 3. Scripted Calls
      scriptedSubs.forEach((sub) => {
        const langKey = String(sub.language || "").toLowerCase().trim();
        const projectRate = ratesLookup.scriptedRates[langKey] || 25;
        const artistRate = userPayrateMap.get(String(sub.userId)) || 0;

        (sub.verses || []).forEach((v) => {
          if (v.status === "approved") {
            const durHours = (Number(v.durationSec) || 0) / 3600;
            if (durHours > 0) {
              const studioMarginRate = Math.max(0, projectRate - artistRate);
              totalMarginEarned += durHours * studioMarginRate;
              totalArtistPayout += durHours * artistRate;
            }
          }
        });
      });
    } else {
      // ─── NON-STUDIO VENDOR MODEL ────────────────────────────────────────
      assignedProjects.forEach((proj) => {
        if (!proj.isActive) return;
        const marginRate = Number(proj.baseRate) || 0; // Rate in dollars ($/approved hr)

        if (proj.category === "call") {
          const langCode = String(proj.languageCode || proj.subprojectId.replace('call_lang_', '')).toLowerCase().trim();
          const projectRate = ratesLookup.callRates[langCode] || 25;
          const callsForProj = approvedCalls.filter(c => String(c.language || "").toLowerCase().trim() === langCode);
          const durSec = callsForProj.reduce((acc, c) => acc + (c.actualCallDuration || 0), 0);
          const approvedHours = durSec / 3600;
          totalMarginEarned += approvedHours * marginRate;
          totalArtistPayout += approvedHours * projectRate;
        } else if (proj.category === "phrase") {
          const projectRate = ratesLookup.phraseRates[String(proj.subprojectId)] || 25;
          const phrasesForProj = approvedPhrases.filter(p => {
            if (String(p.companyId) !== String(proj.subprojectId)) return false;
            if (proj.assignedLanguages && proj.assignedLanguages.length > 0) {
              return proj.assignedLanguages.map(l => l.toLowerCase().trim()).includes(String(p.language || "").toLowerCase().trim());
            }
            return true;
          });
          const durSec = phrasesForProj.reduce((acc, p) => acc + (p.duration || 0), 0);
          const approvedHours = durSec / 3600;
          totalMarginEarned += approvedHours * marginRate;
          totalArtistPayout += approvedHours * projectRate;
        } else if (proj.category === "scripted_call") {
          const langCode = String(proj.languageCode || proj.subprojectId.replace('scripted_lang_', '')).toLowerCase().trim();
          const projectRate = ratesLookup.scriptedRates[langCode] || 25;
          const subsForProj = scriptedSubs.filter(s => String(s.language || "").toLowerCase().trim() === langCode);
          let durSec = 0;
          subsForProj.forEach(s => {
            (s.verses || []).forEach(v => {
              if (v.status === "approved") durSec += (v.durationSec || 0);
            });
          });
          const approvedHours = durSec / 3600;
          totalMarginEarned += approvedHours * marginRate;
          totalArtistPayout += approvedHours * projectRate;
        }
      });
    }

    const totalApprovedSec = totalApprovedPhraseDurationSec + totalApprovedCallDurationSec + totalApprovedScriptedDurationSec;

    res.json({
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        vendorCode: vendor.vendorCode,
        contactPerson: vendor.contactPerson,
        email: vendor.email,
        phone: vendor.phone,
        status: vendor.status,
        isStudio: Boolean(vendor.isStudio),
        payoutDetails: vendor.payoutDetails,
        assignedProjects: vendor.assignedProjects
      },
      stats: {
        totalWorkers: userIds.length,
        totalApproved,
        totalRejected,
        totalAudited,
        overallApprovalRate,
        totalApprovedHours: Number((totalApprovedSec / 3600).toFixed(2)),
        totalApprovedCalls,
        totalMarginEarned: Number(totalMarginEarned.toFixed(2)),
        totalArtistPayout: Number(totalArtistPayout.toFixed(2)),
        totalProjectValue: Number((totalMarginEarned + totalArtistPayout).toFixed(2))
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendor dashboard: " + err.message });
  }
}

// ─── VENDOR PORTAL: Community Worker Roster ───────────────────────────────────
export async function getVendorCommunity(req, res) {
  try {
    const vendorId = req.vendorId;
    const workers = await User.find({ vendorId })
      .select("firstname lastname username email mobileNumber speaker_id accountStatus isProfileComplete contributorAgreement upiId perCallPayrate hourlyPhrasePayrate createdAt vendorCode vendorId")
      .sort({ createdAt: -1 })
      .lean();

    const enrichedWorkers = await Promise.all(
      workers.map(async (u) => {
        const approvedPhrases = await Phrase.countDocuments({ contributorId: u._id, status: "approved" });
        const rejectedPhrases = await PhraseRejection.countDocuments({ contributorId: u._id });
        const approvedCalls = await CallSession.countDocuments({
          $or: [{ userA: u._id }, { userB: u._id }],
          callStatus: "approved",
          callActuallyStarted: true
        });

        const totalTasks = approvedPhrases + rejectedPhrases + approvedCalls;
        const approvalRate = totalTasks > 0 ? Number((((approvedPhrases + approvedCalls) / totalTasks) * 100).toFixed(1)) : 0;

        // Compute detailed contributor onboarding status
        let detailedStatus = "awaiting_profile";
        let statusLabel = "Awaiting Profile";

        const isProfileComplete = Boolean(u.isProfileComplete);
        const accountStatus = u.accountStatus || "pending_intro";
        const ca = u.contributorAgreement || {};

        if (!isProfileComplete) {
          detailedStatus = "awaiting_profile";
          statusLabel = "Awaiting Profile";
        } else if (accountStatus === "pending_intro") {
          detailedStatus = "awaiting_intro";
          statusLabel = "Awaiting Voice Intro";
        } else if (accountStatus === "rejected") {
          detailedStatus = "intro_rejected";
          statusLabel = "Intro Rejected";
        } else if (accountStatus === "pending_approval") {
          detailedStatus = "pending_approval";
          statusLabel = "Intro Under Review";
        } else if (accountStatus === "approved") {
          if (!ca.signed) {
            detailedStatus = "awaiting_agreement_sign";
            statusLabel = "Awaiting Agreement Sign";
          } else if (ca.adminReviewStatus === "pending") {
            detailedStatus = "agreement_review";
            statusLabel = "Agreement Review";
          } else if (ca.adminReviewStatus === "rejected") {
            detailedStatus = "agreement_rejected";
            statusLabel = "Agreement Rejected";
          } else {
            detailedStatus = "approved";
            statusLabel = "Approved";
          }
        }

        return {
          _id: u._id,
          name: `${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username,
          username: u.username,
          email: u.email,
          speaker_id: u.speaker_id || "N/A",
          mobileNumber: u.mobileNumber || "N/A",
          vendorCode: u.vendorCode || req.vendor?.vendorCode || null,
          vendorId: u.vendorId || vendorId,
          accountStatus: u.accountStatus,
          detailedStatus,
          statusLabel,
          contributorAgreement: ca,
          hasUpiConfigured: Boolean(u.upiId),
          artistHourlyPayrate: Number(u.hourlyPhrasePayrate || u.perCallPayrate) || 0,
          perCallPayrate: u.perCallPayrate !== undefined ? u.perCallPayrate : 0,
          hourlyPhrasePayrate: u.hourlyPhrasePayrate !== undefined ? u.hourlyPhrasePayrate : 0,
          approvedTasks: approvedPhrases + approvedCalls,
          rejectedTasks: rejectedPhrases,
          approvalRate,
          isProfileComplete,
          joinedAt: u.createdAt
        };
      })
    );

    res.json({ workers: enrichedWorkers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch community roster: " + err.message });
  }
}

// ─── VENDOR PORTAL: Create User / Contributor Account (Email & Password) ──────
export async function createVendorUser(req, res) {
  try {
    const vendor = req.vendor;
    const {
      email,
      password,
      firstname,
      lastname,
      artistHourlyPayrate,
      perCallPayrate,
      hourlyPhrasePayrate
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const cleanPassword = String(password).trim();
    if (cleanPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail }).lean();
    if (existing) {
      return res.status(400).json({ error: `A user with email "${cleanEmail}" is already registered.` });
    }

    const emailPrefix = cleanEmail.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
    const rawFirst = String(firstname || "").trim();
    const rawLast = String(lastname || "").trim();

    const baseUsername = `${(rawFirst || emailPrefix).toLowerCase()}${rawLast.toLowerCase()}`.replace(/[^a-z0-9]/g, "") || "user";
    let username = baseUsername;
    let counter = 1;
    while (await User.findOne({ username }).lean()) {
      username = `${baseUsername}${Math.floor(1000 + Math.random() * 9000)}`;
      counter++;
      if (counter > 10) break;
    }

    const { seq } = await Counter.findOneAndUpdate(
      { _id: "speaker_id" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const speaker_id = `spk_${seq}`;
    const passwordHash = await bcrypt.hash(cleanPassword, 10);

    const hourlyRate = Number(artistHourlyPayrate !== undefined ? artistHourlyPayrate : (hourlyPhrasePayrate !== undefined ? hourlyPhrasePayrate : perCallPayrate)) || 0;

    const newUser = await User.create({
      firstname: rawFirst,
      lastname: rawLast,
      username,
      email: cleanEmail,
      passwordHash,
      isEmailVerified: true,
      isProfileComplete: false, // Contributor will complete full profile (DOB, address, mic) on login
      speaker_id,
      vendorId: vendor._id,
      vendorCode: vendor.vendorCode,
      perCallPayrate: vendor.isStudio ? hourlyRate : 0,
      hourlyPhrasePayrate: vendor.isStudio ? hourlyRate : 0,
      accountStatus: "pending_intro", // Proceed to intro recording after profile completion
    });

    const userSummary = {
      _id: newUser._id,
      name: `${newUser.firstname} ${newUser.lastname}`.trim() || newUser.username,
      username: newUser.username,
      email: newUser.email,
      speaker_id: newUser.speaker_id,
      artistHourlyPayrate: newUser.hourlyPhrasePayrate || newUser.perCallPayrate || 0,
      perCallPayrate: newUser.perCallPayrate,
      hourlyPhrasePayrate: newUser.hourlyPhrasePayrate,
      accountStatus: newUser.accountStatus,
      isProfileComplete: false,
      joinedAt: newUser.createdAt
    };

    res.status(201).json({
      ok: true,
      user: userSummary,
      artist: userSummary, // Backward compatibility for studio frontend
      credentials: {
        email: cleanEmail,
        password: cleanPassword
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create user account: " + err.message });
  }
}

export const createStudioArtist = createVendorUser;

// ─── VENDOR PORTAL: Update Artist Payrate ─────────────────────────────────────
export async function updateArtistPayrate(req, res) {
  try {
    const vendor = req.vendor;
    if (!vendor.isStudio) {
      return res.status(403).json({ error: "Only Studio partners can customize artist payrates." });
    }

    const { artistId } = req.params;
    const { artistHourlyPayrate, perCallPayrate, hourlyPhrasePayrate } = req.body;

    const artist = await User.findOne({ _id: artistId, vendorId: vendor._id });
    if (!artist) {
      return res.status(404).json({ error: "Artist not found under this studio." });
    }

    const hourlyRate = Number(artistHourlyPayrate !== undefined ? artistHourlyPayrate : (hourlyPhrasePayrate !== undefined ? hourlyPhrasePayrate : perCallPayrate)) || 0;

    artist.perCallPayrate = hourlyRate;
    artist.hourlyPhrasePayrate = hourlyRate;

    await artist.save();
    res.json({ ok: true, artist });
  } catch (err) {
    res.status(500).json({ error: "Failed to update artist payrate: " + err.message });
  }
}

// ─── VENDOR PORTAL: Assigned Projects & Quota ─────────────────────────────────
export async function getVendorProjects(req, res) {
  try {
    const vendor = req.vendor;
    const [vendorUsers, ratesLookup] = await Promise.all([
      User.find({ vendorId: vendor._id }).select("_id perCallPayrate hourlyPhrasePayrate").lean(),
      getProjectRatesLookup()
    ]);
    const userIds = vendorUsers.map((u) => u._id);

    const userPayrateMap = new Map();
    vendorUsers.forEach((u) => {
      const rate = Number(u.hourlyPhrasePayrate || u.perCallPayrate) || 0;
      userPayrateMap.set(String(u._id), rate);
    });

    const enrichedProjects = await Promise.all(
      (vendor.assignedProjects || []).map(async (proj) => {
        let approvedUnits = 0; // approved hours
        let rejectedUnits = 0;
        let accumulatedMargin = 0;
        let accumulatedArtistPayout = 0;
        let projectRate = 25;

        if (userIds.length > 0) {
          if (proj.category === "call") {
            const langCode = String(proj.languageCode || proj.subprojectId.replace('call_lang_', '')).toLowerCase().trim();
            projectRate = ratesLookup.callRates[langCode] || 25;

            const approvedCalls = await CallSession.find({
              $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
              language: { $regex: new RegExp(`^${langCode}$`, 'i') },
              callStatus: "approved",
              callActuallyStarted: true
            }).select("actualCallDuration userA userB").lean();

            approvedCalls.forEach((c) => {
              const durHours = (Number(c.actualCallDuration) || 0) / 3600;
              if (durHours <= 0) return;
              approvedUnits += durHours;

              const idA = String(c.userA?._id || c.userA || "");
              const idB = String(c.userB?._id || c.userB || "");

              if (userPayrateMap.has(idA)) {
                const artistRate = userPayrateMap.get(idA) || 0;
                accumulatedMargin += durHours * Math.max(0, projectRate - artistRate);
                accumulatedArtistPayout += durHours * artistRate;
              }

              if (userPayrateMap.has(idB)) {
                const artistRate = userPayrateMap.get(idB) || 0;
                accumulatedMargin += durHours * Math.max(0, projectRate - artistRate);
                accumulatedArtistPayout += durHours * artistRate;
              }
            });

            rejectedUnits = await CallSession.countDocuments({
              $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
              language: { $regex: new RegExp(`^${langCode}$`, 'i') },
              callStatus: "rejected"
            });
          } else if (proj.category === "phrase") {
            projectRate = ratesLookup.phraseRates[String(proj.subprojectId)] || 25;

            const phraseQuery = {
              companyId: proj.subprojectId,
              contributorId: { $in: userIds },
              status: "approved"
            };
            const rejectionQuery = {
              companyId: proj.subprojectId,
              contributorId: { $in: userIds }
            };

            if (proj.assignedLanguages && proj.assignedLanguages.length > 0) {
              const langRegexes = proj.assignedLanguages.map((l) => new RegExp(`^${l}$`, "i"));
              phraseQuery.language = { $in: langRegexes };
              rejectionQuery.language = { $in: langRegexes };
            }

            const approvedPhrases = await Phrase.find(phraseQuery)
              .select("duration contributorId language")
              .lean();

            approvedPhrases.forEach((p) => {
              const durHours = (Number(p.duration) || 0) / 3600;
              if (durHours <= 0) return;
              approvedUnits += durHours;

              const artistRate = userPayrateMap.get(String(p.contributorId)) || 0;
              accumulatedMargin += durHours * Math.max(0, projectRate - artistRate);
              accumulatedArtistPayout += durHours * artistRate;
            });

            rejectedUnits = await PhraseRejection.countDocuments(rejectionQuery);
          } else if (proj.category === "scripted_call") {
            const langCode = String(proj.languageCode || proj.subprojectId.replace('scripted_lang_', '')).toLowerCase().trim();
            projectRate = ratesLookup.scriptedRates[langCode] || 25;

            const subs = await ScriptedSubmission.find({
              userId: { $in: userIds },
              language: { $regex: new RegExp(`^${langCode}$`, 'i') }
            }).select("verses userId").lean();

            subs.forEach((sub) => {
              const artistRate = userPayrateMap.get(String(sub.userId)) || 0;
              (sub.verses || []).forEach((v) => {
                if (v.status === "approved") {
                  const durHours = (Number(v.durationSec) || 0) / 3600;
                  if (durHours > 0) {
                    approvedUnits += durHours;
                    accumulatedMargin += durHours * Math.max(0, projectRate - artistRate);
                    accumulatedArtistPayout += durHours * artistRate;
                  }
                }
                if (v.status === "rejected") rejectedUnits++;
              });
            });
          }
        }

        approvedUnits = Number(approvedUnits.toFixed(2));
        const total = approvedUnits + rejectedUnits;
        const approvalRate = total > 0 ? Number(((approvedUnits / total) * 100).toFixed(1)) : 0;

        let marginRate = 0;
        if (vendor.isStudio) {
          marginRate = approvedUnits > 0
            ? Number(Math.max(0, (accumulatedMargin / approvedUnits)).toFixed(2))
            : Number((projectRate * 0.10).toFixed(2));
        } else {
          marginRate = Number(proj.baseRate) || 0;
          accumulatedMargin = Number((approvedUnits * marginRate).toFixed(2));
          accumulatedArtistPayout = Number((approvedUnits * projectRate).toFixed(2));
        }

        return {
          ...proj.toObject(),
          unitLabel: "approved hr",
          projectPayrate: projectRate,
          approvedUnits,
          rejectedUnits,
          approvalRate,
          marginRate,
          accumulatedMargin: Number(accumulatedMargin.toFixed(2)),
          accumulatedArtistPayout: Number(accumulatedArtistPayout.toFixed(2)),
          totalProjectValue: Number((accumulatedMargin + accumulatedArtistPayout).toFixed(2))
        };
      })
    );

    res.json({ projects: enrichedProjects });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendor projects: " + err.message });
  }
}

// ─── VENDOR PORTAL: Rejection Quality Insights (Coaching Tool) ────────────────
export async function getVendorQualityInsights(req, res) {
  try {
    const vendorId = req.vendorId;
    const vendorUsers = await User.find({ vendorId }).select("_id").lean();
    const userIds = vendorUsers.map((u) => u._id);

    if (userIds.length === 0) {
      return res.json({ reasons: [] });
    }

    const rejections = await PhraseRejection.find({
      contributorId: { $in: userIds }
    }).select("comment").lean();

    const frequencyMap = {};
    rejections.forEach((r) => {
      const reason = (r.comment || "Unspecified Quality Issue").trim();
      frequencyMap[reason] = (frequencyMap[reason] || 0) + 1;
    });

    const reasons = Object.entries(frequencyMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    res.json({ reasons });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch quality insights: " + err.message });
  }
}

// ─── VENDOR PORTAL: Update Own Payout Settings ────────────────────────────────
export async function updateVendorPayoutSettings(req, res) {
  try {
    const { upiId, accountHolderName, bankAccountNumber, ifscCode, panNumber } = req.body;
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    vendor.payoutDetails = {
      ...vendor.payoutDetails,
      upiId: upiId ? upiId.trim() : vendor.payoutDetails?.upiId,
      accountHolderName: accountHolderName ? accountHolderName.trim() : vendor.payoutDetails?.accountHolderName,
      bankAccountNumber: bankAccountNumber ? bankAccountNumber.trim() : vendor.payoutDetails?.bankAccountNumber,
      ifscCode: ifscCode ? ifscCode.trim().toUpperCase() : vendor.payoutDetails?.ifscCode,
      panNumber: panNumber ? panNumber.trim().toUpperCase() : vendor.payoutDetails?.panNumber
    };

    await vendor.save();
    res.json({ ok: true, payoutDetails: vendor.payoutDetails });
  } catch (err) {
    res.status(500).json({ error: "Failed to update payout settings: " + err.message });
  }
}
