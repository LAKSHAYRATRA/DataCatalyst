import os
import sys
import json
import argparse
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, doc_title="DataCatalyst Agreement", **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []
        self.doc_title = doc_title

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
        self.setFont("Helvetica", 7.2)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header on page > 1
        if self._pageNumber > 1:
            self.drawString(36, 842 - 26, f"DataCatalyst / Voclara — {self.doc_title}")
            self.drawRightString(595 - 36, 842 - 26, "Strictly Confidential · B2B Agreement")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(36, 842 - 30, 595 - 36, 842 - 30)

        # Footer on all pages
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(36, 26, 595 - 36, 26)
        
        self.drawString(36, 17, "M/s DataCatalyst · Platform: Voclara (voclara.com) · Regd. under Indian Partnership Act, 1932")
        self.drawRightString(595 - 36, 17, f"Page {self._pageNumber} of {page_count} · Private & Legally Binding")
        self.restoreState()


def get_styles():
    styles = getSampleStyleSheet()
    c_primary = colors.HexColor("#0f172a")     # Slate 900
    c_accent = colors.HexColor("#0369a1")      # Blue 700
    c_dark = colors.HexColor("#1e293b")        # Slate 800
    c_card_bg = colors.HexColor("#f8fafc")     # Slate 50
    c_border = colors.HexColor("#cbd5e1")      # Slate 300

    style_title = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=14.5,
        textColor=c_primary,
        alignment=1,
        spaceAfter=1
    )

    style_subtitle = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=c_accent,
        alignment=1,
        spaceAfter=3
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
        spaceBefore=3,
        spaceAfter=1
    )

    style_body = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.1,
        leading=9.2,
        textColor=c_dark,
        spaceAfter=1.5
    )

    style_table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.1,
        leading=9,
        textColor=c_dark
    )

    style_table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.1,
        leading=9,
        textColor=c_primary
    )

    return {
        'title': style_title,
        'subtitle': style_subtitle,
        'subject': style_subject,
        'heading': style_heading,
        'body': style_body,
        'cell': style_table_cell,
        'cell_bold': style_table_cell_bold,
        'c_primary': c_primary,
        'c_accent': c_accent,
        'c_dark': c_dark,
        'c_card_bg': c_card_bg,
        'c_border': c_border
    }


# ==============================================================================
# 1. STUDIO PARTNER AGREEMENT
# ==============================================================================
def build_studio_agreement(output_path, studio_info=None):
    if studio_info is None:
        studio_info = {}

    st_name = studio_info.get("studio_name", "").strip() or studio_info.get("name", "").strip() or "SoundCraft Media Studios LLP"
    st_code = studio_info.get("studio_code", "").strip() or studio_info.get("vendor_code", "").strip() or studio_info.get("code", "").strip() or "STD_DEL_102"
    st_owner = studio_info.get("owner_name", "").strip() or studio_info.get("contact_person", "").strip() or "Rohit Sharma"
    st_phone = studio_info.get("phone", "").strip() or "9810123456"
    st_email = studio_info.get("email", "").strip() or "contact@soundcraftstudios.in"
    st_city = studio_info.get("city", "").strip() or "New Delhi, Delhi"
    st_pan = studio_info.get("pan_gst", "").strip() or studio_info.get("pan_number", "").strip() or "AABCS1423K / 07AABCS1423K1Z1"
    st_ref = studio_info.get("ref_no", "").strip() or f"DC / VOC / STD / 2026 / {st_code}"
    st_date = studio_info.get("date", "").strip() or studio_info.get("date_of_acceptance", "").strip() or "06 / 09 / 2026"
    st_rate = studio_info.get("contributor_rate", "$10.00 per Approved Net Speech Hour").strip()

    disp_st_name = f"<b>{st_name}</b>"
    disp_st_owner = f"<b>{st_owner}</b>"
    disp_st_phone = f"<b>+91 - {st_phone}</b>"
    disp_st_email = f"<b>{st_email}</b>"
    disp_st_city = f"<b>{st_city}</b>"
    disp_st_pan = f"<b>{st_pan}</b>"
    disp_ref = st_ref
    disp_date = st_date

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=26,
        bottomMargin=30
    )

    st = get_styles()
    story = []

    # Header
    hdr = [[
        Paragraph("<b>DATACATALYST</b><br/><font size=6.8 color='#0369a1'>VOCLARA VOICE OPERATIONS NETWORK</font>", ParagraphStyle('H1', fontName='Helvetica-Bold', fontSize=12, leading=14, textColor=st['c_primary'])),
        Paragraph("<b>M/s DataCatalyst</b><br/><font size=6.3 color='#64748b'>Regd. under Indian Partnership Act, 1932<br/>Operations Base: Sri Ganganagar, Rajasthan - 335001<br/>Web: voclara.com | Official Email: divyam@datacatalyst.in</font>", ParagraphStyle('H2', fontName='Helvetica', fontSize=6.5, leading=8.5, textColor=st['c_dark'], alignment=2))
    ]]
    story.append(Table(hdr, colWidths=[260, 263], style=[('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 2)]))
    story.append(HRFlowable(width="100%", thickness=1.2, color=st['c_primary'], spaceBefore=1, spaceAfter=3))

    # Ref & Date
    ref_table = Table([[
        Paragraph(f"<b>DOCUMENT REF:</b> {disp_ref}", st['cell_bold']),
        Paragraph(f"<b>EFFECTIVE DATE:</b> {disp_date}", ParagraphStyle('R', parent=st['cell_bold'], alignment=2))
    ]], colWidths=[280, 243], style=[('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 2)])
    story.append(ref_table)

    story.append(Paragraph("RECORDING STUDIO PARTNER MASTER AGREEMENT", st['title']))
    story.append(Paragraph("TOTAL PROJECT ALLOCATION · DIRECT CONTRIBUTOR DISBURSEMENT · STUDIO FACILITY & MARGIN PAYOUT", st['subtitle']))

    # Partner Details Card
    p_data = [
        [
            Paragraph("<b>Studio / Entity Name:</b>", st['cell_bold']),
            Paragraph(disp_st_name, st['cell']),
            Paragraph("<b>Authorized Person:</b>", st['cell_bold']),
            Paragraph(disp_st_owner, st['cell'])
        ],
        [
            Paragraph("<b>Contact / WhatsApp:</b>", st['cell_bold']),
            Paragraph(disp_st_phone, st['cell']),
            Paragraph("<b>City / State:</b>", st['cell_bold']),
            Paragraph(disp_st_city, st['cell'])
        ],
        [
            Paragraph("<b>Official Email:</b>", st['cell_bold']),
            Paragraph(disp_st_email, st['cell']),
            Paragraph("<b>PAN / GST No:</b>", st['cell_bold']),
            Paragraph(disp_st_pan, st['cell'])
        ]
    ]
    p_table = Table(p_data, colWidths=[115, 225, 85, 98], style=[
        ('BACKGROUND', (0,0), (-1,-1), st['c_card_bg']),
        ('BOX', (0,0), (-1,-1), 0.7, st['c_border']),
        ('INNERGRID', (0,0), (-1,-1), 0.3, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ])
    story.append(p_table)
    story.append(Spacer(1, 2))

    story.append(Paragraph(
        "<b>SUBJECT: MASTER B2B SERVICE AGREEMENT FOR RECORDING STUDIO ACOUSTIC EXECUTION AND CONTRIBUTOR MANAGEMENT</b>",
        st['subject']
    ))

    story.append(Paragraph(
        "This Studio Partner Master Agreement (\"Agreement\") is entered into on the Effective Date between <b>M/s DataCatalyst</b> (\"Company\"), "
        "administering the <b>Voclara</b> voice AI operations platform, and the Studio Partner identified above (\"Studio\"). "
        "The Studio agrees to provide studio facilities, acoustic screening, and local voice contributor execution under the strict terms below:",
        st['body']
    ))

    # Clause 1: Total Project Rate, Contributor Direct Pay & Studio Facility Fee
    story.append(Paragraph("1. COMMERCIAL MODEL — TOTAL PROJECT RATE, CONTRIBUTOR DIRECT PAY & STUDIO FEE", st['heading']))
    story.append(Paragraph(
        "<b>(a) Total Project Rate & Studio-Set Contributor Payrate:</b> For each project milestone executed at the Studio, DataCatalyst allocates an agreed Total Project Payrate per approved valid net speech hour. "
        "The Studio designates and sets the specific contributor payrate (e.g., $10 per approved hour or as specified in the applicable Project Work Order) to be disbursed to the voice contributors recording at its facility.<br/>"
        "<b>(b) Direct Contributor Disbursement by DataCatalyst:</b> In all projects, <b>DataCatalyst directly processes and disburses the Studio-set contributor payrate directly to the individual voice contributors</b> upon 100% QA audit and client clearance. The Studio warrants that it has formally agreed upon this rate with its contributors.<br/>"
        "<b>(c) Studio Facility, Engineering & Margin Payout:</b> DataCatalyst shall disburse the remaining balance (Total Project Payrate minus the Studio-designated Contributor Payrate) directly to the Studio as its <b>Studio Facility, Management, and Sound Engineering Fee</b> for providing the certified acoustic recording environment and local session supervision.<br/>"
        "<b>(d) Zero Labor & Statutory Liability:</b> All contributors recording at the Studio are independent artists. DataCatalyst acts solely as the project platform and operations clearinghouse, holding <b>zero employer-employee, PF, ESI, gratuity, or labor liability</b>. The Studio shall indemnify DataCatalyst against any contributor claim or dispute regarding rate agreements set by the Studio.",
        st['body']
    ))

    # Clause 2: Mandatory Studio Facility Recording
    story.append(Paragraph("2. MANDATORY STUDIO-FACILITY RECORDING & ACOUSTIC COMPLIANCE", st['heading']))
    story.append(Paragraph(
        "<b>(a) Mandatory On-Premises Recording:</b> All contributors assigned to the Studio must perform their recording sessions <b>strictly within the Studio's certified physical recording facility</b>. No remote, untreated, or home recordings are permitted under this partner tier.<br/>"
        "<b>(b) Studio Acoustic Specifications:</b> The Studio warrants that all recordings meet studio-grade technical standards: ambient noise floor below -60 dB, zero audible reflections or reverberation, single-channel mono 48 kHz / 24-bit PCM/FLAC capture, professional condenser microphones with pop-filters, and pristine gain staging (no clipping or digital compression).",
        st['body']
    ))

    # Clause 3: QA Clearance & Payment Pre-Condition
    story.append(Paragraph("3. QA AUDIT, RE-RECORDINGS & PAYMENT PRE-CONDITIONS", st['heading']))
    story.append(Paragraph(
        "<b>(a) Client QA Sign-Off as Condition Precedent:</b> Payment is strictly contingent upon 100% Quality Assurance (QA) clearance and formal acceptance by the Company's enterprise clients (including ITU-R BS.1770-4 LUFS loudness and spectrogram audit). "
        "Rejected or failed audio receives <b>zero remuneration</b>.<br/>"
        "<b>(b) Obligatory Re-Recordings:</b> Any sentence or session flagged for pronunciation errors, background noise, or audio anomalies must be re-recorded by the Studio at <b>zero additional cost</b> to DataCatalyst.<br/>"
        "<b>(c) Milestone Delivery:</b> Milestones are all-or-nothing deliverables. Abandoned or partially submitted speaker batches carry zero commercial value and shall not be eligible for payout.",
        st['body']
    ))

    # Page Break for clean 2-page document
    story.append(PageBreak())

    # Clause 4: IP & Voice Data Rights
    story.append(Paragraph("4. INTELLECTUAL PROPERTY & UNRESTRICTED AI DATA ASSIGNMENT", st['heading']))
    story.append(Paragraph(
        "<b>(a) Flow-Down Assignment:</b> The Studio warrants that it has secured, or will secure prior to recording, written, legally binding assignments from every contributor assigning 100% of worldwide rights, titles, and interests in all recordings to M/s DataCatalyst and its clients as commissioned works (\"work made for hire\" under Sec 17, Indian Copyright Act, 1957).<br/>"
        "<b>(b) Unrestricted AI, TTS & Speech Modeling Rights:</b> The Studio explicitly acknowledges and transfers all rights to train speech recognition, text-to-speech (TTS), neural voice synthesis, and foundation AI models on the speech data, with an express, irrevocable waiver of all moral rights (under Sec 57 of the Copyright Act) and claims to secondary royalties.",
        st['body']
    ))

    # Clause 5: Account Termination & Suspension Rights
    story.append(Paragraph("5. ABSOLUTE RIGHT TO TERMINATE & SUSPEND STUDIO ACCOUNT", st['heading']))
    story.append(Paragraph(
        "<b>(a) Immediate Unilateral Termination:</b> DataCatalyst expressly reserves the absolute, unilateral right to <b>immediately terminate this Agreement, deactivate or ban the Studio's Voclara account, and revoke all project access</b> without prior notice or financial penalty in the event of: "
        "(i) Quality default or repeated QC rejections, (ii) Submission of fraudulent, duplicate, pre-recorded, or synthetic/AI audio, (iii) Incomplete milestone abandonment, (iv) Breach of confidentiality, (v) Misrepresentation or dispute of contributor payrates by the Studio, or (vi) Downstream client project cancellation.<br/>"
        "<b>(b) Forfeiture of Pending Fees for Fraud:</b> If any fraudulent or synthetic speech submission is detected, all pending disbursements for the contaminated batches shall be immediately forfeited as liquidated damages.",
        st['body']
    ))

    # Clause 6: Non-Circumvention & Non-Disclosure
    story.append(Paragraph("6. STRICT NON-CIRCUMVENTION, EXCLUSIVITY & NON-DISCLOSURE", st['heading']))
    story.append(Paragraph(
        "<b>(a) Non-Circumvention (24-Month Restraint):</b> The Studio covenants and agrees that neither it, nor its owners, directors, affiliates, staff, or subcontractors, shall directly or indirectly approach, solicit, contact, negotiate with, divert, or contract with any client, customer, or enterprise partner of DataCatalyst for a period of <b>twenty-four (24) months</b> following termination of this Agreement.<br/>"
        "<b>(b) Strict Confidentiality:</b> All scripts, client guidelines, portal access codes, and commercial terms are strictly confidential. Unauthorized disclosure or extraction of client text scripts is actionable under civil and criminal law.",
        st['body']
    ))

    # Clause 7: Limitation of Liability & Governing Law
    story.append(Paragraph("7. LIMITATION OF LIABILITY & GOVERNING LAW", st['heading']))
    story.append(Paragraph(
        "<b>(a) Liability Cap:</b> Maximum cumulative liability of DataCatalyst, its partners, advisors, and representatives to the Studio under any circumstance shall be strictly limited to the actual approved and unpaid deliverable fees earned. In no event shall DataCatalyst or its advisors incur any indirect or consequential damages.<br/>"
        "<b>(b) Governing Law & Jurisdiction:</b> Governed by the laws of India; all disputes are subject exclusively to the competent courts in Sri Ganganagar / Rajasthan, India.",
        st['body']
    ))
    story.append(Spacer(1, 3))

    # Sign-off Table
    story.append(Paragraph("8. AUTHORIZATION & FORMAL ELECTRONIC EXECUTION", st['heading']))
    sig_data = [
        [
            Paragraph("<b>FOR AND ON BEHALF OF:<br/>M/S DATACATALYST (VOCLARA OPERATIONS)</b>", st['cell_bold']),
            Paragraph("<b>FOR AND ON BEHALF OF STUDIO PARTNER:<br/>" + st_name.upper() + "</b>", st['cell_bold'])
        ],
        [
            Paragraph(
                "<br/>"
                "<b>DIVYAM</b><br/>"
                "Authorized Representative / Technology Advisor<br/>"
                "M/s DataCatalyst / Voclara Platform<br/>"
                "Official Email: divyam@datacatalyst.in<br/>"
                f"Execution Date: {disp_date}",
                st['cell']
            ),
            Paragraph(
                "<font color='#047857'><b>[ELECTRONICALLY SIGNED & VERIFIED]</b></font><br/>"
                "<font size=5.5 color='#64748b'>Signed via Voclara Partner Onboarding Portal · Audit Trail Verified</font><br/><br/>"
                f"<b>Authorized Signatory:</b> {st_owner}<br/>"
                "<b>Designation:</b> Authorized Studio Head<br/>"
                f"<b>Studio Entity:</b> {st_name} ({st_code})<br/>"
                f"<b>PAN / GST No:</b> {st_pan}<br/>"
                f"<b>Official Email:</b> {st_email}<br/>"
                f"<b>Date of Acceptance:</b> {disp_date}<br/>"
                "<font size=5.5 color='#64748b'>Legally Binding Electronic Acceptance (Information Technology Act, 2000)</font>",
                st['cell']
            )
        ]
    ]
    sig_table = Table(sig_data, colWidths=[255, 268], hAlign='LEFT')
    sig_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), st['c_card_bg']),
        ('BOX', (0,0), (-1,-1), 0.7, st['c_border']),
        ('INNERGRID', (0,0), (-1,-1), 0.3, st['c_border']),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(sig_table)

    doc.build(story, canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, doc_title="Studio Partner Agreement", **kwargs))
    print(f"Studio Agreement generated at: {output_path}")


# ==============================================================================
# 2. SOURCING VENDOR AGREEMENT
# ==============================================================================
def build_vendor_agreement(output_path, vendor_info=None):
    if vendor_info is None:
        vendor_info = {}

    v_name = vendor_info.get("vendor_name", "").strip() or vendor_info.get("name", "").strip() or "Apex Talent Sourcing Solutions"
    v_code = vendor_info.get("vendor_code", "").strip() or vendor_info.get("code", "").strip() or "VEN_MUM_204"
    v_owner = vendor_info.get("signatory_name", "").strip() or vendor_info.get("owner_name", "").strip() or vendor_info.get("contact_person", "").strip() or "Vikramaditya Rao"
    v_phone = vendor_info.get("phone", "").strip() or "9820098765"
    v_email = vendor_info.get("email", "").strip() or "partnerships@apextalent.co.in"
    v_address = vendor_info.get("address", "").strip() or "Flat 402, Green Valley Apartments"
    v_city = vendor_info.get("city", "").strip() or "Mumbai"
    v_state = vendor_info.get("state", "").strip() or "Maharashtra"
    v_city_state = f"{v_city}, {v_state}" if (v_city and v_state) else (vendor_info.get("city_state", "").strip() or v_city or v_state or "Mumbai, Maharashtra")
    v_ref = vendor_info.get("ref_no", "").strip() or f"DC / VOC / VEN / 2026 / {v_code}"
    v_date = vendor_info.get("date", "").strip() or vendor_info.get("date_of_acceptance", "").strip() or "06 / 09 / 2026"
    v_margin = vendor_info.get("margin_terms", "10% Margin per Approved Valid Speech Hour").strip()

    disp_v_name = f"<b>{v_name}</b>"
    disp_v_owner = f"<b>{v_owner}</b>"
    disp_v_phone = f"<b>+91 - {v_phone}</b>"
    disp_v_email = f"<b>{v_email}</b>"
    disp_v_city = f"<b>{v_city_state}</b>"
    disp_v_address = f"<b>{v_address}</b>"
    disp_ref = v_ref
    disp_date = v_date

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=26,
        bottomMargin=30
    )

    st = get_styles()
    story = []

    # Header
    hdr = [[
        Paragraph("<b>DATACATALYST</b><br/><font size=6.8 color='#0369a1'>VOCLARA VOICE OPERATIONS NETWORK</font>", ParagraphStyle('H1', fontName='Helvetica-Bold', fontSize=12, leading=14, textColor=st['c_primary'])),
        Paragraph("<b>M/s DataCatalyst</b><br/><font size=6.3 color='#64748b'>Regd. under Indian Partnership Act, 1932<br/>Operations Base: Sri Ganganagar, Rajasthan - 335001<br/>Web: voclara.com | Official Email: divyam@datacatalyst.in</font>", ParagraphStyle('H2', fontName='Helvetica', fontSize=6.5, leading=8.5, textColor=st['c_dark'], alignment=2))
    ]]
    story.append(Table(hdr, colWidths=[260, 263], style=[('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 2)]))
    story.append(HRFlowable(width="100%", thickness=1.2, color=st['c_primary'], spaceBefore=1, spaceAfter=3))

    # Ref & Date
    ref_table = Table([[
        Paragraph(f"<b>DOCUMENT REF:</b> {disp_ref}", st['cell_bold']),
        Paragraph(f"<b>EFFECTIVE DATE:</b> {disp_date}", ParagraphStyle('R', parent=st['cell_bold'], alignment=2))
    ]], colWidths=[280, 243], style=[('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 2)])
    story.append(ref_table)

    story.append(Paragraph("TALENT SOURCING VENDOR MASTER AGREEMENT", st['title']))
    story.append(Paragraph("PARTICIPANT DIRECT REMUNERATION · VENDOR COMMISSION MARGIN · PERFORMANCE CONTINGENCY", st['subtitle']))

    # Partner Details Card
    p_data = [
        [
            Paragraph("<b>Vendor / Sourcing Head:</b>", st['cell_bold']),
            Paragraph(disp_v_name, st['cell']),
            Paragraph("<b>Authorized Name:</b>", st['cell_bold']),
            Paragraph(disp_v_owner, st['cell'])
        ],
        [
            Paragraph("<b>Mobile / WhatsApp:</b>", st['cell_bold']),
            Paragraph(disp_v_phone, st['cell']),
            Paragraph("<b>City / State:</b>", st['cell_bold']),
            Paragraph(disp_v_city, st['cell'])
        ],
        [
            Paragraph("<b>Residential Address:</b>", st['cell_bold']),
            Paragraph(disp_v_address, st['cell']),
            Paragraph("<b>Official Email:</b>", st['cell_bold']),
            Paragraph(disp_v_email, st['cell'])
        ]
    ]
    p_table = Table(p_data, colWidths=[115, 225, 85, 98], style=[
        ('BACKGROUND', (0,0), (-1,-1), st['c_card_bg']),
        ('BOX', (0,0), (-1,-1), 0.7, st['c_border']),
        ('INNERGRID', (0,0), (-1,-1), 0.3, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ])
    story.append(p_table)
    story.append(Spacer(1, 2))

    story.append(Paragraph(
        "<b>SUBJECT: MASTER B2B AGREEMENT FOR PARTICIPANT SOURCING, RECRUITMENT AND COORDINATION COMMISSION</b>",
        st['subject']
    ))

    story.append(Paragraph(
        "This Sourcing Vendor Master Agreement (\"Agreement\") is entered into on the Effective Date between <b>M/s DataCatalyst</b> (\"Company\"), "
        "administering the <b>Voclara</b> voice AI operations platform, and the Sourcing Vendor / Agency named above (\"Vendor\"). "
        "The Vendor is engaged on a non-exclusive basis to recruit, onboard, and coordinate participants for designated voice projects under the covenants detailed below:",
        st['body']
    ))

    # Clause 1: Commercial Model (Participant Pay + Vendor Margin)
    story.append(Paragraph("1. COMMERCIAL STRUCTURE — PARTICIPANT PAYRATE & VENDOR MARGIN", st['heading']))
    story.append(Paragraph(
        "<b>(a) Direct Participant Payrate:</b> Voice participants / contributors sourced by the Vendor and onboarded onto the Voclara platform under the Vendor's account shall receive the designated <b>project payrate directly from DataCatalyst</b> (calculated strictly per approved valid net speech hour). "
        "The Vendor shall not deduct, skim, or withhold any portion of the participant's agreed deliverable fee.<br/>"
        "<b>(b) Vendor Commission / Sourcing Margin:</b> In consideration of the Vendor's sourcing, screening, coordination, and administrative assistance, the Company shall pay the Vendor a <b>designated margin / commission</b> (as stipulated in the project work order, e.g., a fixed percentage margin or fixed unit rate per approved net speech hour) for speech audio delivered by participants under the Vendor's code.<br/>"
        "<b>(c) Zero Benefit Entitlement:</b> Vendor and its participants are independent contractors. Neither party is entitled to PF, ESI, gratuity, insurance, or statutory payroll benefits.",
        st['body']
    ))

    # Clause 2: QA Pre-Condition for Margin Payout
    story.append(Paragraph("2. QA ACCEPTANCE CONTINGENCY FOR VENDOR MARGIN", st['heading']))
    story.append(Paragraph(
        "<b>(a) Approved Speech Hours Only:</b> The Vendor's margin is calculated and payable <b>strictly on approved, cleared, client-accepted valid speech hours</b>. "
        "If participant audio is rejected for background static, pronunciation errors, clipping, acoustic faults, or failure to follow scripts, <b>NO vendor margin shall accrue on the rejected audio</b>.<br/>"
        "<b>(b) Re-Recording Facilitation:</b> The Vendor is obligated to ensure that its sourced participants promptly re-record any flagged sentences. Persistent failure of participants to clear QA audit may result in participant disqualification and forfeiture of associated vendor commissions.",
        st['body']
    ))

    # Clause 3: Participant Screening & Quota Obligations
    story.append(Paragraph("3. SOURCING COMPLIANCE & RECRUITMENT QUALITY", st['heading']))
    story.append(Paragraph(
        "<b>(a) Demographic & Language Authenticity:</b> The Vendor warrants that all sourced participants are genuine, native speakers of the target language/dialect, meet client demographic specifications (age, gender, accent), and possess compatible recording hardware and clean acoustic spaces.<br/>"
        "<b>(b) Independent Contractor Status:</b> Sourced participants are independent contributors. Vendor shall not misrepresent Voclara or DataCatalyst as a regular employer.",
        st['body']
    ))

    # Page Break for clean 2-page document
    story.append(PageBreak())

    # Clause 4: Anti-Fraud & Synthetic Audio Ban
    story.append(Paragraph("4. STRICT ZERO-TOLERANCE ANTI-FRAUD & INTEGRITY POLICY", st['heading']))
    story.append(Paragraph(
        "<b>(a) Absolute Ban on Synthetic & Pre-Recorded Audio:</b> The Vendor warrants that all audio submitted by its participants constitutes authentic, live human recordings. "
        "The use of text-to-speech (TTS), voice changers, AI synthetic audio, automated bots, multi-accounting, VPN spoofing, or submitting the same speaker under multiple IDs is <b>strictly prohibited</b>.<br/>"
        "<b>(b) Immediate Disqualification & Penalty:</b> Detection of any fraudulent activity across the Vendor's participant pool shall result in <b>immediate deactivation of the Vendor's account</b>, permanent blacklisting, forfeiture of all unpaid vendor margins, and full indemnification of DataCatalyst against client clawbacks.",
        st['body']
    ))

    # Clause 5: Absolute Right to Terminate & Account Deactivation
    story.append(Paragraph("5. ABSOLUTE RIGHT TO TERMINATE & DEACTIVATE VENDOR ACCOUNT", st['heading']))
    story.append(Paragraph(
        "<b>(a) Unilateral Right to Terminate:</b> DataCatalyst holds the unrestricted, unilateral right to <b>terminate this Agreement, freeze vendor margins, deactivate the Vendor's portal account, and unlink all participants</b> at any time with immediate effect if: "
        "(i) The Vendor fails to meet participant quotas or delivery timelines, (ii) The Vendor's participants exhibit unacceptably high QA rejection rates, (iii) The Vendor commits a breach of confidentiality or anti-fraud rules, or (iv) The downstream enterprise client cancels or concludes the project.<br/>"
        "<b>(b) No Termination Damages:</b> Upon termination, the Company shall have no liability to the Vendor other than disbursing accrued, client-approved margins earned prior to the effective date of termination.",
        st['body']
    ))

    # Clause 6: Non-Circumvention & Client Non-Solicitation
    story.append(Paragraph("6. NON-CIRCUMVENTION & NON-SOLICITATION (24 MONTHS)", st['heading']))
    story.append(Paragraph(
        "<b>(a) Non-Circumvention (24-Month Restraint):</b> The Vendor covenants and agrees that neither it, nor its affiliates, employees, recruiters, or sub-agents, shall directly or indirectly approach, solicit, contact, divert, or contract with any client, customer, or enterprise partner of DataCatalyst for a period of <b>twenty-four (24) months</b> following termination.<br/>"
        "<b>(b) Participant Protection:</b> Sourced participants onboarded onto Voclara become registered contributors of the platform. Vendor shall not re-route active project participants to competing platforms.",
        st['body']
    ))

    # Clause 7: Confidentiality, Limitation of Liability & Law
    story.append(Paragraph("7. CONFIDENTIALITY, LIMITATION OF LIABILITY & GOVERNING LAW", st['heading']))
    story.append(Paragraph(
        "<b>(a) Confidentiality & IP:</b> All project scripts, prompt lists, client identifiers, and technical workflows are confidential trade secrets. All IP rights in voice data are assigned to DataCatalyst/clients without moral rights claims.<br/>"
        "<b>(b) Liability Cap:</b> Cumulative liability of DataCatalyst, its partners, and advisors to the Vendor shall be strictly capped at the cleared, unpaid vendor commissions earned. Zero personal liability shall attach to Company representatives.<br/>"
        "<b>(c) Governing Law:</b> Governed by the laws of India; competent courts in Sri Ganganagar / Rajasthan, India hold exclusive jurisdiction.",
        st['body']
    ))
    story.append(Spacer(1, 3))

    # Sign-off Table
    story.append(Paragraph("8. AUTHORIZATION & FORMAL ELECTRONIC EXECUTION", st['heading']))
    sig_data = [
        [
            Paragraph("<b>FOR AND ON BEHALF OF:<br/>M/S DATACATALYST (VOCLARA OPERATIONS)</b>", st['cell_bold']),
            Paragraph("<b>FOR AND ON BEHALF OF SOURCING VENDOR:<br/>" + v_name.upper() + "</b>", st['cell_bold'])
        ],
        [
            Paragraph(
                "<br/>"
                "<b>DIVYAM</b><br/>"
                "Authorized Representative / Technology Advisor<br/>"
                "M/s DataCatalyst / Voclara Platform<br/>"
                "Official Email: divyam@datacatalyst.in<br/>"
                f"Execution Date: {disp_date}",
                st['cell']
            ),
            Paragraph(
                "<font color='#047857'><b>[ELECTRONICALLY SIGNED & VERIFIED]</b></font><br/>"
                "<font size=5.5 color='#64748b'>Signed via Voclara Partner Onboarding Portal · Audit Trail Verified</font><br/><br/>"
                f"<b>Authorized Person:</b> {v_owner}<br/>"
                "<b>Designation:</b> Talent Sourcing Partner<br/>"
                f"<b>Vendor Name & Code:</b> {v_name} ({v_code})<br/>"
                f"<b>Residential Address:</b> {v_address}<br/>"
                f"<b>City & State:</b> {v_city_state}<br/>"
                f"<b>Mobile Number:</b> +91 - {v_phone}<br/>"
                f"<b>Date of Acceptance:</b> {disp_date}<br/>"
                "<font size=5.5 color='#64748b'>Legally Binding Electronic Acceptance (Information Technology Act, 2000)</font>",
                st['cell']
            )
        ]
    ]
    sig_table = Table(sig_data, colWidths=[255, 268], hAlign='LEFT')
    sig_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), st['c_card_bg']),
        ('BOX', (0,0), (-1,-1), 0.7, st['c_border']),
        ('INNERGRID', (0,0), (-1,-1), 0.3, st['c_border']),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(sig_table)

    doc.build(story, canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, doc_title="Sourcing Vendor Agreement", **kwargs))
    print(f"Vendor Agreement generated at: {output_path}")


def render_pdf_to_images(pdf_path, output_dir, prefix):
    import fitz  # PyMuPDF
    doc = fitz.open(pdf_path)
    os.makedirs(output_dir, exist_ok=True)
    generated = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=200)
        img_path = os.path.join(output_dir, f"{prefix}_page_{i+1}.png")
        pix.save(img_path)
        generated.append(img_path)
        print(f"Saved {prefix} page {i+1} image to: {img_path}")
    return generated


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Studio and Vendor Master Agreements")
    parser.add_argument("--type", choices=["studio", "vendor", "both"], default="both", help="Agreement type to generate")
    parser.add_argument("--data", default=None, help="JSON string or file path containing partner info")
    parser.add_argument("--output-dir", default=None, help="Output directory for generated PDFs")
    parser.add_argument("--output-file", default=None, help="Direct output file path for the generated PDF")
    parser.add_argument("--render-images", action="store_true", help="Render PDF pages to PNG images")
    args = parser.parse_args()

    work_dir = args.output_dir or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "work contracts")
    os.makedirs(work_dir, exist_ok=True)
    artifact_dir = r"C:\Users\manoj\.gemini\antigravity-ide\brain\6efcce7b-faa4-45a1-b777-b956c14819d7"

    partner_data = None
    if args.data:
        if os.path.exists(args.data):
            with open(args.data, "r", encoding="utf-8") as f:
                partner_data = json.load(f)
        else:
            partner_data = json.loads(args.data)

    if args.output_file:
        out_dir = os.path.dirname(os.path.abspath(args.output_file))
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        if args.type == "studio":
            build_studio_agreement(args.output_file, partner_data)
            if args.render_images:
                render_pdf_to_images(args.output_file, artifact_dir, "studio_agreement")
        elif args.type == "vendor":
            build_vendor_agreement(args.output_file, partner_data)
            if args.render_images:
                render_pdf_to_images(args.output_file, artifact_dir, "vendor_agreement")
        else:
            build_studio_agreement(args.output_file, partner_data)
    else:
        if args.type in ["studio", "both"]:
            studio_pdf = os.path.join(work_dir, "Studio_Partner_Agreement_DataCatalyst.pdf")
            build_studio_agreement(studio_pdf, partner_data)
            if args.render_images:
                render_pdf_to_images(studio_pdf, artifact_dir, "studio_agreement")

        if args.type in ["vendor", "both"]:
            vendor_pdf = os.path.join(work_dir, "Sourcing_Vendor_Agreement_DataCatalyst.pdf")
            build_vendor_agreement(vendor_pdf, partner_data)
            if args.render_images:
                render_pdf_to_images(vendor_pdf, artifact_dir, "vendor_agreement")

