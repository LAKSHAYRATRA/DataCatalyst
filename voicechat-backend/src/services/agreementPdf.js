import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, "..", "templates", "contributor-agreement.md");

export const AGREEMENT_VERSION = "v2-20260720";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatDate(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().split("T")[0];
}

function substituteTemplate(template, user, signingMeta) {
  const addr = user.address || {};
  return template
    .replace(/{{FIRST_NAME}}/g, user.firstname || "")
    .replace(/{{LAST_NAME}}/g, user.lastname || "")
    .replace(/{{USERNAME}}/g, user.username || "")
    .replace(/{{EMAIL}}/g, user.email || "")
    .replace(/{{DOB}}/g, formatDate(user.dob))
    .replace(/{{ADDRESS_STREET}}/g, addr.street || "")
    .replace(/{{ADDRESS_CITY}}/g, addr.city || "")
    .replace(/{{ADDRESS_STATE}}/g, addr.state || "")
    .replace(/{{ADDRESS_PINCODE}}/g, addr.pincode || "")
    .replace(/{{SPEAKER_ID}}/g, user.speaker_id || "n/a")
    .replace(/{{SIGNING_TIMESTAMP}}/g, signingMeta.timestamp)
    .replace(/{{SIGNING_IP}}/g, signingMeta.ip || "unknown");
}

function wrapText(text, font, fontSize, maxWidth) {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function classifyLine(rawLine) {
  const line = rawLine.replace(/\r$/, "");
  if (line.trim() === "") return { type: "blank" };
  if (line.trim() === "---") return { type: "hr" };
  if (line.startsWith("# ")) return { type: "h1", text: line.slice(2) };
  if (line.startsWith("## ")) return { type: "h2", text: line.slice(3) };
  if (line.startsWith("### ")) return { type: "h3", text: line.slice(4) };
  if (/^\s*[-*]\s+/.test(line)) return { type: "bullet", text: line.replace(/^\s*[-*]\s+/, "") };
  if (/^\|.*\|$/.test(line.trim())) return { type: "table", text: line };
  return { type: "para", text: line };
}

export async function generateSignedAgreementPdf({ user, signaturePngBuffer, signingMeta }) {
  const template = await fs.readFile(TEMPLATE_PATH, "utf-8");
  const content = substituteTemplate(template, user, signingMeta);

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let sigImage = null;
  try {
    sigImage = await pdfDoc.embedPng(signaturePngBuffer);
  } catch (err) {
    // Signature image failed to decode; table renderer will fall back to placeholder text.
  }

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureRoom = (needed) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawLine = (text, opts = {}) => {
    const {
      font = fontRegular,
      size = 10,
      lineGap = 3,
      indent = 0,
      color = rgb(0.1, 0.1, 0.15),
    } = opts;
    const wrapped = wrapText(stripMarkdown(text), font, size, CONTENT_WIDTH - indent);
    for (const w of wrapped) {
      ensureRoom(size + lineGap);
      page.drawText(w, { x: MARGIN + indent, y: y - size, size, font, color });
      y -= size + lineGap;
    }
  };

  const drawGap = (amt = 6) => {
    ensureRoom(amt);
    y -= amt;
  };

  const drawHr = () => {
    ensureRoom(10);
    page.drawLine({
      start: { x: MARGIN, y: y - 5 },
      end: { x: PAGE_WIDTH - MARGIN, y: y - 5 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.75),
    });
    y -= 10;
  };

  const parseTableRow = (raw) =>
    raw.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const isSeparatorRow = (cells) =>
    cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));

  const drawSignatureTable = (rows) => {
    const labelColW = 150;
    const valueColW = CONTENT_WIDTH - labelColW;
    const cellPadX = 8;
    const cellPadY = 6;
    const fontSize = 10;
    const lineGap = 3;
    const sigMaxH = 60;
    const sigMaxW = valueColW - cellPadX * 2;
    const borderColor = rgb(0.75, 0.75, 0.8);
    const labelBg = rgb(0.95, 0.95, 0.97);
    const textColor = rgb(0.1, 0.1, 0.15);

    const dataRows = rows
      .filter((cells) => cells.length >= 2 && !isSeparatorRow(cells))
      .filter((cells, idx) => !(idx === 0 && cells[0].toLowerCase() === "field" && cells[1].toLowerCase() === "value"));

    ensureRoom(20);
    const tableTop = y;

    for (const [labelRaw, valueRaw] of dataRows) {
      const label = stripMarkdown(labelRaw);
      const isSignatureCell = valueRaw.includes("{{SIGNATURE_IMAGE}}");

      const labelLines = wrapText(label, fontBold, fontSize, labelColW - cellPadX * 2);
      const labelH = labelLines.length * (fontSize + lineGap) - lineGap;

      let valueLines = [];
      let sigDims = null;
      let valueH;
      if (isSignatureCell) {
        if (sigImage) {
          const scale = Math.min(sigMaxW / sigImage.width, sigMaxH / sigImage.height, 1);
          sigDims = { w: sigImage.width * scale, h: sigImage.height * scale };
          valueH = sigDims.h;
        } else {
          valueLines = ["[Signature image failed to embed]"];
          valueH = fontSize;
        }
      } else {
        valueLines = wrapText(stripMarkdown(valueRaw), fontRegular, fontSize, valueColW - cellPadX * 2);
        valueH = valueLines.length * (fontSize + lineGap) - lineGap;
      }

      const rowH = Math.max(labelH, valueH) + cellPadY * 2;

      if (y - rowH < MARGIN) {
        // Close the table on the current page before paginating.
        page.drawLine({
          start: { x: MARGIN, y: y },
          end: { x: MARGIN + CONTENT_WIDTH, y: y },
          thickness: 0.5,
          color: borderColor,
        });
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }

      const rowTop = y;
      const rowBottom = y - rowH;

      page.drawRectangle({
        x: MARGIN,
        y: rowBottom,
        width: labelColW,
        height: rowH,
        color: labelBg,
      });

      let ly = rowTop - cellPadY - fontSize;
      for (const w of labelLines) {
        page.drawText(w, { x: MARGIN + cellPadX, y: ly, size: fontSize, font: fontBold, color: textColor });
        ly -= fontSize + lineGap;
      }

      if (isSignatureCell && sigDims) {
        const imgY = rowBottom + (rowH - sigDims.h) / 2;
        page.drawImage(sigImage, {
          x: MARGIN + labelColW + cellPadX,
          y: imgY,
          width: sigDims.w,
          height: sigDims.h,
        });
      } else {
        let vy = rowTop - cellPadY - fontSize;
        for (const w of valueLines) {
          page.drawText(w, {
            x: MARGIN + labelColW + cellPadX,
            y: vy,
            size: fontSize,
            font: fontRegular,
            color: textColor,
          });
          vy -= fontSize + lineGap;
        }
      }

      page.drawLine({
        start: { x: MARGIN, y: rowBottom },
        end: { x: MARGIN + CONTENT_WIDTH, y: rowBottom },
        thickness: 0.5,
        color: borderColor,
      });

      y = rowBottom;
    }

    // Vertical borders (left, column divider, right) drawn on the same page as the last row.
    const rowsBottom = y;
    const rowsTop = Math.min(tableTop, PAGE_HEIGHT - MARGIN);
    page.drawLine({ start: { x: MARGIN, y: rowsTop }, end: { x: MARGIN, y: rowsBottom }, thickness: 0.5, color: borderColor });
    page.drawLine({ start: { x: MARGIN + labelColW, y: rowsTop }, end: { x: MARGIN + labelColW, y: rowsBottom }, thickness: 0.5, color: borderColor });
    page.drawLine({ start: { x: MARGIN + CONTENT_WIDTH, y: rowsTop }, end: { x: MARGIN + CONTENT_WIDTH, y: rowsBottom }, thickness: 0.5, color: borderColor });
    // Top border of the table
    page.drawLine({ start: { x: MARGIN, y: rowsTop }, end: { x: MARGIN + CONTENT_WIDTH, y: rowsTop }, thickness: 0.5, color: borderColor });

    drawGap(6);
  };

  const rawLines = content.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const line = classifyLine(raw);

    if (line.type === "table") {
      const tableRows = [];
      while (i < rawLines.length && classifyLine(rawLines[i]).type === "table") {
        tableRows.push(parseTableRow(rawLines[i]));
        i++;
      }
      i--;
      drawSignatureTable(tableRows);
      continue;
    }

    switch (line.type) {
      case "blank":
        drawGap(4);
        break;
      case "hr":
        drawHr();
        break;
      case "h1":
        drawGap(10);
        drawLine(line.text, { font: fontBold, size: 16, lineGap: 6 });
        drawGap(4);
        break;
      case "h2":
        drawGap(8);
        drawLine(line.text, { font: fontBold, size: 13, lineGap: 5 });
        drawGap(3);
        break;
      case "h3":
        drawGap(6);
        drawLine(line.text, { font: fontBold, size: 11, lineGap: 4 });
        drawGap(2);
        break;
      case "bullet":
        ensureRoom(12);
        page.drawText("•", { x: MARGIN, y: y - 10, size: 10, font: fontBold });
        drawLine(line.text, { indent: 12 });
        break;
      default:
        drawLine(line.text);
    }
  }

  const pdfBytes = await pdfDoc.save();
  const hash = crypto.createHash("sha256").update(pdfBytes).digest("hex");
  return { pdfBytes: Buffer.from(pdfBytes), hash };
}
