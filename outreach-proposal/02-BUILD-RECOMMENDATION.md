# Build Recommendation: Outreach Automation System

## Architecture Overview

Same pattern as the Heffernan WC Lead Gen system — Google Sheets as the UI layer,
Apps Script as the orchestrator, n8n as the enrichment/API engine. No custom web app needed.

```
┌──────────────────────────────────────────────────────────────┐
│                     GOOGLE SHEETS                            │
│  (Prospect list, enrichment results, draft review, status)   │
│                                                              │
│  Tabs:                                                       │
│    0. Upload        ← paste CSV here                         │
│    1. Enriched      ← AI research results                    │
│    2. Drafts        ← AI email drafts for review             │
│    3. Approved      ← reviewed & ready to push               │
│    4. Sent          ← pushed to Outreach.io                  │
│    5. Prompts       ← email templates & AI instructions      │
│    6. Config        ← Outreach.io settings, API keys ref     │
└──────────┬───────────────────────────────────┬───────────────┘
           │                                   │
           │ Apps Script                       │ Apps Script
           │ (orchestrator)                    │ (formatting, menus)
           │                                   │
           ▼                                   ▼
┌─────────────────────┐            ┌─────────────────────────┐
│   n8n WEBHOOKS      │            │   OUTREACH.IO API       │
│                     │            │                         │
│  1. Company Research│            │  Push approved sequences│
│  2. Contact Lookup  │            │  Create prospects       │
│  3. Email Drafting  │            │  Add to campaigns       │
│  4. Error Notifier  │            │                         │
└─────────────────────┘            └─────────────────────────┘
         │
         │ calls
         ▼
┌─────────────────────────────────────┐
│  EXTERNAL APIs                      │
│                                     │
│  - Perplexity (company research)    │
│  - Apollo or Seamless.AI (contacts) │
│  - LinkedIn via Apify (profiles)    │
│  - ChatGPT / Claude (email drafts)  │
└─────────────────────────────────────┘
```

---

## The 5-Step Pipeline

### Step 1: CSV Upload (Manual — 2 minutes)

**Where:** Google Sheets tab "0. Upload"
**Who:** EA pastes CSV of prospects
**What happens:** Apps Script validates columns, deduplicates against prior batches,
assigns a batch ID, sets status to `new`

No code needed beyond a simple `onEdit` trigger or a custom menu button "Import Batch."

---

### Step 2: AI Company Research (Automated — n8n)

**Trigger:** Apps Script calls n8n webhook with batch of prospects
**n8n workflow:** `Company Research` (4-5 nodes)

```
Webhook → Fetch Prompts → Perplexity (sonar-pro) → Parse Response → Return JSON
```

**What it researches per company:**
- What the company does (industry, size, specialties)
- Recent news (funding, leadership changes, expansions, acquisitions)
- Pain points relevant to insurance (claims history signals, growth indicators)
- Key differentiators (what makes them unique)

**Apps Script writes results** to "1. Enriched" tab. Status → `researched`

**Estimated time:** ~5 seconds per company. 50 companies = ~4 minutes.
**Estimated cost:** ~$0.01/company (Perplexity sonar-pro)

---

### Step 3: Contact Lookup (Automated — n8n)

**Trigger:** Apps Script calls n8n webhook for researched companies
**n8n workflow:** `Contact Lookup` (5-6 nodes)

```
Webhook → Apollo/Seamless.AI Search → Parse Best Match → Return JSON
```

**What it finds:**
- Decision-maker name, title, email, phone
- LinkedIn profile URL
- Seniority ranking (same logic as WC system POC categories)

**Apps Script writes results** to "1. Enriched" tab. Status → `contacts_found`

**Option A — Apollo.io:** Free tier gets 50 credits/mo. Pro is ~$49/mo for 1000.
**Option B — Seamless.AI:** Already integrated in the WC system. Reuse the same n8n node.
**Option C — LinkedIn Sales Nav + manual:** Skip the API, EA pulls contacts from Sales Nav.

---

### Step 4: AI Email Drafting (Automated — n8n)

**Trigger:** Apps Script calls n8n webhook with enriched prospect data
**n8n workflow:** `Email Drafting` (4-5 nodes)

```
Webhook → Fetch Email Prompts → Claude/GPT → Parse Draft → Return JSON
```

**What the AI gets as context:**
- Company research from Step 2
- Contact name and title from Step 3
- Email template/tone from "Prompts" tab
- Producer's value prop and past wins (stored in Prompts tab)
- Any specific campaign angle (e.g., "WC renewal season," "new CA compliance")

**What it outputs:**
- Subject line
- Email body (personalized first line referencing research)
- Suggested follow-up angle

**Apps Script writes drafts** to "2. Drafts" tab. Status → `draft_ready`

**Estimated cost:** ~$0.01-0.03/email (Claude Haiku or GPT-4o-mini)

---

### Step 5: Human Review + Outreach Push

**Review (Manual — the 90-minute part):**
- EA opens "2. Drafts" tab
- Reviews each email, edits as needed directly in the sheet
- Marks column "Approved" = Yes/No
- Clicks custom menu button "Push Approved to Outreach"

**Push (Automated — Apps Script or n8n):**
- Apps Script reads approved rows
- Calls Outreach.io REST API:
  - `POST /prospects` — create or update the prospect
  - `POST /sequences/{id}/add` — add prospect to the target sequence
  - `POST /mailings` — (optional) create draft mailing with the AI-generated content
- Marks status → `sent_to_outreach`

**Outreach.io API:** REST API with OAuth2. Well documented.
Rate limit: 5000 requests/hour (more than enough).

---

## Tool Stack & Monthly Cost

| Tool | Purpose | Monthly Cost |
|------|---------|-------------|
| **Google Sheets** | UI, data store, review interface | Free (Workspace) |
| **Google Apps Script** | Orchestration, menus, formatting | Free |
| **n8n Cloud** | API workflows (already have this) | Already paying |
| **Perplexity API** | Company research | ~$5-20/mo (usage-based) |
| **Apollo.io** | Contact lookup | $0-49/mo |
| **Claude API or GPT** | Email drafting | ~$5-15/mo (usage-based) |
| **Outreach.io** | Sequencing (already have this) | Already paying |

**Total incremental cost: ~$10-85/month**

vs. $29,000 + ongoing maintenance + vendor lock-in.

---

## What We'd Build (Scope of Work)

| Deliverable | Description | Effort |
|-------------|-------------|--------|
| **Google Sheet template** | 6-tab workbook with validation, conditional formatting, status tracking | 2-3 hours |
| **Apps Script orchestrator** | Import validation, webhook calls, Outreach.io push, custom menus | 6-8 hours |
| **n8n: Company Research** | Webhook → Perplexity → parse → respond | 1-2 hours |
| **n8n: Contact Lookup** | Webhook → Apollo/Seamless → parse → respond | 2-3 hours |
| **n8n: Email Drafting** | Webhook → Claude/GPT → parse → respond | 2-3 hours |
| **n8n: Error Notifier** | Reuse existing Slack error workflow | 0.5 hours |
| **Prompt engineering** | Research prompts, email templates, tone calibration | 3-4 hours |
| **Testing & iteration** | End-to-end testing with real prospect data | 3-4 hours |
| **Documentation** | Setup guide, prompt editing guide, troubleshooting | 2 hours |

**Total estimated effort: 20-30 hours**

---

## Comparison: Their Proposal vs. This Build

| Factor | $29K Custom App | This Build |
|--------|----------------|------------|
| **Upfront cost** | $29,000 | 20-30 hours of dev time |
| **Monthly cost** | Hosting + DB + AI + retainer | ~$10-85/mo incremental |
| **Time to launch** | 2-4 months | 1-2 weeks |
| **Who owns it** | Vendor owns research engine | Client owns everything |
| **Maintenance** | Requires vendor for updates | Nadia's team can edit prompts, templates |
| **Flexibility** | Locked into vendor's UI | Edit the Google Sheet, change prompts anytime |
| **Risk** | Custom software rot, vendor dependency | Uses battle-tested SaaS tools |
| **Scalability** | Good (it's a real app) | Good enough (handles hundreds of prospects/batch) |

---

## When Would You Actually Need Custom Software?

Only if:
- Volume exceeds ~500 prospects/week consistently
- Multiple producers need isolated campaigns with different branding
- Outreach.io integration needs real-time sync (not batch)
- Compliance requires audit logs beyond what Sheets provides

None of these apply to a 5-user team doing batch outreach.

---

## Recommended Next Step

**Don't build anything yet.** Run the workflow manually for 2-3 batches:

1. Paste CSV into a sheet
2. Use ChatGPT to research each company (copy-paste)
3. Use ChatGPT to draft emails (copy-paste)
4. Review, edit, paste into Outreach.io manually

If that process produces results (meetings booked, replies received), THEN automate it
with the build above. The manual version costs $0 and validates the approach in a week.
