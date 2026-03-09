# WC Prospects Lead Generation System — Architecture

## System Overview

Workers' Compensation prospect pipeline that processes ECU reports, enriches company data with AI, discovers decision-maker contacts, and prepares qualified prospects for outreach.

**Spreadsheet:** WC Prospects Import & Filtering (via Tech Stack)
**Spreadsheet ID:** `1mno3Gy9qotBKO36Qx28p8ft5krR3sncZis8lrBVC5Cw`
**n8n Instance:** `timbheffins.app.n8n.cloud`

---

## Data Flow (End-to-End)

```
ECU WC Report → 0. NEW HERE (upload)
       ↓
[Step 1] Perplexity: Employee count
       ↓
Scheduled Runner: WCIRB formulas, WC Premium calc, formatting, dropdowns
       ↓
User sets "Final Okay" or "Manual Override" → onEdit copies to Filtered
       ↓
[Step 2] Perplexity: Domain + For-Profit/Non-Profit
       ↓
n8n reformats to 5 rows per company → Apps Script formatting
       ↓
═══════════════════════════════════════════════
  CURRENT: Client manually enters POCs
  FUTURE:  Seamless.AI automates POC discovery
═══════════════════════════════════════════════
       ↓
[Step 5] Apify: LinkedIn profile URLs
       ↓
[Step 6] Perplexity: Corrected company name → Address labels → Google Docs
```

---

## Components

### 1. Google Apps Script (`apps-script/`)

**Type:** Container-bound script attached to the spreadsheet
**Deployed as:** Web App (doPost endpoint) + Timer trigger (mainScheduledRunner)

**File structure:**
| File | Responsibility |
|------|---------------|
| `Config.gs` | All configuration, constants, ScriptProperties access |
| `Headers.gs` | Header-based column lookup, sanitization, column letter conversion |
| `Infrastructure.gs` | Lock/gap guard, webhook dispatch with retry, audit logging |
| `Runner.gs` | Main scheduled runner + all step functions (formulas, formatting, sorting) |
| `Triggers.gs` | onEdit handler, Seamless AI trigger, copy/reformat operations |
| `WebApp.gs` | doPost/doGet endpoint, setup validation |
| `Menu.gs` | Custom menu and menu action handlers |
| `AddressLabelsDoc.gs` | Separate script for Address Labels Google Docs (see section 5) |

**Error handling conventions:**
- Infrastructure functions THROW on failure (callers decide)
- `logToAudit_` never throws (best-effort logging)
- `onEdit` catches per-handler, logs, never throws
- `doPost` catches all, returns JSON, logs to audit
- Menu handlers catch errors, show via `ui.alert()`

**Key safeguards (v2):**
- All column refs are header-based (no hardcoded letters)
- Lock + 45s gap guard prevents race conditions
- Webhook dispatch with retry + exponential backoff (3 attempts)
- Block detection validates Bureau Number consistency
- Idempotent trigger processing (Sent marker prevents re-fire)
- All magic numbers centralized in CONFIG

### 2. n8n Workflow — Manual POC (`n8n-workflows/lead-gen-system-v2.json`)

**Current production workflow.** Steps 1, 2, 5, 6. POC input is manual.

| Step | Trigger | Action | API |
|------|---------|--------|-----|
| 1 | NEW HERE rowAdded | EE count calculation | Perplexity (sonar-pro) |
| 2 | Filtered rowAdded | Domain + FP/NP lookup, reformat 5 rows | Perplexity (sonar-pro) |
| 5 | Filtered rowUpdate | LinkedIn profile search | Apify |
| 6 | Filtered rowUpdate | Corrected name → address labels | Perplexity (sonar-pro) |

### 3. n8n Workflow — Seamless.AI (`n8n-workflows/lead-gen-system-seamless-v2.json`)

**Future workflow.** Adds Step 4 for automated POC discovery.

| Step | Trigger | Action | API |
|------|---------|--------|-----|
| 4 | Webhook from Apps Script | Contact search → seniority sort → 5 POC rows | Seamless.AI |

**Seniority sort logic:**
- Row 1: Org Head (CEO → President → Owner)
- Row 2: Finance Head (CFO → VP Finance → Finance Director → Head of Finance)
- Row 3: Operations Head (COO → VP Operations → Director Operations)
- Row 4: HR Head (Chief People Officer → Chief HR Officer → VP HR → HR Director)
- Row 5: Extra/Overflow (best remaining from any category)

**Also extracts from Seamless.AI:** Revenue ($M), Industry, SIC Code

### 4. n8n Workflow — Error Notifier (`n8n-workflows/lead-gen-error-notifier.json`)

Receives error events from the lead gen workflows, formats them, and sends Slack alerts with execution links.

### 5. Google Docs — Address Labels (`apps-script/AddressLabelsDoc.gs`)

| Doc | ID | Purpose |
|-----|---|---------|
| General (For-Profit) | `1Abb062Y...` | Mailing labels for for-profit prospects |
| Non-Profit | `1nbCmlo...` | Mailing labels for non-profit prospects |

Labels use `{{Label1}}` through `{{Label402}}` placeholders in a table layout (3 label columns + 2 spacer columns per row). n8n writes prospect name, corrected company name, and address into these placeholders.

Each doc has a container-bound Apps Script (`AddressLabelsDoc.gs`) providing:
- **Label Tools menu:** "Reset to Template" and "Bold First Line" for manual use
- **doPost endpoint:** Programmatic access for `reset_to_template` and `bold_first_line` triggers
- **Authentication:** Shared `dopost_api_token` (same as the Sheets script) via Script Properties
- **Bold formatting:** First line = Arial Black (prospect name), remaining lines = Comfortaa (address)

---

## Sheet Schema

| Tab | Purpose | Trigger |
|-----|---------|---------|
| 0. NEW HERE | Raw ECU WC prospect intake | rowAdded |
| 1. Filtered Accounts & POCs | Qualified prospects with 5 POC rows each | rowAdded, rowUpdate |
| 2. POCs | Raw POC results (all contacts found) | None |
| Prompts | AI prompt templates | None |
| Sources | Research source URLs | None |
| WCIRB Rates | Rate lookup table | None |
| Address Labels (General) | For-profit address labels | rowUpdate |
| Address Labels (Non-Profit) | Non-profit address labels | rowUpdate |
| Audit Log | All changes logged | Auto-created |

---

## Credentials Required

| Service | Auth Method | Where Stored |
|---------|------------|-------------|
| Google Sheets | OAuth 2.0 | n8n credential vault |
| Google Docs | OAuth 2.0 | n8n credential vault |
| Perplexity AI | API Key | n8n credential vault |
| Apify | API Token | n8n credential vault |
| Seamless.AI (future) | Bearer token (Persistent API Key) | n8n credential vault |
| Slack | Webhook URL | n8n workflow config |

---

## Setup Checklist

### Apps Script
1. Open the spreadsheet → Extensions → Apps Script
2. Replace the entire Code.gs with `apps-script/Code.gs`
3. Set Script Properties (Project Settings → Script Properties):
   - `employee_webhook_url` → your n8n Employee webhook URL
   - `seamless_webhook_url` → your n8n Seamless AI webhook URL
   - `dopost_api_token` → generate a random token (e.g., `openssl rand -hex 32`)
   - `address_labels_doc_general` → Google Doc ID for general labels
   - `address_labels_doc_nonprofit` → Google Doc ID for non-profit labels
   - `address_labels_doc_url_general` → Web App URL for general labels doc script
   - `address_labels_doc_url_nonprofit` → Web App URL for non-profit labels doc script
4. Deploy as Web App: Execute as "Me", Access "Anyone"
5. Copy the Web App URL → update `APPS_SCRIPT_WEB_APP_URL` in n8n workflows
6. Set up a time-driven trigger: `mainScheduledRunner` every 1 minute
7. In n8n: set environment variable `WEBHOOK_AUTH_TOKEN` to the same `dopost_api_token` value

### n8n Workflows
Workflows are split by step for independent debugging and restart:

| File | Purpose |
|------|---------|
| `step1-ee-count.json` | NEW HERE → Perplexity EE count → update sheet |
| `step2-domain-lookup.json` | Filtered → Perplexity domain + FP/NP → reformat → Apps Script |
| `step5-li-profile.json` | Filtered rowUpdate → Apify LinkedIn scraper → update LI Profile |
| `step6-address-labels.json` | Filtered rowUpdate → Corrected Name → labels → Google Docs |
| `lead-gen-system-v2.json` | Legacy monolith (kept for reference) |
| `lead-gen-error-notifier.json` | Error notification workflow |

1. Import each step workflow into n8n
2. Import `lead-gen-error-notifier.json` into n8n
3. Set the error notifier workflow ID as `errorWorkflow` in each step workflow
4. Configure all credential placeholders:
   - `GOOGLE_SHEETS_CREDENTIAL_ID`
   - `GOOGLE_DOCS_CREDENTIAL_ID`
   - `PERPLEXITY_CREDENTIAL_ID`
   - `APIFY_CREDENTIAL_ID`
   - `APPS_SCRIPT_WEB_APP_URL`
5. Activate the workflow

### Address Labels Docs
1. Open each Google Doc (General and Non-Profit) → Extensions → Apps Script
2. Replace the script with `apps-script/AddressLabelsDoc.gs`
3. Set Script Properties:
   - `dopost_api_token` → same value as the Sheets script's `dopost_api_token`
4. Deploy as Web App: Execute as "Me", Access "Anyone"
5. Copy each Web App URL → set as `address_labels_doc_url_general` / `address_labels_doc_url_nonprofit` in the Sheets script's Script Properties

### Seamless.AI (when ready)
1. Get Persistent API Key from Heffernan IT (Nadia Messiah)
2. Create HTTP Header Auth credential in n8n: `Authorization: Bearer {key}`
3. Import `lead-gen-system-seamless-v2.json`
4. Replace `REPLACE_WITH_SEAMLESS_CREDENTIAL_ID` with actual credential ID
5. Set error notifier workflow ID
6. Test with 5 sample companies
7. Activate

---

## Common Failure Points and Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Runner fires too often | No gap guard | v2 has 45s gap guard built in |
| Column not found | Hardcoded column letters | v2 uses header-based lookup |
| Duplicate rows in Filtered | No dedup check | v2 checks Bureau Number + Name+Address |
| Seamless trigger re-fires | No idempotent marker | v2 marks "Sent" immediately |
| Webhook timeout | No retry | v2 retries 3x with exponential backoff |
| 5-row block wrong size | Fragile detection | v2 validates Bureau Number consistency |
| Silent failures | Errors swallowed | v2 logs all errors to Audit Log sheet |
| Apps Script URL changes | Redeployment | Must update `APPS_SCRIPT_WEB_APP_URL` in n8n |
| Rate limiting (429) | Too many API calls | Wait nodes between batches + retry on 429 |
| Unauthorized webhook calls | No auth on endpoints | v2 requires shared secret token on doPost + webhooks |
| Secrets in source code | Hardcoded URLs/IDs | v2 stores all secrets in ScriptProperties/env vars |
| Formula injection | Unsanitized inputs | v2 sanitizes all string values before sheet writes |
| Slow block detection | Cell-by-cell reads | v2 batch-reads columns into memory |

---

## Dependencies & Versions

| Service | Version / Model | Last Verified | Notes |
|---------|----------------|---------------|-------|
| Google Apps Script | V8 runtime | 2026-03-09 | 6-min execution limit per invocation |
| n8n Cloud | Cloud-hosted (version managed by n8n) | 2026-03-09 | Node typeVersions: googleSheetsTrigger v1, httpRequest v4, code v2 |
| Perplexity AI | `sonar-pro` | 2026-03-09 | Used in Steps 1, 2, 6. No version suffix — may change without notice |
| Apify | `apify~linkedin-profile-scraper` | 2026-03-09 | Used in Step 5. Actor may be updated by maintainer |
| Seamless.AI | v1 API (`/v1/contacts/search`) | 2026-03-09 | Not yet deployed. No published SLA for API stability |
| Google Sheets API | v4 | 2026-03-09 | 300 req/min quota per project |
| Google Docs API | v1 | 2026-03-09 | Used for address label writes |

---

## Rollback Plan

1. Apps Script: Previous version saved in script editor's version history
2. n8n Workflows: Import the `Lead Gen System (Seamless.AI Reference).json` from repo
3. Seamless.AI nodes can be disabled without affecting Steps 1, 2, 5, 6
4. Rollback time: < 10 minutes
