import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a customized, electronically signed Studio or Vendor Master Agreement PDF.
 * @param {Object} partnerData 
 * @returns {Promise<string>} Output PDF path
 */
export async function generatePartnerAgreementPdf(partnerData) {
  const isStudio = Boolean(partnerData.isStudio);
  const type = isStudio ? "studio" : "vendor";

  // Resolve directory: work contracts/partner_agreements
  let rootDir = path.resolve(__dirname, "../../..");
  if (!fs.existsSync(path.join(rootDir, "scripts", "generate_partner_agreements.py"))) {
    rootDir = process.cwd();
    if (path.basename(rootDir).toLowerCase() === "voicechat-backend") {
      rootDir = path.dirname(rootDir);
    }
  }

  const contractsDir = path.join(rootDir, "work contracts", "partner_agreements");
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }

  const safeCode = (partnerData.vendorCode || "PARTNER").replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `${safeCode}_${type}_agreement_${Date.now()}.pdf`;
  const outputPath = path.join(contractsDir, filename);

  const scriptPath = path.join(rootDir, "scripts", "generate_partner_agreements.py");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Partner agreement generator script not found at ${scriptPath}`);
  }

  const formattedDate = partnerData.date || new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const cityState = partnerData.cityState || (partnerData.city && partnerData.state ? `${partnerData.city}, ${partnerData.state}` : (partnerData.city || partnerData.state || "Mumbai, Maharashtra"));

  const payload = {
    partner_name: partnerData.name || partnerData.partner_name || "Partner",
    signatory_name: partnerData.signatoryName || partnerData.contactPerson || "Authorized Signatory",
    vendor_code: partnerData.vendorCode || (isStudio ? "STD_001" : "VEN_001"),
    email: partnerData.email || "",
    phone: partnerData.phone || "",
    address: partnerData.address || "",
    city: partnerData.city || "",
    state: partnerData.state || "",
    city_state: cityState,
    pan_gst: partnerData.panOrGst || partnerData.pan_gst || "",
    date: formattedDate,
    ref_no: partnerData.refNo || `DC / VOC / ${isStudio ? "STD" : "VEN"} / 2026 / ${safeCode}`
  };

  const tempJsonPath = path.join(contractsDir, `tmp_${safeCode}_${Date.now()}.json`);
  fs.writeFileSync(tempJsonPath, JSON.stringify(payload, null, 2), "utf-8");

  return new Promise((resolve, reject) => {
    const proc = spawn("python", [
      scriptPath,
      "--type", type,
      "--data", tempJsonPath,
      "--output-file", outputPath
    ]);

    let stderr = "";
    let stdout = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("error", (err) => {
      try { if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath); } catch (_) {}
      reject(new Error(`Failed to spawn python process: ${err.message}`));
    });

    proc.on("close", (code) => {
      try { if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath); } catch (_) {}
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error(`PDF Generation failed with code ${code}. Stdout: ${stdout}, Stderr: ${stderr}`));
      }
    });
  });
}
