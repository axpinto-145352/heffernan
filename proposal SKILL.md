---
name: proposal-generator
description: "Use this skill whenever the user wants to create, draft, or generate a client proposal, automation proposal, consulting proposal, SOW, or project pitch document. Trigger when users say 'write a proposal', 'create a proposal', 'draft a proposal', 'make a proposal for [client]', 'proposal template', 'build a proposal PDF', or provide client/project information and ask for a professional proposal. Also trigger when users mention 'SOW', 'statement of work', 'project quote', 'engagement letter', or 'client pitch deck' that should follow the Veteran Vectors branded proposal format. Trigger aggressively — if a user provides client details and deliverables and wants a professional document out of it, use this skill."
---

# Proposal Generator

Turn provided client/project information into a professionally formatted, branded proposal PDF following the Veteran Vectors template. The output is a polished, client-ready document.

## When This Skill Triggers

A user provides information about a client engagement (client name, deliverables, pricing, timelines, etc.) and wants it turned into a formatted proposal. The user may provide this as notes, a brief, bullet points, or a conversation summary.

## Dependencies

Install before generating any PDF:

```bash
pip install reportlab Pillow --break-system-packages -q
```

If install fails (network disabled), inform the user that ReportLab is required and ask them to enable network access.

## Workflow

### Step 1 — Gather Information

Check what the user has provided. At minimum you need:
- Client name and contact(s)
- What's being proposed (deliverables)
- Pricing

If missing critical info, ask before proceeding. Nice-to-haves that can be estimated or omitted: hours saved estimates, ROI projections, timeline, specific case studies.

### Step 2 — Read the Template Structure

Read `references/template-structure.md` for the exact section order, content requirements, and formatting rules for every section of the proposal.

Map the provided information into the template sections. Write any missing connective text (executive summary, transitions, why-us section).

### Step 3 — Generate the PDF

Read `references/pdf-generation.md` for the complete ReportLab code patterns — cover page, tables, sections, and document assembly.

Key requirements:
- Canvas-level cover page via `onFirstPage` callback (not flowable text)
- `KeepTogether` wrapping for all heading + content pairs
- `repeatRows=1` on all tables
- Branded color scheme throughout
- Consultant info is parameterized — see the `CONSULTANT` config dict in pdf-generation.md

### Step 4 — Validate and QA

After generating, render every page to images and visually inspect:

```python
try:
    from pdf2image import convert_from_path
    pages = convert_from_path('proposal.pdf', dpi=150)
    for i, page in enumerate(pages):
        page.save(f'page_{i+1}.png', 'PNG')
except Exception:
    import fitz
    doc = fitz.open('proposal.pdf')
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=150)
        pix.save(f'page_{i+1}.png')
```

Use the `view` tool on every page image. Check:
- Cover page has navy color block, large title, metadata
- No headers stranded at page bottoms
- Tables don't split awkwardly
- Consistent formatting throughout
- Page numbers and header/footer on every content page

If issues found, fix the generation script and re-render. Maximum 3 fix cycles — if issues persist, deliver the best version and note remaining issues.

### Step 5 — Run AI Check (MANDATORY — no exceptions)

Before delivering any proposal PDF, run the `ai-check` skill in Full Fix mode on the proposal content. This is not optional and does not require the user to ask for it.

1. Extract the proposal text content
2. Run ai-check Full Fix — voice-correct all AI-sounding language against the Veteran Vectors voice profile
3. Rebuild the PDF with the corrected content
4. Hand the corrected PDF immediately to doc-polish (Step 6 below)

Do NOT deliver the PDF before this step is complete.

### Step 6 — Run Doc-Polish (MANDATORY — auto-triggered after AI check)

Immediately after ai-check completes, run the `doc-polish` skill on the corrected PDF without waiting for the user to ask. This is automatic.

Doc-polish will:
- Render all pages and visually inspect for layout issues
- Fix pagination problems (orphaned headers, excessive whitespace, blank pages)
- Verify formatting consistency throughout
- Deliver the final polished version

The complete delivery chain is: **Generate PDF → AI check (voice) → Doc-polish (layout) → Deliver.**

### Step 7 — Deliver

Present the final PDF to the user with a 1-2 sentence summary. Include the AI check score briefly: "AI check: [before] → [after]".

## Content Generation Rules

1. **Use provided information verbatim for facts** — Don't invent client names, prices, deliverables, or metrics.
2. **Generate connective text** — Executive summaries, transitions, and "why us" sections should be written to match the voice guide, based on actual deliverables.
3. **Case studies from memory** — Use Veteran Vectors case studies from prior conversations or the standard set (defense consulting, insurance FMO, AI talent marketplace) unless the user provides different ones.
4. **ROI estimates** — If the user provides hours-saved estimates, use them. If not, suggest reasonable ranges clearly marked as estimates for user confirmation.
5. **Pricing** — Never invent pricing. Always use what the user provides.

## Voice Guide

- Direct, conversational, no corporate jargon
- First person where appropriate ("I'm a Navy guy", "We work with companies that...")
- Confident but not arrogant
- Specific metrics over vague claims
- Short paragraphs, short sentences

## Edge Cases

**Single-system proposal (not a bundle):** Drop "Why Combined" section, bundle savings, and comparison columns. Simplify to one deliverables table and one price.

**No case studies needed:** Skip if the user says so (existing clients, small add-ons).

**Non-automation proposal:** For strategy/assessment/advisory engagements, adjust deliverable tables and ROI framing. Template structure still applies.

**User provides a completed brief or doc:** Extract all structured information and map into the template. Don't ask for info that's already there.

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| ReportLab not installed | Missing dependency | `pip install reportlab --break-system-packages` |
| Font not found | Helvetica missing (rare) | Use `reportlab.lib.fonts` registered defaults |
| PDF renders blank | Story list empty or only PageBreak | Check that sections were appended after PageBreak |
| Table overflows page | Column widths exceed CONTENT_W | Recalculate widths to sum to content area |
| Network disabled | Can't install packages | Inform user, suggest enabling network |

## Resources

### references/
- `template-structure.md` — Complete section-by-section template with content requirements, formatting rules, and section order
- `pdf-generation.md` — ReportLab code patterns for cover pages, tables, sections, and full document assembly with parameterized consultant info
