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
import { VendorPayout } from "../models/VendorPayout.js";
import { signVendorToken } from "../auth.js";
import fs from "fs";
import path from "path";
import { generatePartnerAgreementPdf } from "../utils/partnerAgreementPdf.js";



// ─── HELPER: Project Rates Lookup ($/hr) ──────────────────────────────────────
async function getProjectRatesLookup() {
  const [langs, scriptedLangs, companies] = await Promise.all([
    Language.find({}).select("code hourlyPayout").lean(),
    ScriptedLanguage.find({}).select("code hourlyPayout").lean(),
    Company.find({}).select("_id name projectName hourlyPayout").lean()
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
  const companyLookup = new Map();
  companies.forEach((c) => {
    const rate = Number(c.hourlyPayout) || 25;
    if (c._id) {
      phraseRates[String(c._id)] = rate;
      companyLookup.set(String(c._id), c);
    }
    if (c.name) {
      const nameKey = String(c.name).toLowerCase().trim();
      phraseRates[nameKey] = rate;
      companyLookup.set(nameKey, c);
    }
    if (c.projectName) {
      const projKey = String(c.projectName).toLowerCase().trim();
      phraseRates[projKey] = rate;
      companyLookup.set(projKey, c);
    }
  });

  return { callRates, scriptedRates, phraseRates, companies, companyLookup };
}

export function resolveCompanyForPhrase(companyId, companyLookup) {
  if (!companyId) return null;
  const key = String(companyId).trim();
  const lowerKey = key.toLowerCase();
  return companyLookup?.get(key) || companyLookup?.get(lowerKey) || null;
}

export function doesPhraseMatchVendorProject(p, proj, companyLookup) {
  if (!proj || proj.category !== "phrase" || proj.isActive === false) return false;
  const pSub = String(p.companyId || "").trim();
  const prSub = String(proj.subprojectId || "").trim();
  if (pSub && prSub && pSub === prSub) return true;

  const pComp = resolveCompanyForPhrase(pSub, companyLookup);
  const prComp = resolveCompanyForPhrase(prSub, companyLookup);

  if (pComp && prComp && String(pComp._id) === String(prComp._id)) return true;
  if (prComp && pSub && String(prComp.name).toLowerCase() === pSub.toLowerCase()) return true;
  if (pComp && prSub && String(pComp._id) === prSub) return true;
  if (proj.subprojectName && pSub && proj.subprojectName.toLowerCase().includes(pSub.toLowerCase())) return true;
  if (p.projectName && proj.subprojectName && proj.subprojectName.toLowerCase().includes(String(p.projectName).toLowerCase())) return true;

  return false;
}

// ─── HELPER: Studio Allocated Projects & Allowed Languages ────────────────────
export function getStudioAllocatedProjectsWithLanguages(vendor, ratesLookup) {
  const list = [];
  const assigned = (vendor?.assignedProjects || []).filter((p) => p.isActive !== false);

  for (const proj of assigned) {
    let languages = [];
    if (proj.assignedLanguages && proj.assignedLanguages.length > 0) {
      languages = proj.assignedLanguages.map((l) => String(l).toLowerCase().trim()).filter(Boolean);
    } else if (proj.languageCode) {
      languages = [String(proj.languageCode).toLowerCase().trim()];
    } else if (proj.category === "phrase") {
      languages = ["all"];
    } else {
      const cleanSub = String(proj.subprojectId || "").replace(/^(call_lang_|scripted_lang_)/, "").toLowerCase().trim();
      if (cleanSub) languages = [cleanSub];
      else languages = ["default"];
    }

    for (const lang of languages) {
      let projectRate = 25;
      if (proj.category === "call") {
        projectRate = ratesLookup?.callRates?.[lang] || 25;
      } else if (proj.category === "scripted_call") {
        projectRate = ratesLookup?.scriptedRates?.[lang] || 25;
      } else if (proj.category === "phrase") {
        const resolvedComp = resolveCompanyForPhrase(proj.subprojectId, ratesLookup?.companyLookup);
        projectRate = (resolvedComp?.hourlyPayout !== undefined)
          ? Number(resolvedComp.hourlyPayout)
          : (ratesLookup?.phraseRates?.[String(proj.subprojectId)] || 25);
      }

      list.push({
        category: proj.category,
        subprojectId: String(proj.subprojectId),
        subprojectName: proj.subprojectName || `${proj.category} (${lang})`,
        language: lang,
        projectRate: Number(projectRate) || 25
      });
    }
  }

  return list;
}

// ─── HELPER: Resolve Artist Payrate and Studio Margin for a Project ────────────
export function getArtistRateForProject(artist, category, subprojectId, language, defaultProjectRate) {
  const projRate = Number(defaultProjectRate) || 25;
  if (!artist) {
    return { artistRate: 0, studioRate: projRate, isProjectConfigured: false };
  }

  const ratesList = Array.isArray(artist.projectPayrates) ? artist.projectPayrates : [];
  const langKey = String(language || "").toLowerCase().trim();
  const subIdStr = String(subprojectId || "").trim();

  // 1. Try matching category + subprojectId + language
  let match = ratesList.find((item) => {
    if (item.category !== category) return false;
    const itemSub = String(item.subprojectId || "").trim();
    const subMatch = (itemSub === subIdStr) ||
      (item.subprojectName && subIdStr && item.subprojectName.toLowerCase().includes(subIdStr.toLowerCase())) ||
      (subIdStr && itemSub && (subIdStr.includes(itemSub) || itemSub.includes(subIdStr)));
    if (!subMatch) return false;
    if (langKey && item.language && item.language !== "all") {
      return String(item.language).toLowerCase().trim() === langKey;
    }
    return true;
  });

  // 2. Fallback: match category + language (e.g. if subprojectId format differed slightly)
  if (!match && langKey) {
    match = ratesList.find((item) => {
      if (item.category !== category) return false;
      return String(item.language || "").toLowerCase().trim() === langKey;
    });
  }

  if (match && typeof match.artistRate === "number") {
    const rawRate = Number(match.artistRate);
    const artistRate = Math.max(0, Math.min(rawRate, projRate));
    const studioRate = Math.max(0, Number((projRate - artistRate).toFixed(2)));
    return { artistRate, studioRate, isProjectConfigured: true };
  }

  // 3. Fallback to artist's legacy base rate
  const fallback = Number(artist.hourlyPhrasePayrate || artist.perCallPayrate) || 0;
  const artistRate = Math.max(0, Math.min(fallback, projRate));
  const studioRate = Math.max(0, Number((projRate - artistRate).toFixed(2)));
  return { artistRate, studioRate, isProjectConfigured: false };
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
    const [vendors, ratesLookup, allPayouts] = await Promise.all([
      Vendor.find({}).sort({ createdAt: -1 }).lean(),
      getProjectRatesLookup(),
      VendorPayout.find({}).lean()
    ]);

    const payoutMap = new Map();
    allPayouts.forEach((p) => {
      const vid = String(p.vendorId);
      payoutMap.set(vid, (payoutMap.get(vid) || 0) + (Number(p.amountUsd) || 0));
    });

    // Calculate aggregated community and performance statistics for each vendor
    const enrichedVendors = await Promise.all(
      vendors.map(async (vendor) => {
        const vendorUsers = await User.find({ vendorId: vendor._id })
          .select("_id perCallPayrate hourlyPhrasePayrate projectPayrates")
          .lean();
        const userIds = vendorUsers.map((u) => u._id);
        const totalWorkers = userIds.length;

        const userMap = new Map();
        vendorUsers.forEach((u) => {
          userMap.set(String(u._id), u);
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
          }).select("duration companyId contributorId language artistRate studioRate projectRate").lean();
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
            const matchedProj = assignedProjects.find(pr => doesPhraseMatchVendorProject(p, pr, ratesLookup.companyLookup));
            if (!matchedProj) return;
            if (matchedProj.assignedLanguages && matchedProj.assignedLanguages.length > 0) {
              const langLower = String(p.language || "").toLowerCase().trim();
              if (!matchedProj.assignedLanguages.map(l => l.toLowerCase().trim()).includes(langLower)) return;
            }

            let artistRate;
            let studioRate;
            if (typeof p.studioRate === "number" && typeof p.artistRate === "number") {
              studioRate = p.studioRate;
              artistRate = p.artistRate;
            } else {
              const resolvedComp = resolveCompanyForPhrase(p.companyId, ratesLookup.companyLookup) || resolveCompanyForPhrase(matchedProj.subprojectId, ratesLookup.companyLookup);
              const projectRate = (resolvedComp?.hourlyPayout !== undefined)
                ? Number(resolvedComp.hourlyPayout)
                : (ratesLookup.phraseRates[String(p.companyId).toLowerCase().trim()] || ratesLookup.phraseRates[String(matchedProj.subprojectId)] || 25);
              const userObj = userMap.get(String(p.contributorId));
              const rates = getArtistRateForProject(userObj, "phrase", matchedProj.subprojectId, p.language, projectRate);
              artistRate = rates.artistRate;
              studioRate = rates.studioRate;
            }

            estimatedMarginPayable += durHours * studioRate;
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

            if (userMap.has(idA)) {
              const userObj = userMap.get(idA);
              const { artistRate, studioRate } = getArtistRateForProject(userObj, "call", `call_lang_${langKey}`, langKey, projectRate);
              estimatedMarginPayable += durHours * studioRate;
              totalArtistPayout += durHours * artistRate;
            }

            if (userMap.has(idB)) {
              const userObj = userMap.get(idB);
              const { artistRate, studioRate } = getArtistRateForProject(userObj, "call", `call_lang_${langKey}`, langKey, projectRate);
              estimatedMarginPayable += durHours * studioRate;
              totalArtistPayout += durHours * artistRate;
            }
          });

          // 3. Scripted Calls
          scriptedSubmissions.forEach((sub) => {
            const langKey = String(sub.language || "").toLowerCase().trim();
            const projectRate = ratesLookup.scriptedRates[langKey] || 25;
            const userObj = userMap.get(String(sub.userId));
            const { artistRate, studioRate } = getArtistRateForProject(userObj, "scripted_call", `scripted_lang_${langKey}`, langKey, projectRate);

            (sub.verses || []).forEach((v) => {
              if (v.status === "approved") {
                const durHours = (Number(v.durationSec) || 0) / 3600;
                if (durHours > 0) {
                  estimatedMarginPayable += durHours * studioRate;
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
              const resolvedComp = resolveCompanyForPhrase(proj.subprojectId, ratesLookup.companyLookup);
              const projectRate = (resolvedComp?.hourlyPayout !== undefined)
                ? Number(resolvedComp.hourlyPayout)
                : (ratesLookup.phraseRates[String(proj.subprojectId)] || 25);
              const phrasesForProj = approvedPhrases.filter(p => {
                if (!doesPhraseMatchVendorProject(p, proj, ratesLookup.companyLookup)) return false;
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
        const totalPaidOut = Number((payoutMap.get(String(vendor._id)) || 0).toFixed(2));
        const remainingBalance = Math.max(0, Number((estimatedMarginPayable - totalPaidOut).toFixed(2)));

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
            totalMarginEarned: Number(estimatedMarginPayable.toFixed(2)),
            totalArtistPayout: Number(totalArtistPayout.toFixed(2)),
            totalProjectValue: Number((estimatedMarginPayable + totalArtistPayout).toFixed(2)),
            totalPaidOut,
            remainingBalance
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

// ─── ADMIN: Update Vendor Password ────────────────────────────────────────────
export async function updateVendorPasswordAdmin(req, res) {
  try {
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== "string" || newPassword.trim().length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    vendor.passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    await vendor.save();

    res.json({ ok: true, message: `Password updated successfully for ${vendor.name}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update vendor password: " + err.message });
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

    // Set cookie with cross-origin production configuration
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("vc_vendor_token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
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
        isStudio: Boolean(vendor.isStudio),
        address: vendor.address || "",
        city: vendor.city || "",
        state: vendor.state || "",
        cityState: vendor.cityState || "",
        panOrGst: vendor.panOrGst || vendor.payoutDetails?.panNumber || "",
        agreementSigned: Boolean(vendor.agreementSigned),
        agreementSignedAt: vendor.agreementSignedAt,
        agreementSignatory: vendor.agreementSignatory || "",
        agreementPdfPath: vendor.agreementPdfPath || null,
        payoutDetails: vendor.payoutDetails
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Vendor login failed: " + err.message });
  }
}

// ─── VENDOR PORTAL: Vendor Logout ─────────────────────────────────────────────
export function vendorLogout(req, res) {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie("vc_vendor_token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });
  res.json({ ok: true, message: "Logged out successfully" });
}

// ─── VENDOR PORTAL: Current Vendor Profile & Live Quality Stats ───────────────
export async function getVendorMe(req, res) {
  try {
    const vendor = req.vendor;
    const [vendorUsers, ratesLookup] = await Promise.all([
      User.find({ vendorId: vendor._id }).select("_id perCallPayrate hourlyPhrasePayrate projectPayrates").lean(),
      getProjectRatesLookup()
    ]);
    const userIds = vendorUsers.map((u) => u._id);

    const userMap = new Map();
    vendorUsers.forEach((u) => {
      userMap.set(String(u._id), u);
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
      }).select("duration companyId contributorId language artistRate studioRate projectRate").lean();
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
        const matchedProj = assignedProjects.find(pr => doesPhraseMatchVendorProject(p, pr, ratesLookup.companyLookup));
        if (!matchedProj) return;
        if (matchedProj.assignedLanguages && matchedProj.assignedLanguages.length > 0) {
          const langLower = String(p.language || "").toLowerCase().trim();
          if (!matchedProj.assignedLanguages.map(l => l.toLowerCase().trim()).includes(langLower)) return;
        }

        let artistRate;
        let studioRate;
        if (typeof p.studioRate === "number" && typeof p.artistRate === "number") {
          studioRate = p.studioRate;
          artistRate = p.artistRate;
        } else {
          const resolvedComp = resolveCompanyForPhrase(p.companyId, ratesLookup.companyLookup) || resolveCompanyForPhrase(matchedProj.subprojectId, ratesLookup.companyLookup);
          const projectRate = (resolvedComp?.hourlyPayout !== undefined)
            ? Number(resolvedComp.hourlyPayout)
            : (ratesLookup.phraseRates[String(p.companyId).toLowerCase().trim()] || ratesLookup.phraseRates[String(matchedProj.subprojectId)] || 25);
          const userObj = userMap.get(String(p.contributorId));
          const rates = getArtistRateForProject(userObj, "phrase", matchedProj.subprojectId, p.language, projectRate);
          artistRate = rates.artistRate;
          studioRate = rates.studioRate;
        }

        totalMarginEarned += durHours * studioRate;
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

        if (userMap.has(idA)) {
          const userObj = userMap.get(idA);
          const { artistRate, studioRate } = getArtistRateForProject(userObj, "call", `call_lang_${langKey}`, langKey, projectRate);
          totalMarginEarned += durHours * studioRate;
          totalArtistPayout += durHours * artistRate;
        }

        if (userMap.has(idB)) {
          const userObj = userMap.get(idB);
          const { artistRate, studioRate } = getArtistRateForProject(userObj, "call", `call_lang_${langKey}`, langKey, projectRate);
          totalMarginEarned += durHours * studioRate;
          totalArtistPayout += durHours * artistRate;
        }
      });

      // 3. Scripted Calls
      scriptedSubs.forEach((sub) => {
        const langKey = String(sub.language || "").toLowerCase().trim();
        const projectRate = ratesLookup.scriptedRates[langKey] || 25;
        const userObj = userMap.get(String(sub.userId));
        const { artistRate, studioRate } = getArtistRateForProject(userObj, "scripted_call", `scripted_lang_${langKey}`, langKey, projectRate);

        (sub.verses || []).forEach((v) => {
          if (v.status === "approved") {
            const durHours = (Number(v.durationSec) || 0) / 3600;
            if (durHours > 0) {
              totalMarginEarned += durHours * studioRate;
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
          const resolvedComp = resolveCompanyForPhrase(proj.subprojectId, ratesLookup.companyLookup);
          const projectRate = (resolvedComp?.hourlyPayout !== undefined)
            ? Number(resolvedComp.hourlyPayout)
            : (ratesLookup.phraseRates[String(proj.subprojectId)] || 25);
          const phrasesForProj = approvedPhrases.filter(p => {
            if (!doesPhraseMatchVendorProject(p, proj, ratesLookup.companyLookup)) return false;
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

    const vendorPayouts = await VendorPayout.find({ vendorId: vendor._id })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();
    const totalPaidOut = vendorPayouts.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0);
    const remainingBalance = Math.max(0, Number((totalMarginEarned - totalPaidOut).toFixed(2)));

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
        address: vendor.address || "",
        city: vendor.city || "",
        state: vendor.state || "",
        cityState: vendor.cityState || "",
        panOrGst: vendor.panOrGst || vendor.payoutDetails?.panNumber || "",
        agreementSigned: Boolean(vendor.agreementSigned),
        agreementSignedAt: vendor.agreementSignedAt,
        agreementSignatory: vendor.agreementSignatory || "",
        agreementPdfPath: vendor.agreementPdfPath || null,
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
        totalProjectValue: Number((totalMarginEarned + totalArtistPayout).toFixed(2)),
        totalPaidOut: Number(totalPaidOut.toFixed(2)),
        remainingBalance,
        payoutHistory: vendorPayouts
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
      .select("firstname lastname username email mobileNumber speaker_id accountStatus isProfileComplete contributorAgreement upiId perCallPayrate hourlyPhrasePayrate projectPayrates createdAt vendorCode vendorId")
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
          projectPayrates: u.projectPayrates || [],
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

    let initialProjectPayrates = [];
    if (vendor.isStudio) {
      const incomingPayrates = req.body.projectPayrates || req.body.items;
      const ratesLookup = await getProjectRatesLookup();

      if (Array.isArray(incomingPayrates) && incomingPayrates.length > 0) {
        for (const item of incomingPayrates) {
          const { category, subprojectId, language, artistRate } = item;

          // 1. Verify project is allocated to this studio
          const allocProj = (vendor.assignedProjects || []).find(
            (p) => p.category === category && String(p.subprojectId) === String(subprojectId) && p.isActive !== false
          );
          if (!allocProj) {
            return res.status(400).json({
              error: `Project "${item.subprojectName || subprojectId}" is not allocated to your studio.`
            });
          }

          // 2. Verify language is allocated
          let allowedLangs = [];
          if (allocProj.assignedLanguages && allocProj.assignedLanguages.length > 0) {
            allowedLangs = allocProj.assignedLanguages.map((l) => String(l).toLowerCase().trim());
          } else if (allocProj.languageCode) {
            allowedLangs = [String(allocProj.languageCode).toLowerCase().trim()];
          } else if (allocProj.category === "phrase") {
            allowedLangs = ["all"];
          } else {
            allowedLangs = [String(subprojectId).replace(/^(call_lang_|scripted_lang_)/, "").toLowerCase().trim()];
          }

          const itemLangLower = String(language || "").toLowerCase().trim();
          if (allowedLangs.length > 0 && !allowedLangs.includes("all") && !allowedLangs.includes(itemLangLower)) {
            return res.status(400).json({
              error: `Language "${language}" is not allocated to your studio for project "${allocProj.subprojectName}". Allowed: ${allowedLangs.join(", ")}.`
            });
          }

          // 3. Determine project base rate
          let projectRate = 25;
          if (category === "call") {
            projectRate = ratesLookup?.callRates?.[itemLangLower] || 25;
          } else if (category === "scripted_call") {
            projectRate = ratesLookup?.scriptedRates?.[itemLangLower] || 25;
          } else if (category === "phrase") {
            projectRate = ratesLookup?.phraseRates?.[String(subprojectId)] || 25;
          }

          const parsedArtistRate = Number(artistRate);
          if (isNaN(parsedArtistRate) || parsedArtistRate < 0) {
            return res.status(400).json({
              error: `Contributor payrate must be a valid non-negative number for ${allocProj.subprojectName} (${language}).`
            });
          }

          // 4. Rule: Contributor payrate cannot be more than project payrate
          if (parsedArtistRate > projectRate) {
            return res.status(400).json({
              error: `Contributor payrate ($${parsedArtistRate}/hr) cannot exceed project payrate ($${projectRate}/hr) for ${allocProj.subprojectName} (${language}).`
            });
          }

          // 5. Studio payrate = project payrate - contributor payrate
          const studioRate = Math.max(0, Number((projectRate - parsedArtistRate).toFixed(2)));

          initialProjectPayrates.push({
            category,
            subprojectId: String(subprojectId),
            subprojectName: allocProj.subprojectName,
            language: itemLangLower || language,
            projectRate,
            artistRate: parsedArtistRate,
            studioRate
          });
        }
      } else if (vendor.assignedProjects && vendor.assignedProjects.length > 0) {
        try {
          const allocated = getStudioAllocatedProjectsWithLanguages(vendor, ratesLookup);
          initialProjectPayrates = allocated.map((item) => {
            const defaultArtistRate = Math.min(hourlyRate || 18, item.projectRate);
            return {
              category: item.category,
              subprojectId: item.subprojectId,
              subprojectName: item.subprojectName,
              language: item.language,
              projectRate: item.projectRate,
              artistRate: defaultArtistRate,
              studioRate: Math.max(0, Number((item.projectRate - defaultArtistRate).toFixed(2)))
            };
          });
        } catch (e) {
          console.error("Error generating initial project payrates:", e);
        }
      }
    }

    const effectiveHourlyRate = initialProjectPayrates.length > 0
      ? Number((initialProjectPayrates.reduce((sum, p) => sum + p.artistRate, 0) / initialProjectPayrates.length).toFixed(2))
      : hourlyRate;

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
      perCallPayrate: vendor.isStudio ? effectiveHourlyRate : 0,
      hourlyPhrasePayrate: vendor.isStudio ? effectiveHourlyRate : 0,
      projectPayrates: initialProjectPayrates,
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
      projectPayrates: newUser.projectPayrates || [],
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

// ─── VENDOR PORTAL: Get Studio Allocated Projects with Allowed Languages ──────
export async function getAllocatedProjects(req, res) {
  try {
    const vendor = req.vendor;
    const ratesLookup = await getProjectRatesLookup();
    const allocated = getStudioAllocatedProjectsWithLanguages(vendor, ratesLookup);
    res.json({ ok: true, allocatedProjects: allocated });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch allocated projects: " + err.message });
  }
}

// ─── VENDOR PORTAL: Get Project-Wise Artist Payrates ───────────────────────────
export async function getArtistPayrates(req, res) {
  try {
    const vendor = req.vendor;
    if (!vendor.isStudio) {
      return res.status(403).json({ error: "Only Studio partners can configure project-wise artist payrates." });
    }

    const { artistId } = req.params;
    const artist = await User.findOne({ _id: artistId, vendorId: vendor._id }).lean();
    if (!artist) {
      return res.status(404).json({ error: "Artist not found under this studio." });
    }

    const ratesLookup = await getProjectRatesLookup();
    const allocated = getStudioAllocatedProjectsWithLanguages(vendor, ratesLookup);

    const existingRates = Array.isArray(artist.projectPayrates) ? artist.projectPayrates : [];

    const payrates = allocated.map((item) => {
      const existing = existingRates.find((ex) => {
        if (ex.category !== item.category) return false;
        if (String(ex.subprojectId) !== String(item.subprojectId)) return false;
        if (item.language && ex.language && ex.language !== "all") {
          return String(ex.language).toLowerCase().trim() === String(item.language).toLowerCase().trim();
        }
        return true;
      });

      let artistRate = 18;
      if (existing && typeof existing.artistRate === "number") {
        artistRate = existing.artistRate;
      } else {
        const fallback = Number(artist.hourlyPhrasePayrate || artist.perCallPayrate);
        if (!isNaN(fallback) && fallback > 0) {
          artistRate = fallback;
        }
      }

      // Contributor payrate cannot be more than project payrate
      artistRate = Math.max(0, Math.min(artistRate, item.projectRate));
      const studioRate = Math.max(0, Number((item.projectRate - artistRate).toFixed(2)));

      return {
        category: item.category,
        subprojectId: item.subprojectId,
        subprojectName: item.subprojectName,
        language: item.language,
        projectRate: item.projectRate,
        artistRate,
        studioRate
      };
    });

    res.json({
      ok: true,
      artist: {
        _id: artist._id,
        name: `${artist.firstname || ""} ${artist.lastname || ""}`.trim() || artist.username,
        username: artist.username,
        email: artist.email,
        speaker_id: artist.speaker_id || "N/A"
      },
      payrates
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch artist payrates: " + err.message });
  }
}

// ─── VENDOR PORTAL: Contributor Analytics (Project-Wise Breakdown) ───────────
export async function getArtistAnalytics(req, res) {
  try {
    const vendor = req.vendor;
    const { artistId } = req.params;

    const artist = await User.findOne({ _id: artistId, vendorId: vendor._id })
      .select("firstname lastname username email mobileNumber speaker_id accountStatus isProfileComplete contributorAgreement perCallPayrate hourlyPhrasePayrate projectPayrates createdAt")
      .lean();

    if (!artist) {
      return res.status(404).json({ error: "Contributor not found under this vendor account." });
    }

    const [ratesLookup, companies] = await Promise.all([
      getProjectRatesLookup(),
      Company.find({}).select("_id name").lean()
    ]);

    const companyMap = new Map();
    companies.forEach((c) => companyMap.set(String(c._id), c.name));

    const allocatedProjects = getStudioAllocatedProjectsWithLanguages(vendor, ratesLookup);

    // 1. Fetch all phrases for this contributor
    const [approvedPhrases, pendingPhrases, rejectedPhrases] = await Promise.all([
      Phrase.find({ contributorId: artist._id, status: "approved" }).select("companyId language duration text phraseId artistRate studioRate projectRate").lean(),
      Phrase.find({ contributorId: artist._id, status: { $in: ["recorded", "edited"] } }).select("companyId language duration text phraseId").lean(),
      PhraseRejection.find({ contributorId: artist._id }).select("companyId language duration comment text phraseId rejectedAt").sort({ rejectedAt: -1 }).lean()
    ]);

    // 2. Fetch calls for this contributor
    const calls = await CallSession.find({
      $or: [{ userA: artist._id }, { userB: artist._id }],
      callActuallyStarted: true
    }).select("userA userB language callStatus recordingAStatus recordingBStatus actualCallDuration startedAt").lean();

    // 3. Fetch scripted submissions for this contributor
    const scriptedSubs = await ScriptedSubmission.find({ userId: artist._id }).select("language verses createdAt").lean();

    // Project aggregated data map: key = `${category}__${subprojectId}__${language}`
    const projectMap = new Map();

    // Initialize all allocated projects first
    for (const alloc of allocatedProjects) {
      const key = `${alloc.category}__${alloc.subprojectId}__${String(alloc.language).toLowerCase().trim()}`;
      const { artistRate, studioRate } = getArtistRateForProject(artist, alloc.category, alloc.subprojectId, alloc.language, alloc.projectRate);
      projectMap.set(key, {
        category: alloc.category,
        subprojectId: alloc.subprojectId,
        subprojectName: alloc.subprojectName,
        language: alloc.language,
        projectRate: alloc.projectRate,
        artistRate,
        studioRate,
        approvedCount: 0,
        approvedDurationSec: 0,
        pendingCount: 0,
        pendingDurationSec: 0,
        rejectedCount: 0,
        rejectionComments: [],
        accumulatedEarnings: 0,
        accumulatedMargin: 0
      });
    }

    const findOrCreatePhraseItem = (p, lang) => {
      const pComp = resolveCompanyForPhrase(p.companyId, ratesLookup.companyLookup);
      const canonicalSubId = pComp ? String(pComp._id) : String(p.companyId || "general");
      const nameKey = pComp ? String(pComp.name).toLowerCase().trim() : "";

      let item = projectMap.get(`phrase__${canonicalSubId}__${lang}`) ||
                 projectMap.get(`phrase__${canonicalSubId}__all`) ||
                 (nameKey && projectMap.get(`phrase__${nameKey}__${lang}`)) ||
                 (nameKey && projectMap.get(`phrase__${nameKey}__all`)) ||
                 projectMap.get(`phrase__${String(p.companyId)}__${lang}`) ||
                 projectMap.get(`phrase__${String(p.companyId)}__all`);

      if (!item) {
        for (const existingItem of projectMap.values()) {
          if (existingItem.category === "phrase") {
            const fakeProj = {
              category: "phrase",
              subprojectId: existingItem.subprojectId,
              subprojectName: existingItem.subprojectName,
              assignedLanguages: [existingItem.language],
              isActive: true
            };
            if (doesPhraseMatchVendorProject(p, fakeProj, ratesLookup.companyLookup)) {
              if (existingItem.language === "all" || existingItem.language.toLowerCase() === lang.toLowerCase()) {
                item = existingItem;
                break;
              }
            }
          }
        }
      }

      if (!item) {
        const subId = canonicalSubId;
        const compName = pComp ? (pComp.projectName ? `${pComp.name} (${pComp.projectName})` : pComp.name) : (companyMap.get(subId) || `Phrase Project (${subId})`);
        const defaultRate = (pComp?.hourlyPayout !== undefined) ? Number(pComp.hourlyPayout) : (ratesLookup?.phraseRates?.[subId] || 25);
        const { artistRate, studioRate } = getArtistRateForProject(artist, "phrase", subId, lang, defaultRate);
        item = {
          category: "phrase",
          subprojectId: subId,
          subprojectName: compName,
          language: lang,
          projectRate: defaultRate,
          artistRate,
          studioRate,
          approvedCount: 0,
          approvedDurationSec: 0,
          pendingCount: 0,
          pendingDurationSec: 0,
          rejectedCount: 0,
          rejectionComments: [],
          accumulatedEarnings: 0,
          accumulatedMargin: 0
        };
        projectMap.set(`phrase__${subId}__${lang}`, item);
      }
      return item;
    };

    for (const p of approvedPhrases) {
      const lang = String(p.language || "all").toLowerCase().trim();
      const item = findOrCreatePhraseItem(p, lang);
      item.approvedCount += 1;
      const durSec = Number(p.duration) || 0;
      item.approvedDurationSec += durSec;
      const durHours = durSec / 3600;
      const pArtistRate = (typeof p.artistRate === "number") ? p.artistRate : item.artistRate;
      const pStudioRate = (typeof p.studioRate === "number") ? p.studioRate : item.studioRate;
      item.accumulatedEarnings = (item.accumulatedEarnings || 0) + (durHours * pArtistRate);
      item.accumulatedMargin = (item.accumulatedMargin || 0) + (durHours * pStudioRate);
    }

    for (const p of pendingPhrases) {
      const lang = String(p.language || "all").toLowerCase().trim();
      const item = findOrCreatePhraseItem(p, lang);
      item.pendingCount += 1;
      item.pendingDurationSec += (Number(p.duration) || 0);
    }

    for (const rej of rejectedPhrases) {
      const lang = String(rej.language || "all").toLowerCase().trim();
      const item = findOrCreatePhraseItem(rej, lang);
      item.rejectedCount += 1;
      if (rej.comment && item.rejectionComments.length < 5) {
        item.rejectionComments.push({
          comment: rej.comment,
          text: rej.text,
          rejectedAt: rej.rejectedAt
        });
      }
    }

    // Process Calls
    for (const c of calls) {
      const lang = String(c.language || "english").toLowerCase().trim();
      const subId = `call_lang_${lang}`;
      const key = `call__${subId}__${lang}`;
      let item = projectMap.get(key);
      if (!item) {
        const defaultRate = ratesLookup?.callRates?.[lang] || 25;
        const { artistRate, studioRate } = getArtistRateForProject(artist, "call", subId, lang, defaultRate);
        item = {
          category: "call",
          subprojectId: subId,
          subprojectName: `Conversational Call (${lang.toUpperCase()})`,
          language: lang,
          projectRate: defaultRate,
          artistRate,
          studioRate,
          approvedCount: 0,
          approvedDurationSec: 0,
          pendingCount: 0,
          pendingDurationSec: 0,
          rejectedCount: 0,
          rejectionComments: [],
          accumulatedEarnings: 0,
          accumulatedMargin: 0
        };
        projectMap.set(key, item);
      }

      const isA = String(c.userA) === String(artist._id);
      const userStatus = isA ? (c.recordingAStatus || c.callStatus) : (c.recordingBStatus || c.callStatus);
      const dur = Number(c.actualCallDuration) || 0;

      if (userStatus === "approved") {
        item.approvedCount += 1;
        item.approvedDurationSec += dur;
        const durHours = dur / 3600;
        item.accumulatedEarnings = (item.accumulatedEarnings || 0) + (durHours * item.artistRate);
        item.accumulatedMargin = (item.accumulatedMargin || 0) + (durHours * item.studioRate);
      } else if (userStatus === "rejected") {
        item.rejectedCount += 1;
      } else {
        item.pendingCount += 1;
        item.pendingDurationSec += dur;
      }
    }

    // Process Scripted Calls
    for (const sub of scriptedSubs) {
      const lang = String(sub.language || "english").toLowerCase().trim();
      const subId = `scripted_lang_${lang}`;
      const key = `scripted_call__${subId}__${lang}`;
      let item = projectMap.get(key);
      if (!item) {
        const defaultRate = ratesLookup?.scriptedRates?.[lang] || 25;
        const { artistRate, studioRate } = getArtistRateForProject(artist, "scripted_call", subId, lang, defaultRate);
        item = {
          category: "scripted_call",
          subprojectId: subId,
          subprojectName: `Scripted Call (${lang.toUpperCase()})`,
          language: lang,
          projectRate: defaultRate,
          artistRate,
          studioRate,
          approvedCount: 0,
          approvedDurationSec: 0,
          pendingCount: 0,
          pendingDurationSec: 0,
          rejectedCount: 0,
          rejectionComments: [],
          accumulatedEarnings: 0,
          accumulatedMargin: 0
        };
        projectMap.set(key, item);
      }

      for (const v of sub.verses || []) {
        const vDur = Number(v.durationSec) || 0;
        if (v.status === "approved") {
          item.approvedCount += 1;
          item.approvedDurationSec += vDur;
          const durHours = vDur / 3600;
          item.accumulatedEarnings = (item.accumulatedEarnings || 0) + (durHours * item.artistRate);
          item.accumulatedMargin = (item.accumulatedMargin || 0) + (durHours * item.studioRate);
        } else if (v.status === "rejected") {
          item.rejectedCount += 1;
          if (v.rejectionReason && item.rejectionComments.length < 5) {
            item.rejectionComments.push({
              comment: v.rejectionReason,
              text: v.text,
              rejectedAt: v.reviewedAt || sub.createdAt
            });
          }
        } else {
          item.pendingCount += 1;
          item.pendingDurationSec += vDur;
        }
      }
    }

    // Format project list
    const projectBreakdown = Array.from(projectMap.values()).map((p) => {
      const totalSubmitted = p.approvedCount + p.pendingCount + p.rejectedCount;
      const approvedHours = Number((p.approvedDurationSec / 3600).toFixed(2));
      const evaluated = p.approvedCount + p.rejectedCount;
      const approvalRate = evaluated > 0 ? Number(((p.approvedCount / evaluated) * 100).toFixed(1)) : 0;
      const estimatedEarnings = (p.accumulatedEarnings !== undefined && p.accumulatedEarnings > 0)
        ? Number(p.accumulatedEarnings.toFixed(2))
        : Number((approvedHours * p.artistRate).toFixed(2));
      const estimatedMargin = (p.accumulatedMargin !== undefined && p.accumulatedMargin > 0)
        ? Number(p.accumulatedMargin.toFixed(2))
        : Number((approvedHours * p.studioRate).toFixed(2));

      return {
        category: p.category,
        subprojectId: p.subprojectId,
        subprojectName: p.subprojectName,
        language: p.language,
        projectRate: p.projectRate,
        artistRate: p.artistRate,
        studioRate: p.studioRate,
        totalSubmitted,
        approved: p.approvedCount,
        approvedHours,
        pending: p.pendingCount,
        rejected: p.rejectedCount,
        approvalRate,
        estimatedEarnings,
        estimatedMargin,
        rejectionComments: p.rejectionComments
      };
    });

    // Calculate overall totals
    let totalDone = 0;
    let totalApproved = 0;
    let totalApprovedDurationSec = 0;
    let totalPending = 0;
    let totalRejected = 0;
    let totalEstimatedEarnings = 0;
    let totalStudioMargin = 0;

    for (const pb of projectBreakdown) {
      totalDone += pb.totalSubmitted;
      totalApproved += pb.approved;
      totalApprovedDurationSec += (pb.approvedHours * 3600);
      totalPending += pb.pending;
      totalRejected += pb.rejected;
      totalEstimatedEarnings += pb.estimatedEarnings;
      totalStudioMargin += (pb.estimatedMargin || 0);
    }

    const totalEvaluated = totalApproved + totalRejected;
    const overallApprovalRate = totalEvaluated > 0 ? Number(((totalApproved / totalEvaluated) * 100).toFixed(1)) : 0;
    const totalApprovedHours = Number((totalApprovedDurationSec / 3600).toFixed(2));

    // Compile recent rejections list across all tasks
    const recentRejections = rejectedPhrases.slice(0, 10).map((r) => ({
      taskType: "phrase",
      taskId: r.phraseId,
      comment: r.comment || "QA Quality Criteria not met",
      text: r.text || "—",
      rejectedAt: r.rejectedAt
    }));

    res.json({
      ok: true,
      artist: {
        _id: artist._id,
        name: `${artist.firstname || ""} ${artist.lastname || ""}`.trim() || artist.username,
        username: artist.username,
        email: artist.email,
        mobileNumber: artist.mobileNumber,
        speaker_id: artist.speaker_id || "N/A",
        accountStatus: artist.accountStatus,
        isProfileComplete: Boolean(artist.isProfileComplete),
        joinedAt: artist.createdAt
      },
      summary: {
        totalDone,
        totalApproved,
        totalApprovedHours,
        totalPending,
        totalRejected,
        overallApprovalRate,
        totalEstimatedEarnings: Number(totalEstimatedEarnings.toFixed(2))
      },
      projectBreakdown,
      recentRejections
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contributor analytics: " + err.message });
  }
}

// ─── VENDOR PORTAL: Update Project-Wise Artist Payrates ─────────────────────────
export async function updateArtistPayrates(req, res) {
  try {
    const vendor = req.vendor;
    if (!vendor.isStudio) {
      return res.status(403).json({ error: "Only Studio partners can customize artist payrates." });
    }

    const { artistId } = req.params;
    const artist = await User.findOne({ _id: artistId, vendorId: vendor._id });
    if (!artist) {
      return res.status(404).json({ error: "Artist not found under this studio." });
    }

    const ratesLookup = await getProjectRatesLookup();
    const incoming = req.body.items || req.body.payrates;

    if (!Array.isArray(incoming)) {
      // Fallback single rate update for backwards compatibility
      const { artistHourlyPayrate, perCallPayrate, hourlyPhrasePayrate } = req.body;
      const hourlyRate = Number(artistHourlyPayrate !== undefined ? artistHourlyPayrate : (hourlyPhrasePayrate !== undefined ? hourlyPhrasePayrate : perCallPayrate)) || 0;
      artist.perCallPayrate = hourlyRate;
      artist.hourlyPhrasePayrate = hourlyRate;
      await artist.save();
      return res.json({ ok: true, artist });
    }

    const updatedProjectPayrates = [];

    for (const item of incoming) {
      const { category, subprojectId, language, artistRate } = item;

      // 1. Check if the project is allocated to this studio
      const allocatedProject = (vendor.assignedProjects || []).find(
        (p) => p.category === category && String(p.subprojectId) === String(subprojectId) && p.isActive !== false
      );

      if (!allocatedProject) {
        return res.status(400).json({
          error: `Project "${item.subprojectName || subprojectId}" is not allocated to your studio.`
        });
      }

      // 2. Check if the language is allocated for this project
      let allowedLangs = [];
      if (allocatedProject.assignedLanguages && allocatedProject.assignedLanguages.length > 0) {
        allowedLangs = allocatedProject.assignedLanguages.map((l) => String(l).toLowerCase().trim());
      } else if (allocatedProject.languageCode) {
        allowedLangs = [String(allocatedProject.languageCode).toLowerCase().trim()];
      } else if (allocatedProject.category === "phrase") {
        allowedLangs = ["all"];
      } else {
        allowedLangs = [String(subprojectId).replace(/^(call_lang_|scripted_lang_)/, "").toLowerCase().trim()];
      }

      const itemLangLower = String(language || "").toLowerCase().trim();
      if (allowedLangs.length > 0 && !allowedLangs.includes("all") && !allowedLangs.includes(itemLangLower)) {
        return res.status(400).json({
          error: `Language "${language}" is not allocated to your studio for project "${allocatedProject.subprojectName}". You can only configure: ${allowedLangs.join(", ")}.`
        });
      }

      // 3. Determine project base rate
      let projectRate = 25;
      if (category === "call") {
        projectRate = ratesLookup?.callRates?.[itemLangLower] || 25;
      } else if (category === "scripted_call") {
        projectRate = ratesLookup?.scriptedRates?.[itemLangLower] || 25;
      } else if (category === "phrase") {
        projectRate = ratesLookup?.phraseRates?.[String(subprojectId)] || 25;
      }

      const parsedArtistRate = Number(artistRate);
      if (isNaN(parsedArtistRate) || parsedArtistRate < 0) {
        return res.status(400).json({
          error: `Contributor payrate must be a valid non-negative number for ${allocatedProject.subprojectName} (${language}).`
        });
      }

      // 4. Rule: Contributor payrate cannot exceed project base payrate
      if (parsedArtistRate > projectRate) {
        return res.status(400).json({
          error: `Contributor payrate ($${parsedArtistRate}/hr) cannot exceed project payrate ($${projectRate}/hr) for ${allocatedProject.subprojectName} (${language}).`
        });
      }

      // 5. Studio payrate = project payrate - contributor payrate
      const studioRate = Math.max(0, Number((projectRate - parsedArtistRate).toFixed(2)));

      updatedProjectPayrates.push({
        category,
        subprojectId: String(subprojectId),
        subprojectName: allocatedProject.subprojectName,
        language: itemLangLower || language,
        projectRate,
        artistRate: parsedArtistRate,
        studioRate
      });
    }

    // Save to artist
    artist.projectPayrates = updatedProjectPayrates;

    // Keep legacy summary rates in sync
    if (updatedProjectPayrates.length > 0) {
      const avgRate = Number(
        (updatedProjectPayrates.reduce((sum, p) => sum + p.artistRate, 0) / updatedProjectPayrates.length).toFixed(2)
      );
      artist.perCallPayrate = avgRate;
      artist.hourlyPhrasePayrate = avgRate;
    }

    await artist.save();

    res.json({
      ok: true,
      artist,
      projectPayrates: artist.projectPayrates
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update artist payrates: " + err.message });
  }
}

export const updateArtistPayrate = updateArtistPayrates;

// ─── VENDOR PORTAL: Assigned Projects & Quota ─────────────────────────────────
export async function getVendorProjects(req, res) {
  try {
    const vendor = req.vendor;
    const [vendorUsers, ratesLookup] = await Promise.all([
      User.find({ vendorId: vendor._id }).select("_id perCallPayrate hourlyPhrasePayrate projectPayrates").lean(),
      getProjectRatesLookup()
    ]);
    const userIds = vendorUsers.map((u) => u._id);

    const userMap = new Map();
    vendorUsers.forEach((u) => {
      userMap.set(String(u._id), u);
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

              if (userMap.has(idA)) {
                const userObj = userMap.get(idA);
                const { artistRate, studioRate } = getArtistRateForProject(userObj, "call", proj.subprojectId, langCode, projectRate);
                accumulatedMargin += durHours * studioRate;
                accumulatedArtistPayout += durHours * artistRate;
              }

              if (userMap.has(idB)) {
                const userObj = userMap.get(idB);
                const { artistRate, studioRate } = getArtistRateForProject(userObj, "call", proj.subprojectId, langCode, projectRate);
                accumulatedMargin += durHours * studioRate;
                accumulatedArtistPayout += durHours * artistRate;
              }
            });

            rejectedUnits = await CallSession.countDocuments({
              $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
              language: { $regex: new RegExp(`^${langCode}$`, 'i') },
              callStatus: "rejected"
            });
          } else if (proj.category === "phrase") {
            const resolvedComp = resolveCompanyForPhrase(proj.subprojectId, ratesLookup.companyLookup);
            projectRate = (resolvedComp?.hourlyPayout !== undefined)
              ? Number(resolvedComp.hourlyPayout)
              : (ratesLookup.phraseRates[String(proj.subprojectId)] || 25);

            const compIds = [String(proj.subprojectId)];
            if (resolvedComp) {
              if (resolvedComp._id) compIds.push(String(resolvedComp._id));
              if (resolvedComp.name) compIds.push(resolvedComp.name);
              if (resolvedComp.projectName) compIds.push(resolvedComp.projectName);
            }

            const phraseQuery = {
              companyId: { $in: compIds },
              contributorId: { $in: userIds },
              status: "approved"
            };
            const rejectionQuery = {
              companyId: { $in: compIds },
              contributorId: { $in: userIds }
            };

            if (proj.assignedLanguages && proj.assignedLanguages.length > 0) {
              const langRegexes = proj.assignedLanguages.map((l) => new RegExp(`^${l}$`, "i"));
              phraseQuery.language = { $in: langRegexes };
              rejectionQuery.language = { $in: langRegexes };
            }

            const approvedPhrases = await Phrase.find(phraseQuery)
              .select("duration contributorId language artistRate studioRate projectRate")
              .lean();

            approvedPhrases.forEach((p) => {
              const durHours = (Number(p.duration) || 0) / 3600;
              if (durHours <= 0) return;
              approvedUnits += durHours;

              let artistRate;
              let studioRate;
              if (typeof p.studioRate === "number" && typeof p.artistRate === "number") {
                studioRate = p.studioRate;
                artistRate = p.artistRate;
              } else {
                const userObj = userMap.get(String(p.contributorId));
                const rates = getArtistRateForProject(userObj, "phrase", proj.subprojectId, p.language, projectRate);
                artistRate = rates.artistRate;
                studioRate = rates.studioRate;
              }
              accumulatedMargin += durHours * studioRate;
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
              const userObj = userMap.get(String(sub.userId));
              const { artistRate, studioRate } = getArtistRateForProject(userObj, "scripted_call", proj.subprojectId, langCode, projectRate);

              (sub.verses || []).forEach((v) => {
                if (v.status === "approved") {
                  const durHours = (Number(v.durationSec) || 0) / 3600;
                  if (durHours > 0) {
                    approvedUnits += durHours;
                    accumulatedMargin += durHours * studioRate;
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

// ─── VENDOR PORTAL: Project Squad Analytics & Contributor Breakdown ─────────
export async function getProjectSquadSummary(req, res) {
  try {
    const vendor = req.vendor;
    const { subprojectId } = req.params;
    const categoryQuery = req.query.category;

    // Find the project configuration in vendor.assignedProjects
    const assignedProj = (vendor.assignedProjects || []).find(
      (p) => String(p.subprojectId) === String(subprojectId) && (!categoryQuery || p.category === categoryQuery)
    );

    const category = assignedProj?.category || (
      String(subprojectId).startsWith("call_lang_") ? "call"
      : String(subprojectId).startsWith("scripted_lang_") ? "scripted_call"
      : "phrase"
    );

    const [vendorUsers, ratesLookup, companies] = await Promise.all([
      User.find({ vendorId: vendor._id })
        .select("firstname lastname username email mobileNumber speaker_id accountStatus isProfileComplete perCallPayrate hourlyPhrasePayrate projectPayrates createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      getProjectRatesLookup(),
      Company.find({}).select("_id name projectName").lean()
    ]);

    const companyMap = new Map();
    companies.forEach((c) => companyMap.set(String(c._id), c.projectName || c.name));

    const userIds = vendorUsers.map((u) => u._id);
    const userMap = new Map();
    vendorUsers.forEach((u) => userMap.set(String(u._id), u));

    // Determine project base rate
    let projectRate = 25;
    let projectName = assignedProj?.subprojectName || "Project";
    let assignedLanguages = assignedProj?.assignedLanguages || [];

    if (category === "call") {
      const langCode = String(assignedProj?.languageCode || subprojectId.replace('call_lang_', '')).toLowerCase().trim();
      projectRate = ratesLookup.callRates[langCode] || 25;
      if (!projectName || projectName === "Project") {
        projectName = `Conversational Call (${langCode.toUpperCase()})`;
      }
      if (assignedLanguages.length === 0) assignedLanguages = [langCode];
    } else if (category === "scripted_call") {
      const langCode = String(assignedProj?.languageCode || subprojectId.replace('scripted_lang_', '')).toLowerCase().trim();
      projectRate = ratesLookup.scriptedRates[langCode] || 25;
      if (!projectName || projectName === "Project") {
        projectName = `Scripted Call (${langCode.toUpperCase()})`;
      }
      if (assignedLanguages.length === 0) assignedLanguages = [langCode];
    } else {
      const resolvedComp = resolveCompanyForPhrase(subprojectId, ratesLookup.companyLookup);
      projectRate = (resolvedComp?.hourlyPayout !== undefined)
        ? Number(resolvedComp.hourlyPayout)
        : (ratesLookup.phraseRates[String(subprojectId)] || 25);
      if (!projectName || projectName === "Project") {
        projectName = resolvedComp ? (resolvedComp.projectName ? `${resolvedComp.name} (${resolvedComp.projectName})` : resolvedComp.name) : (companyMap.get(String(subprojectId)) || `Phrase Project (${subprojectId})`);
      }
      if (assignedLanguages.length === 0) assignedLanguages = ["all"];
    }

    // Initialize contributor squad data structures
    const squadMap = new Map();

    // Pre-initialize all vendor squad members so even members with 0 tasks appear in the squad list
    for (const u of vendorUsers) {
      const { artistRate, studioRate } = getArtistRateForProject(
        u,
        category,
        subprojectId,
        assignedLanguages[0] || "all",
        projectRate
      );

      squadMap.set(String(u._id), {
        _id: u._id,
        name: `${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username,
        username: u.username,
        email: u.email,
        mobileNumber: u.mobileNumber || "N/A",
        speaker_id: u.speaker_id || "N/A",
        accountStatus: u.accountStatus || "pending_intro",
        isProfileComplete: Boolean(u.isProfileComplete),
        joinedAt: u.createdAt,
        languages: new Set(),
        totalSubmitted: 0,
        approvedCount: 0,
        approvedDurationSec: 0,
        approvedHours: 0,
        pendingCount: 0,
        pendingDurationSec: 0,
        rejectedCount: 0,
        rejectedDurationSec: 0,
        artistRate,
        studioRate,
        accumulatedEarnedAmount: 0,
        accumulatedMarginAmount: 0,
        rejectionComments: []
      });
    }

    // 1. Fetch & process tasks based on category
    if (category === "phrase") {
      const resolvedComp = resolveCompanyForPhrase(subprojectId, ratesLookup.companyLookup);
      const compIds = [String(subprojectId)];
      if (resolvedComp) {
        if (resolvedComp._id) compIds.push(String(resolvedComp._id));
        if (resolvedComp.name) compIds.push(resolvedComp.name);
        if (resolvedComp.projectName) compIds.push(resolvedComp.projectName);
      }

      const phraseQuery = {
        companyId: { $in: compIds },
        contributorId: { $in: userIds }
      };
      const rejQuery = {
        companyId: { $in: compIds },
        contributorId: { $in: userIds }
      };

      const [approvedPhrases, pendingPhrases, rejectedPhrases] = await Promise.all([
        Phrase.find({ ...phraseQuery, status: "approved" }).select("contributorId language duration text phraseId artistRate studioRate projectRate").lean(),
        Phrase.find({ ...phraseQuery, status: { $in: ["recorded", "edited"] } }).select("contributorId language duration text phraseId").lean(),
        PhraseRejection.find(rejQuery).select("contributorId language duration comment text phraseId rejectedAt").sort({ rejectedAt: -1 }).lean()
      ]);

      for (const p of approvedPhrases) {
        const uId = String(p.contributorId);
        const item = squadMap.get(uId);
        if (item) {
          item.approvedCount += 1;
          const durSec = (Number(p.duration) || 0);
          item.approvedDurationSec += durSec;
          if (p.language) item.languages.add(String(p.language).toLowerCase());
          const durHours = durSec / 3600;
          const pArtistRate = (typeof p.artistRate === "number") ? p.artistRate : item.artistRate;
          const pStudioRate = (typeof p.studioRate === "number") ? p.studioRate : item.studioRate;
          item.accumulatedEarnedAmount += (durHours * pArtistRate);
          item.accumulatedMarginAmount += (durHours * pStudioRate);
        }
      }

      for (const p of pendingPhrases) {
        const uId = String(p.contributorId);
        const item = squadMap.get(uId);
        if (item) {
          item.pendingCount += 1;
          item.pendingDurationSec += (Number(p.duration) || 0);
          if (p.language) item.languages.add(String(p.language).toLowerCase());
        }
      }

      for (const rej of rejectedPhrases) {
        const uId = String(rej.contributorId);
        const item = squadMap.get(uId);
        if (item) {
          item.rejectedCount += 1;
          item.rejectedDurationSec += (Number(rej.duration) || 0);
          if (rej.language) item.languages.add(String(rej.language).toLowerCase());
          if (rej.comment && item.rejectionComments.length < 5) {
            item.rejectionComments.push({
              comment: rej.comment,
              text: rej.text,
              phraseId: rej.phraseId,
              rejectedAt: rej.rejectedAt
            });
          }
        }
      }
    } else if (category === "call") {
      const langCode = String(assignedProj?.languageCode || subprojectId.replace('call_lang_', '')).toLowerCase().trim();
      const calls = await CallSession.find({
        $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
        language: { $regex: new RegExp(`^${langCode}$`, 'i') },
        callActuallyStarted: true
      }).select("userA userB language callStatus recordingAStatus recordingBStatus actualCallDuration startedAt").lean();

      for (const c of calls) {
        const dur = Number(c.actualCallDuration) || 0;
        const idA = String(c.userA);
        const idB = String(c.userB);

        if (squadMap.has(idA)) {
          const item = squadMap.get(idA);
          const st = c.recordingAStatus || c.callStatus;
          item.languages.add(String(c.language).toLowerCase());
          if (st === "approved") {
            item.approvedCount += 1;
            item.approvedDurationSec += dur;
            const durHours = dur / 3600;
            item.accumulatedEarnedAmount += (durHours * item.artistRate);
            item.accumulatedMarginAmount += (durHours * item.studioRate);
          } else if (st === "rejected") {
            item.rejectedCount += 1;
          } else {
            item.pendingCount += 1;
            item.pendingDurationSec += dur;
          }
        }

        if (squadMap.has(idB)) {
          const item = squadMap.get(idB);
          const st = c.recordingBStatus || c.callStatus;
          item.languages.add(String(c.language).toLowerCase());
          if (st === "approved") {
            item.approvedCount += 1;
            item.approvedDurationSec += dur;
            const durHours = dur / 3600;
            item.accumulatedEarnedAmount += (durHours * item.artistRate);
            item.accumulatedMarginAmount += (durHours * item.studioRate);
          } else if (st === "rejected") {
            item.rejectedCount += 1;
          } else {
            item.pendingCount += 1;
            item.pendingDurationSec += dur;
          }
        }
      }
    } else if (category === "scripted_call") {
      const langCode = String(assignedProj?.languageCode || subprojectId.replace('scripted_lang_', '')).toLowerCase().trim();
      const subs = await ScriptedSubmission.find({
        userId: { $in: userIds },
        language: { $regex: new RegExp(`^${langCode}$`, 'i') }
      }).select("userId language verses createdAt").lean();

      for (const sub of subs) {
        const uId = String(sub.userId);
        const item = squadMap.get(uId);
        if (item) {
          item.languages.add(String(sub.language).toLowerCase());
          for (const v of sub.verses || []) {
            const vDur = Number(v.durationSec) || 0;
            if (v.status === "approved") {
              item.approvedCount += 1;
              item.approvedDurationSec += vDur;
              const durHours = vDur / 3600;
              item.accumulatedEarnedAmount += (durHours * item.artistRate);
              item.accumulatedMarginAmount += (durHours * item.studioRate);
            } else if (v.status === "rejected") {
              item.rejectedCount += 1;
              if (v.rejectionReason && item.rejectionComments.length < 5) {
                item.rejectionComments.push({
                  comment: v.rejectionReason,
                  text: v.text,
                  rejectedAt: v.reviewedAt || sub.createdAt
                });
              }
            } else {
              item.pendingCount += 1;
              item.pendingDurationSec += vDur;
            }
          }
        }
      }
    }

    // Final calculations for each contributor
    const squadList = Array.from(squadMap.values()).map((member) => {
      const totalSubmitted = member.approvedCount + member.pendingCount + member.rejectedCount;
      const approvedHours = Number((member.approvedDurationSec / 3600).toFixed(2));
      const evaluated = member.approvedCount + member.rejectedCount;
      const approvalRate = evaluated > 0 ? Number(((member.approvedCount / evaluated) * 100).toFixed(1)) : 0;
      const rejectionRate = evaluated > 0 ? Number(((member.rejectedCount / evaluated) * 100).toFixed(1)) : 0;

      const earnedAmount = (member.accumulatedEarnedAmount !== undefined && member.accumulatedEarnedAmount > 0)
        ? Number(member.accumulatedEarnedAmount.toFixed(2))
        : Number((approvedHours * member.artistRate).toFixed(2));
      const marginAmount = (member.accumulatedMarginAmount !== undefined && member.accumulatedMarginAmount > 0)
        ? Number(member.accumulatedMarginAmount.toFixed(2))
        : Number((approvedHours * member.studioRate).toFixed(2));

      return {
        ...member,
        languages: Array.from(member.languages),
        totalSubmitted,
        approvedHours,
        approvalRate,
        rejectionRate,
        earnedAmount,
        marginAmount
      };
    });

    // Sort squad: contributors who have done tasks first (descending by totalSubmitted, then approvedHours)
    squadList.sort((a, b) => {
      if (b.totalSubmitted !== a.totalSubmitted) return b.totalSubmitted - a.totalSubmitted;
      return b.approvedHours - a.approvedHours;
    });

    // Calculate project overall totals across all squad members
    let totalDone = 0;
    let totalApproved = 0;
    let totalApprovedDurationSec = 0;
    let totalPending = 0;
    let totalPendingDurationSec = 0;
    let totalRejected = 0;
    let totalRejectedDurationSec = 0;
    let totalSquadEarnings = 0;
    let totalVendorMargin = 0;

    for (const m of squadList) {
      totalDone += m.totalSubmitted;
      totalApproved += m.approvedCount;
      totalApprovedDurationSec += m.approvedDurationSec;
      totalPending += m.pendingCount;
      totalPendingDurationSec += m.pendingDurationSec;
      totalRejected += m.rejectedCount;
      totalRejectedDurationSec += m.rejectedDurationSec;
      totalSquadEarnings += m.earnedAmount;
      totalVendorMargin += m.marginAmount;
    }

    const totalEvaluated = totalApproved + totalRejected;
    const approvalRate = totalEvaluated > 0 ? Number(((totalApproved / totalEvaluated) * 100).toFixed(1)) : 0;
    const rejectionRate = totalEvaluated > 0 ? Number(((totalRejected / totalEvaluated) * 100).toFixed(1)) : 0;
    const totalApprovedHours = Number((totalApprovedDurationSec / 3600).toFixed(2));

    const activeContributorsCount = squadList.filter((m) => m.totalSubmitted > 0).length;

    res.json({
      ok: true,
      project: {
        category,
        subprojectId,
        subprojectName: projectName,
        projectRate,
        assignedLanguages,
        isStudio: Boolean(vendor.isStudio)
      },
      overview: {
        totalDone,
        totalApproved,
        totalApprovedDurationSec,
        totalApprovedHours,
        totalPending,
        totalPendingDurationSec,
        totalRejected,
        totalRejectedDurationSec,
        approvalRate,
        rejectionRate,
        totalSquadEarnings: Number(totalSquadEarnings.toFixed(2)),
        totalVendorMargin: Number(totalVendorMargin.toFixed(2)),
        totalSquadMembers: squadList.length,
        activeContributorsCount
      },
      squad: squadList
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch project squad analytics: " + err.message });
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

// ─── VENDOR PORTAL: Sign Partner Master Agreement ─────────────────────────────
export async function signVendorAgreement(req, res) {
  try {
    const { signatoryName, phone, address, city, state, cityState, panOrGst, confirmations, signatureDataUrl } = req.body;

    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found." });

    const isStudio = Boolean(vendor.isStudio);

    if (!signatoryName || !signatoryName.trim()) {
      return res.status(400).json({ error: isStudio ? "Authorized signatory full name is required." : "Full name is required." });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: "Mobile number / WhatsApp is required." });
    }

    if (isStudio) {
      // Studio needs GST and registered city and state
      if (!cityState || !cityState.trim()) {
        return res.status(400).json({ error: "Registered City and State is required for studio partners." });
      }
      if (!panOrGst || !panOrGst.trim()) {
        return res.status(400).json({ error: "GST Number or Business PAN is required for studio partners." });
      }
      vendor.cityState = cityState.trim();
      vendor.panOrGst = panOrGst.trim().toUpperCase();
      if (!vendor.payoutDetails) vendor.payoutDetails = {};
      vendor.payoutDetails.panNumber = vendor.panOrGst;
    } else {
      // Sourcing Vendor does NOT need GST / business registration
      // Personal details like address, city, state, mobile number are needed
      if (!address || !address.trim()) {
        return res.status(400).json({ error: "Residential / personal address is required." });
      }
      if (!city || !city.trim()) {
        return res.status(400).json({ error: "City is required." });
      }
      if (!state || !state.trim()) {
        return res.status(400).json({ error: "State is required." });
      }
      vendor.address = address.trim();
      vendor.city = city.trim();
      vendor.state = state.trim();
      vendor.cityState = `${vendor.city}, ${vendor.state}`;
      if (panOrGst && panOrGst.trim()) {
        vendor.panOrGst = panOrGst.trim().toUpperCase();
      }
    }

    // Update common vendor profile details
    vendor.contactPerson = signatoryName.trim();
    vendor.phone = phone.trim();
    vendor.agreementSignatory = signatoryName.trim();
    vendor.agreementSigned = true;
    vendor.agreementSignedAt = new Date();

    // Compile customized PDF via Python generator
    try {
      const pdfPath = await generatePartnerAgreementPdf({
        name: vendor.name,
        signatoryName: vendor.agreementSignatory,
        vendorCode: vendor.vendorCode,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address || "",
        city: vendor.city || "",
        state: vendor.state || "",
        cityState: vendor.cityState || "",
        panOrGst: vendor.panOrGst || "",
        isStudio: isStudio,
        date: vendor.agreementSignedAt.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric"
        })
      });
      vendor.agreementPdfPath = pdfPath;
    } catch (pdfErr) {
      console.error("[signVendorAgreement] PDF Generation warning:", pdfErr.message);
    }

    await vendor.save();

    res.json({
      ok: true,
      message: "Partner Master Agreement executed successfully.",
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        vendorCode: vendor.vendorCode,
        contactPerson: vendor.contactPerson,
        phone: vendor.phone,
        address: vendor.address,
        city: vendor.city,
        state: vendor.state,
        cityState: vendor.cityState,
        panOrGst: vendor.panOrGst,
        agreementSigned: vendor.agreementSigned,
        agreementSignedAt: vendor.agreementSignedAt,
        agreementSignatory: vendor.agreementSignatory,
        isStudio: vendor.isStudio
      }
    });
  } catch (err) {
    console.error("[signVendorAgreement] Error:", err);
    res.status(500).json({ error: "Failed to sign agreement: " + err.message });
  }
}

// ─── VENDOR PORTAL: Download Own Agreement PDF ────────────────────────────────
export async function getVendorAgreementPdf(req, res) {
  try {
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found." });

    if (!vendor.agreementSigned) {
      return res.status(400).json({ error: "Master agreement has not been signed yet." });
    }

    let pdfPath = vendor.agreementPdfPath;
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      // Regenerate on the fly
      pdfPath = await generatePartnerAgreementPdf({
        name: vendor.name,
        signatoryName: vendor.agreementSignatory || vendor.contactPerson,
        vendorCode: vendor.vendorCode,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address || "",
        city: vendor.city || "",
        state: vendor.state || "",
        cityState: vendor.cityState || "",
        panOrGst: vendor.panOrGst || "",
        isStudio: Boolean(vendor.isStudio),
        date: (vendor.agreementSignedAt || new Date()).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric"
        })
      });
      vendor.agreementPdfPath = pdfPath;
      await vendor.save();
    }

    const filename = `${vendor.vendorCode}_${vendor.isStudio ? "Studio" : "Vendor"}_Master_Agreement.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.sendFile(path.resolve(pdfPath));
  } catch (err) {
    console.error("[getVendorAgreementPdf] Error:", err);
    res.status(500).json({ error: "Failed to load agreement PDF: " + err.message });
  }
}

// ─── ADMIN: Download Any Vendor's Agreement PDF ───────────────────────────────
export async function getVendorAgreementPdfAdmin(req, res) {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found." });

    if (!vendor.agreementSigned) {
      return res.status(400).json({ error: "This partner has not signed the master agreement yet." });
    }

    let pdfPath = vendor.agreementPdfPath;
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      // Regenerate on the fly
      pdfPath = await generatePartnerAgreementPdf({
        name: vendor.name,
        signatoryName: vendor.agreementSignatory || vendor.contactPerson,
        vendorCode: vendor.vendorCode,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address || "",
        city: vendor.city || "",
        state: vendor.state || "",
        cityState: vendor.cityState || "",
        panOrGst: vendor.panOrGst || "",
        isStudio: Boolean(vendor.isStudio),
        date: (vendor.agreementSignedAt || new Date()).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric"
        })
      });
      vendor.agreementPdfPath = pdfPath;
      await vendor.save();
    }

    const filename = `${vendor.vendorCode}_${vendor.isStudio ? "Studio" : "Vendor"}_Master_Agreement.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.sendFile(path.resolve(pdfPath));
  } catch (err) {
    console.error("[getVendorAgreementPdfAdmin] Error:", err);
    res.status(500).json({ error: "Failed to load agreement PDF: " + err.message });
  }
}

// ─── ADMIN: Deep Hierarchical Vendor Analytics ───────────────────────────────
// Level 1: Projects Assigned
// Level 2: Languages Assigned
// Level 3: Contributors ("Bande") with Approval & Rejection Ratings
export async function getVendorAnalyticsAdmin(req, res) {
  try {
    const vendor = await Vendor.findById(req.params.id).lean();
    if (!vendor) return res.status(404).json({ error: "Vendor not found." });

    const [ratesLookup, vendorUsers, allCompanies] = await Promise.all([
      getProjectRatesLookup(),
      User.find({ vendorId: vendor._id })
        .select("_id firstname lastname username email mobileNumber speaker_id accountStatus upiId projectPayrates perCallPayrate hourlyPhrasePayrate createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      Company.find({}).select("_id name projectName languages hourlyPayout").lean()
    ]);

    const companyMap = new Map();
    allCompanies.forEach(c => companyMap.set(String(c._id), c));

    const userIds = vendorUsers.map(u => u._id);
    const userMap = new Map();
    vendorUsers.forEach(u => userMap.set(String(u._id), u));

    // Fetch all records for these contributors
    let approvedPhrases = [];
    let pendingPhrases = [];
    let rejectedPhrases = [];
    let calls = [];
    let scriptedSubs = [];

    if (userIds.length > 0) {
      [approvedPhrases, pendingPhrases, rejectedPhrases, calls, scriptedSubs] = await Promise.all([
        Phrase.find({
          contributorId: { $in: userIds },
          status: "approved"
        }).select("_id phraseId companyId contributorId language duration createdAt artistRate studioRate projectRate").lean(),

        Phrase.find({
          contributorId: { $in: userIds },
          status: { $in: ["recorded", "pending", "locked", "edited"] }
        }).select("_id phraseId companyId contributorId language duration createdAt").lean(),

        PhraseRejection.find({
          contributorId: { $in: userIds }
        }).select("_id phraseId companyId contributorId language duration rejectionReason createdAt").lean(),

        CallSession.find({
          $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
          callActuallyStarted: true
        }).select("_id callId actualCallDuration language userA userB callStatus recordingAStatus recordingBStatus createdAt").lean(),

        ScriptedSubmission.find({
          userId: { $in: userIds }
        }).select("_id subtopicId language userId verses createdAt").lean()
      ]);
    }

    // Language Name Formatter
    const LANG_DISPLAY_NAMES = {
      hi: "Hindi",
      en: "English",
      mr: "Marathi",
      bn: "Bengali",
      ta: "Tamil",
      te: "Telugu",
      gu: "Gujarati",
      kn: "Kannada",
      ml: "Malayalam",
      pa: "Punjabi",
      ur: "Urdu",
      or: "Odia",
      as: "Assamese",
      bho: "Bhojpuri",
      mai: "Maithili",
      mag: "Magahi",
      ne: "Nepali",
      sd: "Sindhi",
      sa: "Sanskrit",
      all: "All Languages"
    };

    const getLangLabel = (code) => {
      const c = String(code || "").toLowerCase().trim();
      const name = LANG_DISPLAY_NAMES[c];
      return name ? `${name} (${c})` : (c ? c.charAt(0).toUpperCase() + c.slice(1) : "Default");
    };

    // Index tasks by category, subprojectId, language, and contributorId
    // Key format: `${category}::${subprojectId}::${language}::${contributorId}`
    const taskBuckets = new Map();
    const getBucket = (category, subprojectId, language, contributorId) => {
      const cat = String(category).trim();
      const sub = String(subprojectId).trim();
      const lang = String(language || "default").toLowerCase().trim();
      const uid = String(contributorId).trim();
      const key = `${cat}::${sub}::${lang}::${uid}`;
      if (!taskBuckets.has(key)) {
        taskBuckets.set(key, {
          category: cat,
          subprojectId: sub,
          language: lang,
          contributorId: uid,
          approvedCount: 0,
          rejectedCount: 0,
          pendingCount: 0,
          approvedDurationSec: 0,
          accumulatedMargin: 0,
          accumulatedArtistPayout: 0
        });
      }
      return taskBuckets.get(key);
    };

    // 1. Process Approved Phrases
    approvedPhrases.forEach(p => {
      const b = getBucket("phrase", p.companyId || "unassigned", p.language, p.contributorId);
      b.approvedCount += 1;
      const durSec = (Number(p.duration) || 0);
      b.approvedDurationSec += durSec;
      const durHours = durSec / 3600;
      if (typeof p.studioRate === "number" && typeof p.artistRate === "number") {
        b.accumulatedMargin = (b.accumulatedMargin || 0) + (durHours * p.studioRate);
        b.accumulatedArtistPayout = (b.accumulatedArtistPayout || 0) + (durHours * p.artistRate);
      }
    });

    // 2. Process Pending Phrases
    pendingPhrases.forEach(p => {
      const b = getBucket("phrase", p.companyId || "unassigned", p.language, p.contributorId);
      b.pendingCount += 1;
    });

    // 3. Process Rejected Phrases
    rejectedPhrases.forEach(p => {
      const b = getBucket("phrase", p.companyId || "unassigned", p.language, p.contributorId);
      b.rejectedCount += 1;
    });

    // 4. Process Calls
    calls.forEach(c => {
      const lang = String(c.language || "english").toLowerCase().trim();
      const subId = `call_lang_${lang}`;
      const durSec = Number(c.actualCallDuration) || 0;

      const userAId = String(c.userA?._id || c.userA || "");
      const userBId = String(c.userB?._id || c.userB || "");

      if (userMap.has(userAId)) {
        const b = getBucket("call", subId, lang, userAId);
        const status = c.recordingAStatus || c.callStatus || "pending";
        if (status === "approved") {
          b.approvedCount += 1;
          b.approvedDurationSec += durSec;
        } else if (status === "rejected") {
          b.rejectedCount += 1;
        } else {
          b.pendingCount += 1;
        }
      }

      if (userMap.has(userBId)) {
        const b = getBucket("call", subId, lang, userBId);
        const status = c.recordingBStatus || c.callStatus || "pending";
        if (status === "approved") {
          b.approvedCount += 1;
          b.approvedDurationSec += durSec;
        } else if (status === "rejected") {
          b.rejectedCount += 1;
        } else {
          b.pendingCount += 1;
        }
      }
    });

    // 5. Process Scripted Dialogue Submissions
    scriptedSubs.forEach(sub => {
      const lang = String(sub.language || "english").toLowerCase().trim();
      const subId = `scripted_lang_${lang}`;
      const uid = String(sub.userId);
      const b = getBucket("scripted_call", subId, lang, uid);

      (sub.verses || []).forEach(v => {
        if (v.status === "approved") {
          b.approvedCount += 1;
          b.approvedDurationSec += (Number(v.durationSec) || 0);
        } else if (v.status === "rejected") {
          b.rejectedCount += 1;
        } else {
          b.pendingCount += 1;
        }
      });
    });

    // Build hierarchy for vendor assigned projects
    const assignedProjects = (vendor.assignedProjects || []).filter(p => p.isActive !== false);
    const activeProjectKeys = new Set(assignedProjects.map(p => `${p.category}::${p.subprojectId}`));

    // Overall summary accumulators
    let overallApproved = 0;
    let overallRejected = 0;
    let overallPending = 0;
    let overallApprovedDurationSec = 0;
    let overallEstimatedMargin = 0;
    let overallArtistPayout = 0;
    const overallActiveWorkerIds = new Set();
    const overallActiveLanguages = new Set();

    const formattedProjects = assignedProjects.map(proj => {
      const category = proj.category;
      const subprojectId = String(proj.subprojectId);
      const marginRate = Number(proj.baseRate) || 0;

      // Determine languages assigned to this project
      let assignedLangs = [];
      if (proj.assignedLanguages && proj.assignedLanguages.length > 0) {
        assignedLangs = proj.assignedLanguages.map(l => String(l).toLowerCase().trim()).filter(Boolean);
      } else if (proj.languageCode) {
        assignedLangs = [String(proj.languageCode).toLowerCase().trim()];
      } else if (category === "phrase") {
        const comp = companyMap.get(subprojectId);
        if (comp && comp.languages && comp.languages.length > 0) {
          assignedLangs = comp.languages.map(l => String(l).toLowerCase().trim()).filter(Boolean);
        } else {
          assignedLangs = ["all"];
        }
      } else {
        const cleanSub = subprojectId.replace(/^(call_lang_|scripted_lang_)/, "").toLowerCase().trim();
        assignedLangs = cleanSub ? [cleanSub] : ["default"];
      }

      // Also discover any extra languages with activity for this project
      for (const [key, b] of taskBuckets.entries()) {
        if (b.category === category && b.subprojectId === subprojectId) {
          if (!assignedLangs.includes(b.language)) {
            assignedLangs.push(b.language);
          }
        }
      }

      let projectApproved = 0;
      let projectRejected = 0;
      let projectPending = 0;
      let projectApprovedDurationSec = 0;
      let projectMargin = 0;
      let projectPayout = 0;
      const projectWorkerIds = new Set();

      const languagesData = assignedLangs.map(lang => {
        overallActiveLanguages.add(lang);

        // Determine base platform project rate ($/hr)
        let projectRate = 25;
        if (category === "call") {
          projectRate = ratesLookup.callRates[lang] || 25;
        } else if (category === "scripted_call") {
          projectRate = ratesLookup.scriptedRates[lang] || 25;
        } else if (category === "phrase") {
          projectRate = ratesLookup.phraseRates[subprojectId] || 25;
        }

        // Find all contributors who either:
        // 1. Have activity in this (category, subprojectId, lang)
        // 2. OR have explicit project payrate configuration for this (category, subprojectId, lang) if Studio
        const matchedContributors = vendorUsers.filter(u => {
          const uid = String(u._id);
          const b = taskBuckets.get(`${category}::${subprojectId}::${lang}::${uid}`);
          if (b && (b.approvedCount > 0 || b.rejectedCount > 0 || b.pendingCount > 0)) {
            return true;
          }
          if (vendor.isStudio && Array.isArray(u.projectPayrates)) {
            const hasConfig = u.projectPayrates.some(pp => {
              if (pp.category !== category) return false;
              if (String(pp.subprojectId).trim() !== subprojectId) return false;
              if (pp.language && pp.language !== "all" && String(pp.language).toLowerCase().trim() !== lang) return false;
              return true;
            });
            if (hasConfig) return true;
          }
          return false;
        });

        let langApproved = 0;
        let langRejected = 0;
        let langPending = 0;
        let langApprovedDurationSec = 0;
        let langMargin = 0;
        let langPayout = 0;

        const contributorsList = matchedContributors.map(u => {
          const uid = String(u._id);
          const b = taskBuckets.get(`${category}::${subprojectId}::${lang}::${uid}`) || {
            approvedCount: 0,
            rejectedCount: 0,
            pendingCount: 0,
            approvedDurationSec: 0
          };

          const approved = b.approvedCount;
          const rejected = b.rejectedCount;
          const pending = b.pendingCount;
          const approvedSec = b.approvedDurationSec;
          const approvedHrs = Number((approvedSec / 3600).toFixed(2));
          const audited = approved + rejected;
          const approvalRating = audited > 0 ? Number(((approved / audited) * 100).toFixed(1)) : 0;
          const rejectionRating = audited > 0 ? Number(((rejected / audited) * 100).toFixed(1)) : 0;

          if (approved > 0 || rejected > 0 || pending > 0) {
            projectWorkerIds.add(uid);
            overallActiveWorkerIds.add(uid);
          }

          langApproved += approved;
          langRejected += rejected;
          langPending += pending;
          langApprovedDurationSec += approvedSec;

          // Rate & margin calculation
          let artistRate = 0;
          let studioMarginRate = 0;
          let earnedPayout = 0;
          let earnedMargin = 0;

          if (vendor.isStudio) {
            const rates = getArtistRateForProject(u, category, subprojectId, lang, projectRate);
            artistRate = rates.artistRate;
            studioMarginRate = rates.studioRate;
            if (b.accumulatedMargin !== undefined && (b.accumulatedMargin > 0 || b.accumulatedArtistPayout > 0)) {
              earnedPayout = Number(b.accumulatedArtistPayout.toFixed(2));
              earnedMargin = Number(b.accumulatedMargin.toFixed(2));
            } else {
              earnedPayout = Number((approvedHrs * artistRate).toFixed(2));
              earnedMargin = Number((approvedHrs * studioMarginRate).toFixed(2));
            }
          } else {
            artistRate = projectRate;
            studioMarginRate = marginRate;
            earnedPayout = Number((approvedHrs * projectRate).toFixed(2));
            earnedMargin = Number((approvedHrs * marginRate).toFixed(2));
          }

          langMargin += earnedMargin;
          langPayout += earnedPayout;

          const fullName = `${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username;

          return {
            userId: uid,
            name: fullName,
            username: u.username,
            email: u.email,
            mobileNumber: u.mobileNumber || "N/A",
            speaker_id: u.speaker_id || "N/A",
            accountStatus: u.accountStatus || "active",
            upiConfigured: Boolean(u.upiId),
            approvedCount: approved,
            rejectedCount: rejected,
            pendingCount: pending,
            totalAudited: audited,
            approvalRating,
            rejectionRating,
            approvedDurationSec: approvedSec,
            approvedHours: approvedHrs,
            projectRate,
            artistRate,
            studioMarginRate,
            earnedPayout,
            earnedMargin
          };
        });

        const langAudited = langApproved + langRejected;
        const langApprovalRating = langAudited > 0 ? Number(((langApproved / langAudited) * 100).toFixed(1)) : 0;
        const langRejectionRating = langAudited > 0 ? Number(((langRejected / langAudited) * 100).toFixed(1)) : 0;
        const langApprovedHours = Number((langApprovedDurationSec / 3600).toFixed(2));

        projectApproved += langApproved;
        projectRejected += langRejected;
        projectPending += langPending;
        projectApprovedDurationSec += langApprovedDurationSec;
        projectMargin += langMargin;
        projectPayout += langPayout;

        return {
          language: lang,
          languageLabel: getLangLabel(lang),
          projectRate,
          contributorsCount: matchedContributors.length,
          activeContributorsCount: contributorsList.filter(c => (c.approvedCount + c.rejectedCount + c.pendingCount) > 0).length,
          totalApprovedCount: langApproved,
          totalRejectedCount: langRejected,
          totalPendingCount: langPending,
          totalAudited: langAudited,
          approvalRating: langApprovalRating,
          rejectionRating: langRejectionRating,
          approvedHours: langApprovedHours,
          totalMarginEarned: Number(langMargin.toFixed(2)),
          totalPayoutEarned: Number(langPayout.toFixed(2)),
          contributors: contributorsList
        };
      });

      const projAudited = projectApproved + projectRejected;
      const projApprovalRating = projAudited > 0 ? Number(((projectApproved / projAudited) * 100).toFixed(1)) : 0;
      const projRejectionRating = projAudited > 0 ? Number(((projectRejected / projAudited) * 100).toFixed(1)) : 0;
      const projApprovedHours = Number((projectApprovedDurationSec / 3600).toFixed(2));

      overallApproved += projectApproved;
      overallRejected += projectRejected;
      overallPending += projectPending;
      overallApprovedDurationSec += projectApprovedDurationSec;
      overallEstimatedMargin += projectMargin;
      overallArtistPayout += projectPayout;

      let categoryLabel = "Conversational Calls";
      if (category === "scripted_call") categoryLabel = "Scripted Dialogue";
      else if (category === "phrase") categoryLabel = "Phrase Dataset";

      return {
        subprojectId,
        subprojectName: proj.subprojectName || `${categoryLabel} (${subprojectId})`,
        category,
        categoryLabel,
        baseRate: marginRate,
        marginType: proj.marginType || "fixed_per_unit",
        assignedLanguagesCount: assignedLangs.length,
        workersCount: projectWorkerIds.size,
        totalApprovedCount: projectApproved,
        totalRejectedCount: projectRejected,
        totalPendingCount: projectPending,
        totalAudited: projAudited,
        approvalRating: projApprovalRating,
        rejectionRating: projRejectionRating,
        approvedHours: projApprovedHours,
        totalMarginEarned: Number(projectMargin.toFixed(2)),
        totalPayoutEarned: Number(projectPayout.toFixed(2)),
        languages: languagesData
      };
    });

    const overallAudited = overallApproved + overallRejected;
    const overallApprovalRating = overallAudited > 0 ? Number(((overallApproved / overallAudited) * 100).toFixed(1)) : 0;
    const overallRejectionRating = overallAudited > 0 ? Number(((overallRejected / overallAudited) * 100).toFixed(1)) : 0;
    const overallApprovedHours = Number((overallApprovedDurationSec / 3600).toFixed(2));

    // Build granular task lists for the dedicated page tabs (Approved, Pending, Rejected)
    const recentApproved = [];
    const recentPending = [];
    const recentRejected = [];

    // Phrases
    approvedPhrases.forEach(p => {
      const u = userMap.get(String(p.contributorId));
      const comp = companyMap.get(String(p.companyId));
      recentApproved.push({
        id: String(p._id),
        category: "phrase",
        categoryLabel: "Phrase",
        projectName: comp ? (comp.projectName ? `${comp.name} (${comp.projectName})` : comp.name) : "Phrase Dataset",
        language: p.language || "default",
        languageLabel: getLangLabel(p.language),
        contributorName: u ? (`${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username) : "Unknown",
        speakerId: u?.speaker_id || "N/A",
        durationSec: Number(p.duration) || 0,
        createdAt: p.createdAt || null
      });
    });

    pendingPhrases.forEach(p => {
      const u = userMap.get(String(p.contributorId));
      const comp = companyMap.get(String(p.companyId));
      recentPending.push({
        id: String(p._id),
        category: "phrase",
        categoryLabel: "Phrase",
        projectName: comp ? (comp.projectName ? `${comp.name} (${comp.projectName})` : comp.name) : "Phrase Dataset",
        language: p.language || "default",
        languageLabel: getLangLabel(p.language),
        contributorName: u ? (`${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username) : "Unknown",
        speakerId: u?.speaker_id || "N/A",
        durationSec: Number(p.duration) || 0,
        createdAt: p.createdAt || null
      });
    });

    rejectedPhrases.forEach(p => {
      const u = userMap.get(String(p.contributorId));
      const comp = companyMap.get(String(p.companyId));
      recentRejected.push({
        id: String(p._id),
        category: "phrase",
        categoryLabel: "Phrase",
        projectName: comp ? (comp.projectName ? `${comp.name} (${comp.projectName})` : comp.name) : "Phrase Dataset",
        language: p.language || "default",
        languageLabel: getLangLabel(p.language),
        contributorName: u ? (`${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username) : "Unknown",
        speakerId: u?.speaker_id || "N/A",
        durationSec: Number(p.duration) || 0,
        rejectionReason: p.rejectionReason || "Audio QA rejection",
        createdAt: p.createdAt || null
      });
    });

    // Calls
    calls.forEach(c => {
      const lang = String(c.language || "english").toLowerCase().trim();
      const durSec = Number(c.actualCallDuration) || 0;
      const uA = userMap.get(String(c.userA?._id || c.userA));
      const uB = userMap.get(String(c.userB?._id || c.userB));

      if (uA) {
        const stA = c.recordingAStatus || c.callStatus || "pending";
        const itemA = {
          id: `${c._id}_A`,
          category: "call",
          categoryLabel: "Call",
          projectName: `${getLangLabel(lang)} Conversational Calls`,
          language: lang,
          languageLabel: getLangLabel(lang),
          contributorName: `${uA.firstname || ""} ${uA.lastname || ""}`.trim() || uA.username,
          speakerId: uA.speaker_id || "N/A",
          durationSec: durSec,
          createdAt: c.createdAt || null
        };
        if (stA === "approved") recentApproved.push(itemA);
        else if (stA === "rejected") {
          itemA.rejectionReason = c.recordingAReviewNote || "Call QA rejection";
          recentRejected.push(itemA);
        } else recentPending.push(itemA);
      }

      if (uB) {
        const stB = c.recordingBStatus || c.callStatus || "pending";
        const itemB = {
          id: `${c._id}_B`,
          category: "call",
          categoryLabel: "Call",
          projectName: `${getLangLabel(lang)} Conversational Calls`,
          language: lang,
          languageLabel: getLangLabel(lang),
          contributorName: `${uB.firstname || ""} ${uB.lastname || ""}`.trim() || uB.username,
          speakerId: uB.speaker_id || "N/A",
          durationSec: durSec,
          createdAt: c.createdAt || null
        };
        if (stB === "approved") recentApproved.push(itemB);
        else if (stB === "rejected") {
          itemB.rejectionReason = c.recordingBReviewNote || "Call QA rejection";
          recentRejected.push(itemB);
        } else recentPending.push(itemB);
      }
    });

    // Scripted Submissions
    scriptedSubs.forEach(sub => {
      const lang = String(sub.language || "english").toLowerCase().trim();
      const u = userMap.get(String(sub.userId));
      const cName = u ? (`${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username) : "Unknown";
      const spk = u?.speaker_id || "N/A";

      (sub.verses || []).forEach((v, idx) => {
        const item = {
          id: `${sub._id}_v${idx}`,
          category: "scripted_call",
          categoryLabel: "Scripted",
          projectName: `${getLangLabel(lang)} Scripted Dialogue`,
          language: lang,
          languageLabel: getLangLabel(lang),
          contributorName: cName,
          speakerId: spk,
          durationSec: Number(v.durationSec) || 0,
          createdAt: sub.createdAt || null
        };
        if (v.status === "approved") recentApproved.push(item);
        else if (v.status === "rejected") {
          item.rejectionReason = v.rejectionReason || v.reviewNote || "Scripted Verse QA rejection";
          recentRejected.push(item);
        } else recentPending.push(item);
      });
    });

    // Aggregate overall contributor-level summary across all projects for this vendor
    const contributorAggregates = new Map();
    vendorUsers.forEach(u => {
      const uid = String(u._id);
      contributorAggregates.set(uid, {
        userId: uid,
        name: `${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username,
        username: u.username,
        email: u.email,
        mobileNumber: u.mobileNumber || "N/A",
        speaker_id: u.speaker_id || "N/A",
        accountStatus: u.accountStatus || "active",
        upiConfigured: Boolean(u.upiId),
        upiId: u.upiId || null,
        totalApprovedCount: 0,
        totalRejectedCount: 0,
        totalPendingCount: 0,
        totalAudited: 0,
        approvedHours: 0,
        earnedPayout: 0, // sole contributor cut!
        earnedMargin: 0, // vendor's cut from this contributor!
        projects: []
      });
    });

    formattedProjects.forEach(proj => {
      proj.languages?.forEach(langData => {
        langData.contributorsList?.forEach(c => {
          const ca = contributorAggregates.get(c.userId);
          if (ca) {
            ca.totalApprovedCount += (c.approvedCount || 0);
            ca.totalRejectedCount += (c.rejectedCount || 0);
            ca.totalPendingCount += (c.pendingCount || 0);
            ca.totalAudited += (c.totalAudited || 0);
            ca.approvedHours = Number((ca.approvedHours + (c.approvedHours || 0)).toFixed(2));
            ca.earnedPayout = Number((ca.earnedPayout + (c.earnedPayout || 0)).toFixed(2));
            ca.earnedMargin = Number((ca.earnedMargin + (c.earnedMargin || 0)).toFixed(2));
            if ((c.approvedCount || 0) > 0 || (c.pendingCount || 0) > 0 || (c.rejectedCount || 0) > 0) {
              ca.projects.push({
                projectName: proj.subprojectName,
                category: proj.category,
                categoryLabel: proj.categoryLabel,
                language: langData.languageLabel || langData.language,
                approvedHours: c.approvedHours,
                earnedPayout: c.earnedPayout,
                earnedMargin: c.earnedMargin
              });
            }
          }
        });
      });
    });

    const allContributorsList = Array.from(contributorAggregates.values()).sort((a, b) => b.earnedPayout - a.earnedPayout);

    const vendorPayouts = await VendorPayout.find({ vendorId: vendor._id })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();
    const totalPaidOut = vendorPayouts.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0);
    const remainingBalance = Math.max(0, Number((overallEstimatedMargin - totalPaidOut).toFixed(2)));

    res.json({
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        vendorCode: vendor.vendorCode,
        contactPerson: vendor.contactPerson,
        email: vendor.email,
        phone: vendor.phone,
        isStudio: Boolean(vendor.isStudio),
        status: vendor.status,
        agreementSigned: Boolean(vendor.agreementSigned),
        agreementSignedAt: vendor.agreementSignedAt,
        payoutDetails: vendor.payoutDetails || {},
        createdAt: vendor.createdAt
      },
      summary: {
        totalAssignedProjects: assignedProjects.length,
        totalWorkers: vendorUsers.length,
        activeWorkers: overallActiveWorkerIds.size,
        totalActiveLanguages: overallActiveLanguages.size,
        totalApproved: overallApproved,
        totalRejected: overallRejected,
        totalPending: overallPending,
        totalAudited: overallAudited,
        overallApprovalRating,
        overallRejectionRating,
        totalApprovedHours: overallApprovedHours,
        totalEstimatedMargin: Number(overallEstimatedMargin.toFixed(2)),
        totalArtistPayout: Number(overallArtistPayout.toFixed(2)),
        totalProjectValue: Number((overallEstimatedMargin + overallArtistPayout).toFixed(2)),
        totalPaidOut: Number(totalPaidOut.toFixed(2)),
        remainingBalance,
        payoutHistory: vendorPayouts
      },
      contributors: allContributorsList,
      projects: formattedProjects,
      recentTasks: {
        approved: recentApproved.slice(0, 100),
        pending: recentPending.slice(0, 100),
        rejected: recentRejected.slice(0, 100)
      }
    });
  } catch (err) {
    console.error("[getVendorAnalyticsAdmin] Error:", err);
    res.status(500).json({ error: "Failed to generate vendor analytics: " + err.message });
  }
}

// ─── VENDOR PORTAL: Get Payout History ────────────────────────────────────────
export async function getVendorPayouts(req, res) {
  try {
    const vendorId = req.vendorId;
    const payouts = await VendorPayout.find({ vendorId })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();
    const totalPaidOut = payouts.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0);
    res.json({ ok: true, payouts, totalPaidOut: Number(totalPaidOut.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendor payouts: " + err.message });
  }
}

// ─── ADMIN: Record Payout to Vendor ──────────────────────────────────────────
export async function recordVendorPayoutAdmin(req, res) {
  try {
    const { id } = req.params;
    const { amountUsd, amountInr, paymentMethod, referenceId, note, paidAt } = req.body;

    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const parsedAmountUsd = Number(amountUsd);
    if (isNaN(parsedAmountUsd) || parsedAmountUsd <= 0) {
      return res.status(400).json({ error: "Valid positive amount in USD is required." });
    }

    const payout = await VendorPayout.create({
      vendorId: vendor._id,
      amountUsd: parsedAmountUsd,
      amountInr: Number(amountInr) || 0,
      paymentMethod: paymentMethod || "upi",
      referenceId: referenceId ? String(referenceId).trim() : "",
      note: note ? String(note).trim() : "Margin Settlement",
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      createdBy: req.user?._id || null
    });

    const allPayouts = await VendorPayout.find({ vendorId: vendor._id })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();
    const totalPaidOut = allPayouts.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0);

    res.json({
      ok: true,
      payout,
      payoutHistory: allPayouts,
      totalPaidOut: Number(totalPaidOut.toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to record vendor payout: " + err.message });
  }
}

// ─── ADMIN: Get Vendor Payout History ─────────────────────────────────────────
export async function getVendorPayoutsAdmin(req, res) {
  try {
    const { id } = req.params;
    const payouts = await VendorPayout.find({ vendorId: id })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();
    const totalPaidOut = payouts.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0);
    res.json({ ok: true, payouts, totalPaidOut: Number(totalPaidOut.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendor payouts: " + err.message });
  }
}

// ─── ADMIN: Delete Vendor Payout ─────────────────────────────────────────────
export async function deleteVendorPayoutAdmin(req, res) {
  try {
    const { id, payoutId } = req.params;
    await VendorPayout.deleteOne({ _id: payoutId, vendorId: id });
    const allPayouts = await VendorPayout.find({ vendorId: id })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();
    const totalPaidOut = allPayouts.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0);
    res.json({ ok: true, payoutHistory: allPayouts, totalPaidOut: Number(totalPaidOut.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete payout: " + err.message });
  }
}


