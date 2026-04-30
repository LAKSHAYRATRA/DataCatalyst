import { Project } from "../models/Project.js";

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
