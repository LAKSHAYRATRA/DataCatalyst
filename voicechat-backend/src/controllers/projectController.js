import { Project } from "../models/Project.js";
import { Language } from "../models/Language.js";
import { ScriptedLanguage } from "../models/ScriptedLanguage.js";
import { Company } from "../models/Company.js";
import { Phrase } from "../models/Phrase.js";

// GET /api/projects
export async function getProjects(req, res) {
  try {
    const projects = await Project.find().sort({ name: 1 });
    res.json({ success: true, projects });
  } catch (error) {
    console.error("getProjects error:", error);
    res.status(500).json({ error: error.message });
  }
}

// GET /api/projects/recommended (ONLY explicitly boosted projects across Calls, Scripted Calls, & Phrases)
export async function getRecommendedProjects(req, res) {
  try {
    const [boostedCalls, boostedScripted, boostedCompanies] = await Promise.all([
      Language.find({ isBoosted: true }),
      ScriptedLanguage.find({ isBoosted: true }),
      Company.find({ isBoosted: true })
    ]);

    let recommended = [];

    // ONLY include projects where admin explicitly enabled isBoosted
    boostedCalls.forEach(l => {
      recommended.push({
        id: l._id,
        type: "call",
        typeLabel: "Live Voice Call",
        title: l.name,
        projectName: l.projectName || l.name,
        language: l.language || (l.name.match(/\(([^)]+)\)$/)?.[1] || l.name),
        code: l.code,
        hourlyPayout: l.hourlyPayout || 0,
        isBoosted: true,
        roles: l.enableCallRoles ? [l.role1 || "Role 1", l.role2 || "Role 2"] : null,
        noisy: !!l.noisy,
        applyUrl: `/language-apply?type=call&code=${encodeURIComponent(l.code)}`,
        workUrl: `/call`
      });
    });

    boostedScripted.forEach(s => {
      recommended.push({
        id: s._id,
        type: "scripted_call",
        typeLabel: "Scripted Dialogue Call",
        title: s.name,
        projectName: s.projectName || s.name,
        language: s.language || (s.name.match(/\(([^)]+)\)$/)?.[1] || s.name),
        code: s.code,
        hourlyPayout: s.hourlyPayout || 0,
        isBoosted: true,
        roles: s.enableCallRoles ? [s.role1 || "Role 1", s.role2 || "Role 2"] : null,
        noisy: !!s.noisy,
        applyUrl: `/language-apply?type=scripted_call&code=${encodeURIComponent(s.code)}`,
        workUrl: `/scripted-calls`
      });
    });

    for (const c of boostedCompanies) {
      let langList = Array.isArray(c.languages) && c.languages.length > 0 ? c.languages : [];
      if (langList.length === 0) {
        const compFolder = c.name.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
        const companyRegex = new RegExp(`^${compFolder}(_downloaded)?$`, "i");
        const foundLangs = await Phrase.distinct("language", {
          companyId: { $regex: companyRegex },
          status: { $in: ["pending", "locked", "rejected"] }
        });
        const hiddenSet = new Set((c.hiddenLanguages || []).map(l => String(l).toLowerCase().trim()));
        langList = (foundLangs || []).filter(l => Boolean(l) && !hiddenSet.has(String(l).toLowerCase().trim()));
      }

      const formattedLanguages = langList.length > 0 
        ? langList.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(", ") 
        : "Multi-language";

      recommended.push({
        id: c._id,
        type: "phrase",
        typeLabel: "Phrase Audio Studio",
        title: c.projectName || c.name,
        projectName: c.projectName || c.name,
        language: formattedLanguages,
        languages: langList,
        code: c.name,
        companyId: c.name,
        hourlyPayout: c.hourlyPayout || 0,
        isBoosted: true,
        roles: null,
        noisy: false,
        applyUrl: `/language-apply?type=phrase&company=${encodeURIComponent(c.name)}`,
        workUrl: `/phrases`
      });
    }

    // If authenticated user is present, filter out projects user has applied for, or been rejected/blacklisted from
    if (req.user && Array.isArray(req.user.languageApplications)) {
      const userApps = req.user.languageApplications;
      const norm = str => String(str || "").replace(/_downloaded$/i, "").trim().toLowerCase();

      recommended = recommended.filter(proj => {
        const projIdentifiers = [
          norm(proj.code),
          norm(proj.companyId),
          norm(proj.id),
          norm(proj.projectName),
          norm(proj.title),
          String(proj.id || "").trim().toLowerCase(),
          String(proj.code || "").trim().toLowerCase()
        ].filter(Boolean);

        if (proj.type === "phrase") {
          const matchingApps = userApps.filter(a => {
            const appType = a.applicationType || (a.companyId ? "phrase" : "call");
            if (appType !== "phrase") return false;
            const appIdentifiers = [
              norm(a.companyId),
              norm(a.projectName),
              String(a.companyId || "").trim().toLowerCase()
            ].filter(Boolean);
            return appIdentifiers.some(ai => projIdentifiers.includes(ai));
          });

          if (matchingApps.length === 0) return true;

          // Never recommend if rejected or blacklisted
          if (matchingApps.some(a => a.status === "rejected" || a.status === "blacklisted")) {
            return false;
          }

          // If project has specific languages
          const projLangs = Array.isArray(proj.languages) && proj.languages.length > 0
            ? proj.languages.map(l => norm(l))
            : [norm(proj.language)].filter(Boolean);

          if (projLangs.length > 0) {
            return projLangs.some(l => !matchingApps.find(a => norm(a.languageCode || a.language) === l));
          }

          return false;
        }

        if (proj.type === "call" || proj.type === "scripted_call") {
          const app = userApps.find(a => {
            const appType = a.applicationType || (a.companyId ? "phrase" : "call");
            if (appType !== proj.type) return false;
            const appLang = norm(a.languageCode || a.language);
            return projIdentifiers.includes(appLang);
          });
          if (app) return false;
          return true;
        }

        return true;
      });
    }

    res.json({ success: true, projects: recommended });
  } catch (error) {
    console.error("getRecommendedProjects error:", error);
    res.status(500).json({ error: error.message });
  }
}

// PUT /api/projects/:id
export async function updateProjectRates(req, res) {
  try {
    const { id } = req.params;
    const { languageRates } = req.body;

    if (!Array.isArray(languageRates)) {
      return res.status(400).json({ error: "languageRates must be an array" });
    }

    const updated = await Project.findByIdAndUpdate(
      id,
      { $set: { languageRates } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ success: true, project: updated });
  } catch (error) {
    console.error("updateProjectRates error:", error);
    res.status(500).json({ error: error.message });
  }
}
