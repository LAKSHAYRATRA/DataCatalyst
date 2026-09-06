import os
import sys
import argparse
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
import fitz  # PyMuPDF

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 6.8)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header on page > 1 (if multi-page)
        if self._pageNumber > 1:
            self.drawString(36, 842 - 26, "DataCatalyst / Voclara — Contractual Engagement Letter (Project Epsilon)")
            self.drawRightString(595 - 36, 842 - 26, "Private & Confidential")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(36, 842 - 30, 595 - 36, 842 - 30)

        # Footer on all pages
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(36, 26, 595 - 36, 26)
        
        self.drawString(36, 17, "M/s DataCatalyst · Platform: Voclara (voclara.com) · Regd. under Indian Partnership Act, 1932")
        self.drawRightString(595 - 36, 17, f"Page {self._pageNumber} of {page_count} · Private & Confidential")
        self.restoreState()

def generate_pdf(output_path, candidate_info=None):
    if candidate_info is None:
        candidate_info = {}
        
    c_name = candidate_info.get("name", "").strip()
    c_phone = candidate_info.get("phone", "").strip()
    c_email = candidate_info.get("email", "").strip()
    c_speaker_id = candidate_info.get("speaker_id", "").strip()
    c_lang = candidate_info.get("language", "").strip()
    doc_ref = candidate_info.get("ref_no", "").strip()
    doc_date = candidate_info.get("date", "").strip()

    # Phone cleaning
    clean_phone = c_phone.replace("+91", "").replace("-", "").strip() if c_phone else ""
    
    # Formatted display strings (fillable lines if empty)
    disp_name = f"<b>{c_name}</b>" if c_name else "________________________________________"
    disp_phone = f"<b>+91 - {clean_phone}</b>" if clean_phone else "+91 - _________________________"
    disp_email = f"<b>{c_email}</b>" if c_email else "________________________________________"
    disp_spk = f"<b>{c_speaker_id}</b>" if c_speaker_id else "spk_ ____________"
    disp_lang = f"<b>{c_lang}</b>" if c_lang else "________________"
    
    if doc_ref:
        disp_ref = doc_ref
    elif c_speaker_id:
        spk_clean = c_speaker_id.replace("spk_", "").upper()
        disp_ref = f"DC / VOC / EPSILON / 2026 / SPK-{spk_clean}"
    else:
        disp_ref = "DC / VOC / EPSILON / 2026 / ________"
        
    disp_date = doc_date if doc_date else "______ / ______ / 2026"

    # A4 dimensions: 595.27 x 841.89 points
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=26,
        bottomMargin=30
    )

    styles = getSampleStyleSheet()
    
    # Sophisticated Corporate Color Palette
    c_primary = colors.HexColor("#0f172a")     # Deep Slate 900
    c_accent = colors.HexColor("#0369a1")      # Corporate Blue 700
    c_dark = colors.HexColor("#1e293b")        # Slate 800 (body)
    c_muted = colors.HexColor("#64748b")       # Slate 500
    c_card_bg = colors.HexColor("#f8fafc")     # Slate 50
    c_border = colors.HexColor("#cbd5e1")      # Slate 300

    # Typography styles
    style_title = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=11.5,
        leading=14,
        textColor=c_primary,
        alignment=1,
        spaceAfter=1
    )

    style_subtitle = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.2,
        leading=9.2,
        textColor=c_accent,
        alignment=1,
        spaceAfter=2.5
    )

    style_subject = ParagraphStyle(
        'DocSubject',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.2,
        leading=9.4,
        textColor=c_primary,
        spaceBefore=2,
        spaceAfter=2.5
    )

    style_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=7.8,
        leading=9.8,
        textColor=c_primary,
        spaceBefore=2.8,
        spaceAfter=1
    )

    style_body = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.2,
        leading=9.4,
        textColor=c_dark,
        spaceAfter=1.5
    )

    style_table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.2,
        leading=9.2,
        textColor=c_dark
    )

    style_table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.2,
        leading=9.2,
        textColor=c_primary
    )

    story = []

    # ------------------ LETTERHEAD HEADER ------------------
    header_data = [
        [
            Paragraph("<b>DATACATALYST</b><br/><font size=6.8 color='#0369a1'>VOCLARA VOICE OPERATIONS NETWORK</font>", ParagraphStyle('H1', fontName='Helvetica-Bold', fontSize=12, leading=14, textColor=c_primary)),
            Paragraph("<b>M/s DataCatalyst</b><br/>"
                      "<font size=6.3 color='#64748b'>Regd. under Indian Partnership Act, 1932<br/>"
                      "Operations Base: Sri Ganganagar, Rajasthan - 335001<br/>"
                      "Web: voclara.com | Official Email: divyam@datacatalyst.in</font>", 
                      ParagraphStyle('H2', fontName='Helvetica', fontSize=6.5, leading=8.5, textColor=c_dark, alignment=2))
        ]
    ]
    header_table = Table(header_data, colWidths=[260, 263])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.2, color=c_primary, spaceBefore=1, spaceAfter=3))

    # Reference & Date Line
    ref_data = [
        [
            Paragraph(f"<b>DOCUMENT REF:</b> {disp_ref}", style_table_cell_bold),
            Paragraph(f"<b>EFFECTIVE DATE:</b> {disp_date}", ParagraphStyle('R', parent=style_table_cell_bold, alignment=2))
        ]
    ]
    ref_table = Table(ref_data, colWidths=[280, 243])
    ref_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(ref_table)

    # Document Titles
    story.append(Paragraph("APPOINTMENT & ENGAGEMENT LETTER", style_title))
    story.append(Paragraph("FIXED-DELIVERABLE CONTRACT BASIS · INDEPENDENT VOICE CONTRIBUTOR", style_subtitle))

    # ------------------ CANDIDATE DETAILS FORM (3 ROWS, NO FATHER/RESIDENTIAL ADDRESS) ------------------
    cand_data = [
        [
            Paragraph("<b>Candidate Name:</b>", style_table_cell_bold),
            Paragraph(disp_name, style_table_cell),
            Paragraph("<b>Speaker ID:</b>", style_table_cell_bold),
            Paragraph(disp_spk, style_table_cell)
        ],
        [
            Paragraph("<b>Mobile / WhatsApp:</b>", style_table_cell_bold),
            Paragraph(disp_phone, style_table_cell),
            Paragraph("<b>Target Language:</b>", style_table_cell_bold),
            Paragraph(disp_lang, style_table_cell)
        ],
        [
            Paragraph("<b>Email Address:</b>", style_table_cell_bold),
            Paragraph(disp_email, style_table_cell),
            Paragraph("<b>Project Code:</b>", style_table_cell_bold),
            Paragraph("<b>PROJECT EPSILON</b>", style_table_cell_bold)
        ]
    ]
    cand_table = Table(cand_data, colWidths=[115, 225, 85, 98])
    cand_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_card_bg),
        ('BOX', (0,0), (-1,-1), 0.7, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.3, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(cand_table)
    story.append(Spacer(1, 2))

    # Subject Line
    story.append(Paragraph(
        "<b>SUBJECT: CONTRACTUAL ENGAGEMENT AS INDEPENDENT VOICE CONTRIBUTOR FOR PROJECT EPSILON (PHASE 1) WITH STIPULATED REMUNERATION AND COMPLETE EXCLUSION OF PERMANENT EMPLOYMENT</b>",
        style_subject
    ))

    # Formal Salutation
    if c_name:
        salutation_line = f"Dear <b>Mr. {c_name}</b>," if "Mehta" in c_name or "Kumar" in c_name or "Singh" in c_name else f"Dear <b>{c_name}</b>,"
    else:
        salutation_line = "Dear Mr. / Ms. ____________________________________________________,"

    story.append(Paragraph(
        f"{salutation_line}<br/>"
        "We are pleased to issue you this letter of engagement as an <b>Independent Voice Contributor</b> for <b>Project Epsilon (Phase 1)</b> on the <b>Voclara</b> voice AI recording platform, administered and operated by <b>M/s DataCatalyst</b> (\"Company\"). This appointment is strictly on a <b>fixed-deliverable contract basis</b> and is governed by the covenants and conditions detailed below:",
        style_body
    ))

    # Section 1: Scope of Work
    story.append(Paragraph("1. SCOPE OF WORK & PROJECT DELIVERABLE (PROJECT EPSILON — PHASE 1)", style_heading))
    story.append(Paragraph(
        "You are engaged solely for the audio recording and successful delivery of <b>700 designated script sentences in Phase 1</b> of Project Epsilon "
        "(representing <b>approx. 3.5 hours of valid net speech duration</b>). "
        "All recordings must be performed on the Voclara web application following studio-grade acoustic standards: 48 kHz sampling rate, 16-bit / 24-bit PCM/FLAC encoding, clean single-channel mono capture, pristine room acoustics with zero audible background noise, and verbatim textual fidelity to the provided scripts.",
        style_body
    ))

    # Section 2: Strict Contractual Engagement — No Permanent Employment
    story.append(Paragraph("2. NATURE OF ENGAGEMENT — STRICTLY CONTRACT BASIS (NO PERMANENT EMPLOYMENT)", style_heading))
    story.append(Paragraph(
        "<b>(a) Independent Contractor Relationship:</b> This engagement is strictly that of an <b>independent contractor on a contract/deliverable basis</b>. Nothing contained in this letter, nor your recording of speech data, shall create, imply, or constitute any employer-employee relationship, master-servant relationship, agency, or regular payroll employment with M/s DataCatalyst or Voclara.<br/>"
        "<b>(b) Absolute Exclusion of Permanent Absorption:</b> This contract is strictly limited to the execution of the Phase 1 milestone (700 sentences). <b>You shall have NO claim whatsoever for permanent employment, regularisation, absorption, probation, tenure, seniority, or ongoing job security in the Company</b> during or after the completion of this engagement.<br/>"
        "<b>(c) Autonomy of Schedule:</b> You retain full autonomy over your recording schedule and physical location, subject only to adherence to client delivery timelines and acoustic quality standards.",
        style_body
    ))

    # Section 3: Remuneration Table & Complete Benefit Exclusion Clause
    story.append(Paragraph("3. REMUNERATION, MILESTONE COMPLETION & BENEFIT EXCLUSION", style_heading))
    story.append(Paragraph(
        "In consideration of your satisfactory recording, quality audit, and QA clearance of the full 700 sentences, you shall receive remuneration strictly according to the deliverable structure below:",
        style_body
    ))

    comp_data = [
        [
            Paragraph("<b>Project Phase & Scope</b>", style_table_cell_bold),
            Paragraph("<b>Agreed Remuneration Rate</b>", style_table_cell_bold),
            Paragraph("<b>Benefit / Perks Entitlement</b>", style_table_cell_bold)
        ],
        [
            Paragraph("<b>Project Epsilon (Phase 1)</b><br/>Recording of <b>700 Script Sentences</b><br/>(approx. 3.5 hours of valid net speech duration)", style_table_cell),
            Paragraph("<font color='#047857'><b>INR equivalent of $31 per Hour</b></font><br/><font size=6 color='#64748b'>(Converted to INR at reference forex rate at disbursement for approved valid speech, calculated pro-rata)</font>", style_table_cell),
            Paragraph("<font color='#b91c1c'><b>STRICTLY NIL (Zero Benefits)</b></font><br/><font size=6 color='#64748b'>Strictly deliverable pay. No PF, ESI, medical insurance, bonus, or paid leaves.</font>", style_table_cell)
        ]
    ]
    comp_table = Table(comp_data, colWidths=[175, 185, 163])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#e2e8f0")),
        ('BACKGROUND', (0,1), (-1,1), colors.white),
        ('BOX', (0,0), (-1,-1), 0.7, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.3, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(comp_table)
    story.append(Spacer(1, 1.5))

    story.append(Paragraph(
        "<b>(a) Milestone Condition & Exclusion of Benefits:</b> Remuneration is strictly payable upon <b>100% completion of the designated 700 sentences milestone and client QA approval</b>. Incomplete batches carry zero commercial utility and shall not be eligible for payout. You explicitly confirm receipt of <b>no benefits beyond the deliverable fee</b> (no PF, ESI, gratuity, medical, paid leave, or severance).<br/>"
        "<b>(b) Disbursement & Liability Limitation:</b> Remuneration will be credited to your Bank A/c / UPI within standard settlement timelines following QA sign-off. Maximum liability of DataCatalyst, its partners, and advisors shall be strictly limited to approved deliverable fees earned.",
        style_body
    ))

    # Section 4: Quality Standards & Audit
    story.append(Paragraph("4. QUALITY STANDARDS, AUDIT & RE-RECORDINGS", style_heading))
    story.append(Paragraph(
        "Recordings are audited through automated acoustic QC checks (ITU-R BS.1770-4 gated speech LUFS, crest factor, noise floor, 0–24kHz Nyquist spectrogram) and client QA review. "
        "Any sentence flagged for acoustic flaws, pronunciation errors, clipping, or reflections must be re-recorded at no additional charge until full clearance is achieved. Payment is contingent upon verified, approved speech data.",
        style_body
    ))

    # Section 5: Unrestricted IP & AI Data Rights (NO Voice-Cloning Guarantee)
    story.append(Paragraph("5. INTELLECTUAL PROPERTY & UNRESTRICTED AI DATA RIGHTS", style_heading))
    story.append(Paragraph(
        "<b>(a) Commissioned Work & Absolute Assignment:</b> All recordings constitute commissioned works (\"work made for hire\" under Section 17, Indian Copyright Act, 1957). You hereby irrevocably, unconditionally, and perpetually assign and transfer to M/s DataCatalyst and its designated enterprise clients all worldwide rights, title, and ownership in the recordings across all media now known or developed in the future.<br/>"
        "<b>(b) Full AI & Speech Model Rights:</b> You expressly consent to the unrestricted use, processing, acoustic modeling, speech recognition, text-to-speech (TTS) synthesis, voice model training, commercial distribution, and algorithmic sub-licensing of your speech data by DataCatalyst and its clients worldwide.<br/>"
        "<b>(c) Waiver of Moral Rights & No Royalties:</b> You hereby waive all moral rights (under Section 57 of the Copyright Act), rights of inspection, or approval, and confirm that deliverable pay constitutes full and final consideration with zero recurring royalties.",
        style_body
    ))

    # Section 6: Confidentiality, Script Protection & Indemnity
    story.append(Paragraph("6. CONFIDENTIALITY, SCRIPT PROTECTION & INDEMNITY", style_heading))
    story.append(Paragraph(
        "You agree to maintain strict confidentiality regarding all project texts, scripts, client identities, and commercial rates. "
        "You shall not extract, distribute, or publish project materials. You agree to indemnify and hold harmless DataCatalyst, Voclara, and its clients against any damages or losses arising from your breach of confidentiality or unauthorized audio submission.",
        style_body
    ))

    # Section 7: Term, Termination & Governing Law
    story.append(Paragraph("7. CONTRACT TERM, TERMINATION & GOVERNING LAW", style_heading))
    story.append(Paragraph(
        "This contract concludes upon QA approval of the Phase 1 milestone. The Company reserves the right to terminate immediately upon breach of confidentiality or acoustic failure. "
        "Governed by the laws of India; disputes shall be subject to the exclusive jurisdiction of competent courts in Rajasthan, India.",
        style_body
    ))
    story.append(Spacer(1, 2))

    # ------------------ SIGN-OFF BLOCK (DIVYAM - NO CLAUSE 9 / ACCEPTANCE BOX) ------------------
    signoff_data = [
        [
            Paragraph(
                "<b>FOR AND ON BEHALF OF:<br/>M/S DATACATALYST (VOCLARA OPERATIONS)</b><br/><br/><br/>"
                "__________________________________________<br/>"
                "<b>DIVYAM</b><br/>"
                "Authorized Representative / Technology Advisor<br/>"
                "Official Email: divyam@datacatalyst.in &nbsp;|&nbsp; Web: voclara.com<br/>"
                f"Issuance Date: {disp_date}",
                style_body
            )
        ]
    ]

    signoff_table = Table(signoff_data, colWidths=[320], hAlign='LEFT')
    signoff_table.setStyle(TableStyle([
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(signoff_table)

    # Build PDF with custom NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF generated successfully at: {output_path}")

def render_pdf_to_images(pdf_path, output_dir):
    doc = fitz.open(pdf_path)
    os.makedirs(output_dir, exist_ok=True)
    generated_images = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=200)
        img_path = os.path.join(output_dir, f"appointment_letter_page_{i+1}.png")
        pix.save(img_path)
        generated_images.append(img_path)
        print(f"Saved page {i+1} image to: {img_path}")
    return generated_images

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Project Epsilon Appointment Letter PDF")
    parser.add_argument("--name", default="", help="Candidate Full Name (leaves fillable line if empty)")
    parser.add_argument("--phone", default="", help="Mobile / WhatsApp number")
    parser.add_argument("--email", default="", help="Email address")
    parser.add_argument("--speaker-id", default="", help="Speaker ID (e.g. spk_01)")
    parser.add_argument("--language", default="", help="Target recording language")
    parser.add_argument("--ref-no", default="", help="Document Reference Number")
    parser.add_argument("--date", default="", help="Effective Date (DD/MM/YYYY)")
    default_output = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "work contracts", "Project_Epsilon_Appointment_Letter_Format.pdf")
    parser.add_argument("--output", default=default_output, help="Output PDF Path")
    parser.add_argument("--render-images", action="store_true", default=True, help="Render 200 DPI PNG images for preview")

    args = parser.parse_args()

    info = {
        "name": args.name,
        "phone": args.phone,
        "email": args.email,
        "speaker_id": args.speaker_id,
        "language": args.language,
        "ref_no": args.ref_no,
        "date": args.date,
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    generate_pdf(args.output, candidate_info=info)

    if args.render_images:
        artifact_dir = r"C:\Users\manoj\.gemini\antigravity-ide\brain\6efcce7b-faa4-45a1-b777-b956c14819d7"
        render_pdf_to_images(args.output, artifact_dir)
