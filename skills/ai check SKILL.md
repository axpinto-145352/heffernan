---
name: ai-check
description: "Scans documents, emails, LinkedIn posts, or any text for AI-generated patterns and rewrites flagged sections in the user's authentic voice. Three modes: Scan Only, Fix Critical (HIGH only), Full Fix (all). Trigger when user says 'AI check', 'humanize this', 'de-AI this', 'make this not sound AI', 'too robotic', 'sounds fake', 'fix the tone', 'make this sound like me', or any AI detection concern. AUTO-TRIGGER CHAINS (mandatory, no prompt needed): (1) Always run Full Fix automatically BEFORE doc-polish starts — AI check the content first, then hand off to doc-polish for formatting. (2) Always run Full Fix on any content Claude creates — emails, proposals, guides, LinkedIn posts, reports, documents, or any written deliverable — before presenting to the user. Trigger aggressively."
---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.3 | 2026-02-24 | Added auto-trigger chains: mandatory AI check BEFORE doc-polish starts, and on any content Claude creates (emails, proposals, guides, LI posts, reports, etc.). No user prompt required. |
| 1.2 | 2026-02-24 | Removed separate report file generation. Score and flag summary delivered in chat. Only output file is the corrected document. |
| 1.1 | 2026-02-24 | Added 3 modes (Scan Only / Fix Critical / Full Fix), added client voice profile system, added scoring anchors and confidence levels, added partially-AI content handling, added batch processing workflow, added genre-awareness for false positive reduction, added before/after validation step |
| 1.0 | — | Original skill with 8-category detection, Anthony voice profile, dual output system |

# AI Check

Scan content for AI-generated patterns, score it, optionally fix it in the target voice, and return the score in chat with the corrected document.

## When This Skill Triggers

User uploads or pastes any content and wants to know if it sounds AI-generated, or wants it rewritten to sound human. This applies to any format: documents, PDFs, emails, LinkedIn posts, proposals, reports, plain text, or anything else with words.

## Auto-Trigger Chains (Mandatory)

This skill runs automatically in the following situations — no user prompt needed. Do not ask the user if they want an AI check. Just do it.

### Chain 1: Before Doc Polish

Whenever the `doc-polish` skill is about to run on a document:

1. AI check runs FIRST in **Full Fix** mode on the document content
2. Voice-correct the content and produce the cleaned version
3. Hand the voice-corrected file to doc-polish for formatting fixes
4. Doc-polish then runs its normal workflow on the already-humanized content

The order is: AI check (voice) → doc-polish (formatting). Voice first, layout second.

### Chain 2: Any Content Claude Creates — AND When User Says "Run AI Check"

Whenever Claude writes, drafts, or creates any deliverable for the user — including but not limited to proposals, SOWs, guides, SOPs, emails, LinkedIn posts, reports, blog posts, or any other written content or document — OR whenever the user explicitly says "run AI check" on any file:

1. Draft the content as normal (or receive the file to check)
2. Run AI check in **Full Fix** mode on the draft
3. **IMMEDIATELY after AI check completes on any file deliverable (.docx, .pdf, .pptx, etc.): trigger doc-polish automatically.** Do not ask. Do not wait. Doc-polish runs next, every time, no exceptions.
4. Doc-polish handles all layout, pagination, and visual polish on the voice-corrected file
5. Present the final version — voice-corrected AND format-polished
6. Show the AI score: "AI check: [before] → [after]"

The full mandatory chain for ALL file deliverables: **Draft → AI check (voice) → doc-polish (formatting) → deliver.**
For text-only deliverables (pasted in chat): **Draft → AI check (voice) → deliver.**

**The user should never receive a file from Claude that hasn't gone through both AI check AND doc-polish.**

**Critical:** If the user says "run AI check" and the content is in a file, doc-polish fires automatically when AI check finishes. The user saying "run AI check" implicitly triggers the full chain — not just the voice check.

## Workflow

Follow these steps in exact order for every AI check request.

### Step 1 — Get the Content & Select Mode

Determine the content source:

| Source | Action |
|--------|--------|
| Uploaded file (.docx, .pdf, .pptx, .txt, .md) | Read the file using the appropriate skill (docx, pdf, pptx). If the relevant skill isn't available, extract text using basic file reading and note that format-preserved output won't be possible. |
| Pasted text in chat | Use directly |
| URL or link | Fetch the content |

Determine the mode based on the user's request:

| Mode | When to Use | Output |
|------|------------|--------|
| **Scan Only** | User says "just score this," "does this sound AI?", "check this," or only wants a temperature check | Score + flag summary in chat, no file output |
| **Fix Critical** | User says "just fix the obvious stuff," "fix the worst parts," or wants a quick pass | Score in chat + corrected file (HIGH severity fixes only) |
| **Full Fix (default)** | User says "AI check," "humanize this," "make this sound like me," or wants a complete cleanup | Score in chat + corrected file (all flags fixed) |

If unclear, default to Full Fix. Announce the mode:

> "Running AI check in [Scan Only / Fix Critical / Full Fix] mode."

Create the workspace: `mkdir -p /home/claude/ai-check-workspace/original/ /home/claude/ai-check-workspace/fixed/`

Copy the original content to `/home/claude/ai-check-workspace/original/` before making any changes.

### Step 2 — Load the Detection Patterns

Read `references/ai-patterns.md` for the comprehensive list of known AI tells across 8 categories:
1. Dead giveaway words and phrases
2. Structural patterns
3. Punctuation and symbol tells
4. Sentence construction patterns
5. Transition and connector overuse
6. Hedging and qualification patterns
7. Tone patterns
8. Formatting tells

### Step 3 — Run the AI Detection Scan

Go through the content systematically against every category in the patterns reference. For each flag found, record:

- **What**: The exact text flagged
- **Where**: Location in the document (paragraph number, section, page)
- **Category**: Which pattern category it falls into
- **Severity**: HIGH / MEDIUM / LOW based on the patterns reference
- **Suggested Fix**: What to replace it with

**Calibration rules:**
- Be thorough but not paranoid. A single "Additionally" in a 10-page document is not a problem. Look for clusters and patterns, not isolated incidents.
- **Genre awareness:** Academic papers, legal documents, and formal reports are naturally formal. Don't flag formality that matches the genre. Flag formality that exceeds genre norms. For example, semicolons in a legal brief = normal. Semicolons in a LinkedIn post = flag.
- **Partially AI content:** If the content appears to be a human draft polished by AI, note this in the chat summary. Flag only the AI-polished sections. Mark clearly human sections as "PRESERVE — appears authentically written" to prevent rewrite damage.

### Step 4 — Calculate the AI Score

Score the content 0-100 based on the scoring table in the patterns reference:

| Score | Meaning |
|-------|---------|
| 0-15 | Clearly human |
| 16-30 | Likely human with minor flags |
| 31-50 | Uncertain, mixed signals |
| 51-70 | Likely AI-generated |
| 71-85 | Strongly AI-generated |
| 86-100 | Obviously AI-generated |

The score should factor in:
- Number of flagged items relative to content length
- Severity distribution (lots of HIGH severity flags weigh more)
- Structural pattern matches (these matter more than individual word flags)
- Tone and voice naturalness (hardest to quantify but most important)
- Genre expectations (formal genres get more lenient scoring)

**Score confidence indicator — always include this:**

| Content Length | Confidence |
|---------------|------------|
| Under 50 words | LOW — score is unreliable at this length |
| 50-200 words | MEDIUM — directionally accurate |
| 200-500 words | HIGH — reliable score |
| Over 500 words | VERY HIGH — strong signal |

**Scoring anchor examples** (use these to calibrate):
- **Score ~20 (Likely human):** Content with natural voice variation, occasional imperfect transitions, mixed sentence lengths, 1-2 minor flags like a single "Additionally."
- **Score ~50 (Uncertain):** Content with uniform paragraph lengths, 3-4 AI vocabulary flags, some structural repetition, but genuine insights or personal anecdotes mixed in.
- **Score ~80 (Strongly AI):** Content hitting multiple categories — em dashes, "leverage/utilize/streamline," uniform 3-5 sentence paragraphs, sweeping opener narrowing to specifics, tidy restating conclusion, no personality or tangents.

**If score is 85+:** Flag that surgical fixes may not be enough. Recommend the user consider a ground-up rewrite rather than patching. Still provide the score and flag summary in chat.

**If Scan Only mode: skip to Step 8 (present score in chat, no file output).**

### Step 5 — Load the Voice Profile

Determine the target voice:

**If content is for the user (Anthony):**
Read `references/anthony-voice.md` for authentic voice characteristics, natural phrases, and replacement patterns.

**If content is for a client:**
Check for a client voice profile in this order:
1. Has the user provided a client voice brief or samples in this conversation? → Use those.
2. Has a client voice profile been built in past conversations? → Search past chats for "[client name] voice profile."
3. None available? → Ask: "I don't have a voice profile for [client]. Want me to (a) build one from samples you provide, (b) use general humanization, or (c) apply your voice?"

**General humanization (no specific voice target):**
- Add natural sentence length variation (mix short and longer)
- Break perfect parallel structures
- Replace AI vocabulary with plain language
- Remove unnecessary hedging
- Kill em dashes
- Introduce minor structural imperfections (not every paragraph same length, not every list same format)
- Preserve the content's level of formality appropriate to its genre

### Step 6 — Rewrite the Flagged Content

**If Fix Critical mode:** Only rewrite items flagged as HIGH severity. Leave MEDIUM and LOW flags untouched but mention their count in the chat summary.

**If Full Fix mode:** Rewrite all flagged items.

Key principles:

1. **Don't rewrite everything** — Only touch what's flagged. Preserve anything that already sounds natural. Especially preserve sections marked "PRESERVE — appears authentically written."
2. **Maintain the original meaning** — The point of the content shouldn't change, just how it sounds.
3. **Break structural uniformity** — If every paragraph follows the same template, vary them. Some short, some longer. Some start with the main point, others build to it.
4. **Replace AI vocabulary with plain language** — Use the swap table in the voice profile.
5. **Kill em dashes** — Replace with periods, commas, or restructure the sentence.
6. **Remove unnecessary hedging** — If the content is stating a fact, state it. Don't qualify it to death.
7. **Add natural imperfections** — Real writing has the occasional short fragment. Varied sentence lengths. Thoughts that connect loosely rather than with perfect transitions.
8. **Preserve technical accuracy** — If the content has specific numbers, claims, or technical details, keep them intact. Only change how they're delivered.

**After rewriting, run a quick validation pass:**
- Re-scan the rewritten content against the patterns reference
- If new AI patterns were introduced during the rewrite, fix them
- If meaning has drifted from the original, correct it
- The "after" score must be lower than the "before" score. If it isn't, something went wrong — identify and fix.

### Step 7 — Produce the Fixed Document (Skip if Scan Only mode)

The cleaned, humanized version of the content in the same format as the original:
- If input was .docx → output .docx (use docx skill)
- If input was .pdf → output .pdf (use pdf skill)
- If input was .pptx → output .pptx (use pptx skill)
- If input was pasted text → return the text in chat
- If input was .md or .txt → output in same format

Save to `/home/claude/ai-check-workspace/fixed/` and copy final version to `/mnt/user-data/outputs/`.

### Step 8 — Present Results

Deliver the score in chat and the fixed document as a file. No separate report file.

**For Fix Critical / Full Fix modes:**

> "Before: [X]/100 ([label]) | Confidence: [level]. After: [X]/100 ([label]). Fixed [count] flags ([brief summary of top changes])."

Then present the fixed file.

**For Scan Only mode:**

> "Score: [X]/100 ([label]) | Confidence: [level]. Found [count] flags — [HIGH count] high, [MED count] medium, [LOW count] low. [1-2 sentence summary of the biggest issues found]."

No file output in Scan Only mode — just the score and summary in chat.

Keep it brief. If the user wants more detail on specific flags, they can ask.

## Batch Processing

When the user provides multiple documents at once:

1. **3 or fewer documents:** Process each separately. Present all fixed files together with a combined score summary in chat.
2. **4+ documents:** Process each separately, then provide a batch score summary in chat:

> "Batch complete — [X] documents processed:"
> - file1.docx: 62 → 18 (fixed 11 flags)
> - file2.md: 34 → 12 (fixed 5 flags)

Use consistent naming: `[original-filename]-fixed.[ext]`.

## Edge Cases

**Content is already human-sounding (score below 20).** Tell the user it passes and show the score in chat. Note that no fixes were needed. Don't fix what isn't broken.

**Content is for a specific client voice (not the user's voice).** Follow the voice profile selection in Step 5. If no client voice profile exists, offer to build one from samples.

**Very short content (under 50 words).** Still run the scan but flag confidence as LOW. A single AI phrase in 30 words looks worse than the same phrase in 3000 words.

**Content in a language other than English.** The patterns reference is English-focused. Let the user know the scan may miss language-specific AI patterns and offer to do a best-effort review.

**Multiple documents at once.** Follow the Batch Processing section above.

**Partially AI content (human draft + AI polish).** Identify and mark the human-written sections as "PRESERVE." Only fix the AI-generated or AI-polished sections. Note this in the chat summary.

**Content scoring 85+.** Flag that surgical fixes may not produce a natural result. Recommend ground-up rewrite. Still provide the score summary and attempt fixes if the user wants them.

**Formal genres (academic, legal, medical).** Adjust scoring tolerance upward. Formality matching genre norms is not an AI tell. Only flag formality that exceeds what the genre requires.

## What This Skill Does NOT Do

- Grammar or spell checking (different concern entirely)
- Plagiarism detection (detecting copied content, not AI-generated content)
- Factual accuracy review (use the comprehensive review agents for that)
- Full content rewriting from scratch (this preserves the original meaning and structure)

## References

### references/
- `ai-patterns.md` — Comprehensive catalog of AI-generated content patterns organized by category and severity, with scoring guidance and calibration anchors
- `anthony-voice.md` — The user's authentic voice profile with characteristics, natural phrases, and replacement patterns for humanization

### Adding New Patterns or Voices
- **New AI patterns:** Add to the appropriate category in `ai-patterns.md` with a severity rating (HIGH/MEDIUM/LOW). Include the pattern, why it's a tell, and a suggested replacement.
- **New voice profiles:** Create a new file in `references/` named `[name]-voice.md` following the same structure as `anthony-voice.md`: core characteristics, natural phrases, anti-patterns, replacement table, and document-specific adjustments.
