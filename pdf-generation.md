# PDF Generation Patterns — Proposal Template

Complete ReportLab code patterns for generating branded Veteran Vectors proposal PDFs matching the actual proposal styling: clean white background, centered cover, cornflower blue accents, light table styling.

## Table of Contents

1. Configuration (Colors, Consultant Info)
2. Setup & Imports
3. Paragraph Styles
4. Cover Page (Canvas-Level)
5. Page Callbacks (Header/Footer)
6. Table Builder
7. Key-Value Table Builder
8. Section Builder with KeepTogether
9. Full Document Assembly
10. Section-Specific Patterns
11. Column Width Quick Reference
12. Post-Generation Validation

---

## 1. Configuration

```python
# ── Brand Colors (single source of truth) ──
# The primary accent is a cornflower/sky blue — NOT navy
BLUE = HexColor("#6CB4EE")          # Primary accent: headings, titles, labels
BLUE_BOLD = HexColor("#5A9FD4")     # Slightly deeper for bold labels in tables
DARK_TEXT = HexColor("#333333")     # Body text
MUTED_TEXT = HexColor("#999999")    # "Prepared for" labels, date, CONFIDENTIAL
HEADER_BG = HexColor("#E8F0F8")    # Table header row background (light blue-gray)
ROW_ALT = HexColor("#F5F8FB")      # Alternating table row (very subtle)
BORDER_COLOR = HexColor("#D0D5DD") # Table borders (light gray)
WHITE = HexColor("#FFFFFF")
RULE_COLOR = HexColor("#CCCCCC")   # Horizontal rule on cover page

# ── Consultant Info (parameterized) ──
CONSULTANT = {
    'name': 'Anthony Pinto',
    'title': 'Founder',
    'company': 'Veteran Vectors LLC',
    'email': 'anthony@veteranvectors.io',
    'company_short': 'VETERAN VECTORS',
}
```

---

## 2. Setup & Imports

```python
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)

PAGE_W, PAGE_H = letter
MARGIN = 0.85 * inch
CONTENT_W = PAGE_W - 2 * MARGIN
```

---

## 3. Paragraph Styles

```python
styles = {
    'SectionTitle': ParagraphStyle(
        'SectionTitle',
        fontName='Helvetica-Bold', fontSize=16,
        textColor=BLUE, spaceBefore=20, spaceAfter=10, leading=20,
    ),
    'SubsectionTitle': ParagraphStyle(
        'SubsectionTitle',
        fontName='Helvetica-Bold', fontSize=12,
        textColor=BLUE, spaceBefore=14, spaceAfter=6, leading=16,
    ),
    'Body': ParagraphStyle(
        'Body',
        fontName='Helvetica', fontSize=10,
        textColor=DARK_TEXT, spaceBefore=4, spaceAfter=4, leading=14,
    ),
    'BodyBold': ParagraphStyle(
        'BodyBold',
        fontName='Helvetica-Bold', fontSize=10,
        textColor=DARK_TEXT, spaceBefore=4, spaceAfter=4, leading=14,
    ),
    'BlueLabelBody': ParagraphStyle(
        'BlueLabelBody',
        fontName='Helvetica', fontSize=10,
        textColor=DARK_TEXT, spaceBefore=4, spaceAfter=4, leading=14,
    ),
    'Muted': ParagraphStyle(
        'Muted',
        fontName='Helvetica', fontSize=9,
        textColor=MUTED_TEXT, spaceBefore=2, spaceAfter=2, leading=12,
    ),
    # Cover page styles (all centered)
    'CoverCompany': ParagraphStyle(
        'CoverCompany',
        fontName='Helvetica-Bold', fontSize=12,
        textColor=BLUE, alignment=TA_CENTER,
        spaceBefore=0, spaceAfter=8,
    ),
    'CoverDocType': ParagraphStyle(
        'CoverDocType',
        fontName='Helvetica', fontSize=11,
        textColor=MUTED_TEXT, alignment=TA_CENTER,
        spaceBefore=16, spaceAfter=4, leading=14,
    ),
    'CoverTitle': ParagraphStyle(
        'CoverTitle',
        fontName='Helvetica-Bold', fontSize=26,
        textColor=BLUE, alignment=TA_CENTER,
        spaceBefore=2, spaceAfter=4, leading=32,
    ),
    'CoverSubtitle': ParagraphStyle(
        'CoverSubtitle',
        fontName='Helvetica', fontSize=12,
        textColor=BLUE, alignment=TA_CENTER,
        spaceBefore=2, spaceAfter=20, leading=16,
    ),
    'CoverLabel': ParagraphStyle(
        'CoverLabel',
        fontName='Helvetica', fontSize=10,
        textColor=MUTED_TEXT, alignment=TA_CENTER,
        spaceBefore=16, spaceAfter=2,
    ),
    'CoverName': ParagraphStyle(
        'CoverName',
        fontName='Helvetica-Bold', fontSize=11,
        textColor=BLUE, alignment=TA_CENTER,
        spaceBefore=2, spaceAfter=1,
    ),
    'CoverDetail': ParagraphStyle(
        'CoverDetail',
        fontName='Helvetica', fontSize=10,
        textColor=DARK_TEXT, alignment=TA_CENTER,
        spaceBefore=1, spaceAfter=1,
    ),
    'CoverEmail': ParagraphStyle(
        'CoverEmail',
        fontName='Helvetica', fontSize=10,
        textColor=BLUE, alignment=TA_CENTER,
        spaceBefore=1, spaceAfter=1,
    ),
    'CoverDate': ParagraphStyle(
        'CoverDate',
        fontName='Helvetica', fontSize=10,
        textColor=DARK_TEXT, alignment=TA_CENTER,
        spaceBefore=16, spaceAfter=0,
    ),
}
```

---

## 4. Cover Page (Flowable-Based, Centered)

The cover page uses flowable content (NOT canvas drawing). Everything is center-aligned on a white background with blue text accents and a horizontal rule separator.

```python
def build_cover_page(story, title, subtitle, prepared_for_lines, cover_date):
    """
    Build the cover page as flowable content.

    Args:
        story: document story list
        title: main proposal title (e.g., "Custom CRM Build")
        subtitle: tagline (e.g., "Notion + n8n Automation for DAG")
        prepared_for_lines: list of dicts with 'text' and 'style' keys
            e.g., [{'text': 'Bill Daggett, Co-Founder', 'style': 'CoverName'},
                   {'text': 'Terri Lewis, Office Manager', 'style': 'CoverDetail'}]
        cover_date: e.g., "February 23, 2026"
    """
    story.append(Spacer(1, 60))

    # Company name
    story.append(Paragraph(f"{CONSULTANT['company'].upper()}", styles['CoverCompany']))

    # Horizontal rule
    story.append(Spacer(1, 8))
    story.append(HRFlowable(
        width="100%", thickness=1, color=RULE_COLOR,
        spaceBefore=0, spaceAfter=0,
    ))
    story.append(Spacer(1, 16))

    # Document type label
    story.append(Paragraph("AUTOMATION PROPOSAL", styles['CoverDocType']))

    # Main title
    story.append(Paragraph(title, styles['CoverTitle']))

    # Subtitle
    story.append(Paragraph(subtitle, styles['CoverSubtitle']))

    # Prepared for
    story.append(Paragraph("Prepared for", styles['CoverLabel']))
    for line in prepared_for_lines:
        story.append(Paragraph(line['text'], styles[line['style']]))

    # Prepared by
    story.append(Paragraph("Prepared by", styles['CoverLabel']))
    story.append(Paragraph(
        f"{CONSULTANT['name']}, {CONSULTANT['title']}", styles['CoverName']))
    story.append(Paragraph(CONSULTANT['company'], styles['CoverDetail']))
    story.append(Paragraph(CONSULTANT['email'], styles['CoverEmail']))

    # Date + Confidential
    story.append(Paragraph(f"{cover_date}  |  CONFIDENTIAL", styles['CoverDate']))

    # Page break to start content
    story.append(PageBreak())
```

---

## 5. Page Callbacks (Header/Footer)

```python
def on_all_pages(canvas, doc):
    """Header top-right, page number bottom-center on every page."""
    canvas.saveState()

    # Header: "VETERAN VECTORS | CONFIDENTIAL" top-right
    canvas.setFont('Helvetica-Bold', 8)
    canvas.setFillColor(BLUE)
    header_x = PAGE_W - doc.rightMargin
    header_y = PAGE_H - 0.45 * inch
    canvas.drawRightString(header_x, header_y,
                            f"{CONSULTANT['company_short']}  ")

    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED_TEXT)
    # measure width of the blue part to position the gray part
    blue_w = canvas.stringWidth(
        f"{CONSULTANT['company_short']}  ", 'Helvetica-Bold', 8)
    canvas.drawRightString(header_x, header_y, "|  CONFIDENTIAL")

    # Actually, simpler approach: draw as one string with manual positioning
    # Reset and draw properly
    canvas.restoreState()
    canvas.saveState()

    # Combined header — draw blue part then gray part
    right_edge = PAGE_W - doc.rightMargin
    y = PAGE_H - 0.45 * inch

    full_text = f"{CONSULTANT['company_short']}  |  CONFIDENTIAL"
    conf_text = "|  CONFIDENTIAL"
    vv_text = f"{CONSULTANT['company_short']}  "

    conf_w = canvas.stringWidth(conf_text, 'Helvetica', 8)
    vv_w = canvas.stringWidth(vv_text, 'Helvetica-Bold', 8)

    # Draw CONFIDENTIAL part (gray, right-aligned)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED_TEXT)
    canvas.drawRightString(right_edge, y, conf_text)

    # Draw VETERAN VECTORS part (blue bold, to the left of CONFIDENTIAL)
    canvas.setFont('Helvetica-Bold', 8)
    canvas.setFillColor(BLUE)
    canvas.drawRightString(right_edge - conf_w, y, vv_text)

    # Footer: "Page X" bottom-center
    canvas.setFont('Helvetica', 9)
    canvas.setFillColor(DARK_TEXT)
    page_text = f"Page {doc.page}"
    # Make "Page" regular and the number blue
    page_label_w = canvas.stringWidth("Page ", 'Helvetica', 9)
    num_text = str(doc.page)
    total_w = page_label_w + canvas.stringWidth(num_text, 'Helvetica', 9)
    start_x = (PAGE_W - total_w) / 2

    canvas.setFillColor(DARK_TEXT)
    canvas.drawString(start_x, 0.45 * inch, "Page ")
    canvas.setFont('Helvetica', 9)
    canvas.setFillColor(BLUE)
    canvas.drawString(start_x + page_label_w, 0.45 * inch, num_text)

    canvas.restoreState()
```

---

## 6. Table Builder (Standard Data Tables)

For tables like Combined Investment, Monthly Costs, CRM Database Structure, n8n Automations. Light blue-gray header row, thin borders, subtle alternating rows.

```python
def make_table(data, col_widths, has_header=True):
    """Build a clean table with light blue-gray header."""
    cell_style = ParagraphStyle('Cell', fontName='Helvetica', fontSize=9,
                                textColor=DARK_TEXT, leading=12)
    header_style = ParagraphStyle('HeaderCell', fontName='Helvetica-Bold',
                                  fontSize=9, textColor=DARK_TEXT, leading=12)

    wrapped = []
    for i, row in enumerate(data):
        style = header_style if (i == 0 and has_header) else cell_style
        wrapped.append([Paragraph(str(c), style) for c in row])

    t = Table(wrapped, colWidths=col_widths, repeatRows=1 if has_header else 0)

    cmds = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
    ]
    if has_header:
        cmds.append(('BACKGROUND', (0, 0), (-1, 0), HEADER_BG))

    start = 1 if has_header else 0
    for i in range(start, len(data)):
        if (i - start) % 2 == 1:
            cmds.append(('BACKGROUND', (0, i), (-1, i), ROW_ALT))

    t.setStyle(TableStyle(cmds))
    return t
```

---

## 7. Key-Value Table Builder

For tables like Annual Financial Impact, Current State, Bundle Savings — where the first column is blue bold labels and the second column is regular data. NO header row.

```python
def make_kv_table(data, col_widths):
    """Build a key-value table with blue bold labels in column 1."""
    label_style = ParagraphStyle('KVLabel', fontName='Helvetica-Bold',
                                  fontSize=9, textColor=BLUE_BOLD, leading=12)
    value_style = ParagraphStyle('KVValue', fontName='Helvetica', fontSize=9,
                                  textColor=DARK_TEXT, leading=12)

    wrapped = []
    for row in data:
        wrapped.append([
            Paragraph(str(row[0]), label_style),
            Paragraph(str(row[1]), value_style),
        ])

    t = Table(wrapped, colWidths=col_widths, repeatRows=0)

    cmds = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
    ]

    for i in range(len(data)):
        if i % 2 == 1:
            cmds.append(('BACKGROUND', (0, i), (-1, i), ROW_ALT))

    t.setStyle(TableStyle(cmds))
    return t
```

---

## 8. Section Builder with KeepTogether

```python
def add_section(story, heading, elements):
    block = [Paragraph(heading, styles['SectionTitle'])]
    block.extend(elements)

    est = 24
    for el in elements:
        if isinstance(el, Table):
            est += 30 + len(el._cellvalues) * 30
        elif isinstance(el, Paragraph):
            est += 18
        elif isinstance(el, Spacer):
            est += getattr(el, 'height', 12)

    if est < 400:
        story.append(KeepTogether(block))
    else:
        story.append(KeepTogether(block[:2]))
        for el in block[2:]:
            story.append(el)
```

---

## 9. Full Document Assembly

```python
def build_proposal(filename, proposal_data):
    doc = SimpleDocTemplate(
        filename, pagesize=letter,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
    )

    story = []

    # Cover page (flowable, centered)
    build_cover_page(
        story,
        title=proposal_data['title'],
        subtitle=proposal_data['subtitle'],
        prepared_for_lines=proposal_data['prepared_for'],
        cover_date=proposal_data['date'],
    )

    # Content sections
    for section in proposal_data.get('sections', []):
        add_section(story, section['title'], section['elements'])
        story.append(Spacer(1, 6))

    doc.build(story, onFirstPage=on_all_pages, onLaterPages=on_all_pages)

    import os
    if not os.path.exists(filename) or os.path.getsize(filename) < 1000:
        raise RuntimeError(f"PDF generation failed — {filename} missing or empty")
    return filename
```

---

## 10. Section-Specific Patterns

### Blue Label Paragraphs (for problem statements, differentiators)

Used for inline blue bold labels like "Single Point of Failure:" or "Veteran to Veteran:"

```python
# Problem statement with blue bold label
story.append(Paragraph(
    '<font color="#6CB4EE"><b>Single Point of Failure:</b></font> '
    'If Bill is out for a week, nobody else knows the full picture.',
    styles['Body']))

# Differentiator
story.append(Paragraph(
    '<font color="#6CB4EE"><b>Veteran to Veteran:</b></font> '
    "I'm a Navy guy. Submarines, nuclear engineering, Naval Academy '14.",
    styles['Body']))
```

### Case Study Block

```python
def add_case_study(story, label, industry, problem, solution, result):
    elements = [
        Paragraph(f"<b>Industry:</b> {industry}", styles['Body']),
        Spacer(1, 4),
        Paragraph(f"<b>The Problem:</b> {problem}", styles['Body']),
        Spacer(1, 4),
        Paragraph(f"<b>What We Built:</b> {solution}", styles['Body']),
        Spacer(1, 4),
        Paragraph(f"<b>The Result:</b> {result}", styles['Body']),
    ]
    add_section(story, label, elements)
```

### Next Steps

```python
next_steps = [
    Paragraph("To move forward:", styles['Body']),
    Spacer(1, 4),
    Paragraph("<b>1. Review:</b> Share this proposal with your team.",
              styles['Body']),
    Paragraph("<b>2. Audit Call:</b> Schedule a 45-60 minute call.",
              styles['Body']),
    Paragraph("<b>3. Approve:</b> Confirm scope and sign the SOW.",
              styles['Body']),
    Paragraph("<b>4. Kickoff:</b> 50% payment to begin. We start within 48 hours.",
              styles['Body']),
    Spacer(1, 12),
    Paragraph("<b>Ready to get started?</b>", styles['Body']),
    Paragraph(f"{CONSULTANT['name']} | {CONSULTANT['email']} | {CONSULTANT['company']}",
              styles['Muted']),
]
```

---

## 11. Column Width Quick Reference

| Table Type | Columns | Width Split |
|-----------|---------|-------------|
| 2-col deliverables | Deliverable, Details | 35% / 65% |
| 3-col ROI | Category, Hours, Value | 45% / 27.5% / 27.5% |
| 3-col pricing | Item, Individual, Bundle | 40% / 30% / 30% |
| 3-col timeline | Week, Focus, Deliverable | 12% / 44% / 44% |
| 2-col kv (annual impact) | Metric, Value | 40% / 60% |
| 2-col kv (current state) | Item, Details | 30% / 70% |
| 2-col kv (savings summary) | Item, Detail | 30% / 70% |

---

## 12. Post-Generation Validation

After building, render every page and check:

1. Cover: White background, centered blue text, horizontal rule, "Page 1" bottom center
2. Headers: "VETERAN VECTORS" (blue bold) + "| CONFIDENTIAL" (gray) top-right on every page
3. Footers: "Page X" bottom center on every page (X in blue)
4. Section headings: Blue (#6CB4EE), left-aligned
5. Tables: Light blue-gray header (NOT navy), thin gray borders
6. Key-value tables: Blue bold first column, no header row
7. No headers divorced from content
8. Consistent spacing throughout
