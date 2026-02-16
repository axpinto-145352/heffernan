# Heffernan WC Lead Gen System — Comprehensive Workflow Audit

**Date:** February 14, 2026
**System:** WC Prospects Lead Generation System
**Platform:** n8n Cloud + Google Apps Script + Google Sheets
**Workflows Reviewed:** Lead Gen System (82 nodes), Rerun EE Calculation (13 nodes)
**Scripts Reviewed:** Google Apps Script orchestration layer (~1,200 lines)
**Spec Reviewed:** Heffernan Dev Specification Sheet v1.0 (28 pages)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Review](#2-architecture-review)
3. [Root Cause Analysis — Why It Keeps Breaking](#3-root-cause-analysis--why-it-keeps-breaking)
4. [Process & Data Flow Review](#4-process--data-flow-review)
5. [Cost-Effectiveness Review](#5-cost-effectiveness-review)
6. [Time Efficiency Review](#6-time-efficiency-review)
7. [Ease of Use / Operator Error Review](#7-ease-of-use--operator-error-review)
8. [Security Review](#8-security-review)
9. [Reliability & Error Handling Review](#9-reliability--error-handling-review)
10. [Google Apps Script Review](#10-google-apps-script-review)
11. [n8n Workflow Review](#11-n8n-workflow-review)
12. [Data Integrity Review](#12-data-integrity-review)
13. [Recommendations — Making It Ironclad](#13-recommendations--making-it-ironclad)
14. [Priority Action Items](#14-priority-action-items)

---

## 1. Executive Summary

This system processes Workers' Compensation prospect data from WCIRB/ECU reports, enriches it with AI-powered employee count and revenue estimates (Perplexity), discovers decision-maker contacts (transitioning from AnyMailFinder to Seamless AI), and prepares qualified prospects for outreach. The architecture spans three tightly-coupled layers: n8n workflows, Google Apps Script, and Google Sheets as a live database.

### Overall Assessment: **Fragile but Functional**

The system works when conditions are ideal but is structurally prone to breakage because:

- **Google Sheets is used as both the database AND the user interface** — any manual edit, accidental sort, column insert, or formatting change can break column references, formula dependencies, and n8n field mappings simultaneously.
- **The n8n workflow and Apps Script are tightly coupled via hardcoded column positions, header names, and row-counting assumptions** — a single column rename or reorder breaks the entire pipeline.
- **There is no input validation, schema enforcement, or structural integrity checking** — the system trusts that the sheet structure will never change.
- **Error handling is minimal** — API failures, empty responses, and malformed data are either silently swallowed or cause the entire workflow to halt.

---

## 2. Architecture Review

### Current Architecture

```
WCIRB ECU Report (CSV)
       ↓
  [0. NEW HERE] ← Manual upload + Apps Script formulas
       ↓ (onEdit trigger or manual)
  [1. Filtered Accounts & POCs] ← Apps Script copy + n8n enrichment
       ↓ (n8n Step 2: Perplexity)
  Domain/Revenue/FP-NP enrichment → Apps Script reformat → 5-row blocks
       ↓ (Scheduled runner polls "Ready for Seamless.AI")
  [Seamless AI webhook] → n8n Step 4 → POC discovery
       ↓
  [2. POCs] + update Filtered sheet
       ↓ (n8n Step 5)
  Apify LinkedIn scraper → LI Profile column
       ↓ (n8n Step 6)
  [Address Labels] → Google Docs → Mail output
```

### Architectural Problems

| # | Problem | Severity | Impact |
|---|---------|----------|--------|
| A1 | **Google Sheets as database** — no schema enforcement, no transactions, no rollback | Critical | Any user edit can corrupt the pipeline |
| A2 | **Dual control plane** — both n8n and Apps Script modify the same sheets simultaneously | Critical | Race conditions, overwrites, trigger storms |
| A3 | **Polling-based trigger** (45s scheduled runner) instead of event-driven | High | Delayed processing, wasted execution time, missed triggers if runner fails |
| A4 | **Two separate n8n instances** — `veteranvectors.app.n8n.cloud` and `timbheffins.app.n8n.cloud` | High | Webhook URLs in CONFIG point to different instances; confusion about which is authoritative |
| A5 | **No staging/test environment** — all changes go directly to production data | High | No safe way to test workflow changes |
| A6 | **Apps Script Web App URL hardcoded in n8n** — redeployment changes the URL | Medium | Workflow breaks on every Apps Script redeploy |
| A7 | **Monolithic workflow** — 82 nodes in a single n8n workflow covering 6 different steps | Medium | Difficult to debug, test, or modify individual steps |

### Architecture Recommendations

1. **Add a schema validation layer** — Before any processing, validate that sheet headers match expected schema. If not, halt and alert instead of silently corrupting data.
2. **Separate concerns into individual n8n workflows** — One workflow per step (EE lookup, Revenue/Domain, Seamless AI, LinkedIn, Address Labels). Use n8n sub-workflows or webhook chains.
3. **Consolidate to a single n8n instance** — The dual-instance setup is a source of confusion. All webhooks should point to the same instance.
4. **Replace polling with webhook-driven triggers** — Instead of the 45-second scheduled runner polling for "Yes" values, have n8n set the trigger AND fire the next step directly.

---

## 3. Root Cause Analysis — Why It Keeps Breaking

Based on the code, data, and spec, these are the most likely failure modes:

### 3A. Column Drift / Header Mismatch

**The #1 cause of breakage.** The Apps Script uses `getHeaderMap_()` to find columns by header name. The n8n workflow uses a mix of header names and cached column positions. If anyone:

- Renames a column header (even adding a space)
- Inserts/deletes a column
- Reorders columns
- Has trailing whitespace in headers (the "Prospect" column in the workflow JSON has 8 trailing spaces: `"Prospect        "`)

...the entire pipeline breaks silently. The Apps Script's `normalizeKey_()` does `.trim().toLowerCase()` but n8n's Google Sheets nodes use exact header matching.

**Evidence from the workflow JSON:** The "Prospect" field has trailing spaces in the schema (`"Prospect        "`), which means n8n is matching against a header with trailing whitespace. If someone cleans up the header, the mapping breaks.

### 3B. Row Counting / Block Boundary Errors

The system assumes companies occupy exactly 3 or 5 contiguous rows separated by blank rows. The `checkSeamlessTrigger_()` function walks backward/forward to find block boundaries:

```javascript
for (let b = i - 1; b >= 0; b--) {
  if (isBlankRow_(allValues[b])) break;
  blockStartRow = CONFIG.START_ROW_BLOCK + b;
}
```

If a user accidentally deletes a separator blank row, two company blocks merge and the system sends wrong data to Seamless AI. If a user inserts an extra blank row, a company block gets split.

### 3C. Race Conditions Between n8n and Apps Script

Both n8n and the Apps Script scheduled runner modify the same cells:

- n8n writes "Ready for Seamless.AI" = "Yes" to the Filtered sheet
- The scheduled runner reads that column every 45 seconds and changes it to "Sent"
- n8n also reads the Filtered sheet to get company data

If the scheduled runner fires between n8n's write and its subsequent read, data can be in an inconsistent state. The 45-second `RUNNER_MIN_GAP_SEC` guard helps but doesn't eliminate this.

### 3D. Formula Injection Conflicts

The Apps Script `fillNewHereFormulasForK_()` writes VLOOKUP formulas into cells. If n8n then reads those cells before the formulas have calculated (Google Sheets API returns formula results asynchronously), n8n gets stale or `#REF!` values.

Additionally, the `reformatARenewalRows_()` function deletes all rows and re-inserts them:
```javascript
if (lastRow >= CONFIG.START_ROW_BLOCK) {
  sheet.deleteRows(CONFIG.START_ROW_BLOCK, lastRow - CONFIG.START_ROW_BLOCK + 1);
}
sheet.insertRowsAfter(CONFIG.START_ROW_BLOCK - 1, newOutput.length);
```

This destroys all formulas, data validations, conditional formatting, and notes in those rows. While it re-applies some formatting, any column-specific formulas set by n8n or manually are lost.

### 3E. Operator Error in Google Sheets

The Filtered Accounts sheet has dropdown validations and conditional formatting applied programmatically. But:

- Users can paste over validations
- Users can sort/filter the entire sheet, breaking the 5-row block structure
- Users can accidentally edit webhook trigger columns
- The "Delete All Rows" menu item has only a single confirmation dialog — one misclick destroys everything

### 3F. API Failures Without Recovery

The n8n workflow's Perplexity nodes have no retry-on-error configuration in the exported JSON. The `retryOnFail` is only set on a few nodes (e.g., `Prompts` node has `retryOnFail: true`, but the `Run EE calc` Perplexity node does not). If Perplexity returns a 429 or 500, the workflow halts mid-batch with some companies processed and others not.

### 3G. Inconsistent "If" Node Conditions

Multiple `If` nodes in the workflow have **empty conditions** — no leftValue, no rightValue:

```json
"leftValue": "",
"rightValue": "",
"operator": {
  "type": "string",
  "operation": "equals"
}
```

Nodes `If` (id: 20931c42), `If4` (id: 0d669554), and `If` (id: 685b6a27) all have this pattern. These are essentially no-op conditions that always evaluate to `true` (empty string equals empty string). This suggests they were placeholders that were never configured, or their conditions were accidentally cleared.

---

## 4. Process & Data Flow Review

### Current Flow (6 Steps)

| Step | Trigger | Action | Output |
|------|---------|--------|--------|
| 1 | GS Trigger (rowAdded on NEW HERE) | Perplexity EE count | EE's, EE Reasoning → NEW HERE |
| 2 | GS Trigger (rowAdded on Filtered) | Perplexity Domain/Revenue/FP-NP | Domain, Revenue, FP/NP → Filtered |
| 3 | Apps Script onEdit (col L/M) | Copy NEW HERE → Filtered | Qualifying rows copied |
| 4 | Manual execution | Seamless AI POC discovery | POCs → POCs sheet + Filtered |
| 5 | GS Trigger (rowUpdate on Filtered) | Apify LinkedIn scraper | LI Profile → Filtered |
| 6 | GS Trigger (rowUpdate on Filtered/Address Labels) | Corrected Name + Address Labels | Google Docs output |

### Process Issues

| # | Issue | Impact |
|---|-------|--------|
| P1 | **Step 4 is manually triggered** — requires someone to click "Execute workflow" in n8n | Bottleneck; if forgotten, pipeline stalls |
| P2 | **Step 3 is triggered by onEdit** — but n8n API writes don't fire onEdit | If n8n sets the trigger column, nothing happens until the scheduled runner catches it |
| P3 | **No status tracking per company** — no "pipeline stage" column tracking where each company is in the process | Impossible to identify stuck companies |
| P4 | **Duplicate processing protection is weak** — deduplication checks Bureau Number OR (Primary Name + Street), but companies can have multiple Bureau Numbers | Potential duplicates |
| P5 | **The "Processing" column in NEW HERE** is set to "Done" by n8n but there's no "Error" or "Pending" state | No way to identify companies that failed enrichment |
| P6 | **No batch completion tracking** — if n8n processes 50 companies and fails on #25, there's no record of which succeeded and which didn't | Partial processing with no recovery path |
| P7 | **Step 2 still writes Revenue/Industry/SIC via Perplexity** but the spec says Seamless AI should take this over | Spec and implementation are out of sync — during transition this could cause overwrites |

---

## 5. Cost-Effectiveness Review

### Current API Costs Per Company

| Service | Calls/Company | Est. Cost/Call | Cost/Company |
|---------|--------------|----------------|--------------|
| Perplexity (EE count) | 1 | ~$0.005-0.01 (sonar-pro) | ~$0.01 |
| Perplexity (Revenue/Domain) | 1 | ~$0.005-0.01 | ~$0.01 |
| Seamless AI (POCs) | 1 | 1 credit (pricing varies) | ~$0.50-2.00 |
| Apify (LinkedIn) | Up to 5 | ~$0.01-0.05/profile | ~$0.05-0.25 |
| **Total per company** | | | **~$0.57-2.27** |

### Cost Concerns

| # | Concern | Details |
|---|---------|---------|
| C1 | **Perplexity is called for every company even if EE data exists elsewhere** | WCIRB reports often contain employee count data in the class description. Pre-filtering could reduce API calls by 30-50%. |
| C2 | **No caching of API responses** | If a company is processed twice (e.g., rerun), the same Perplexity/Seamless calls are made again at full cost. |
| C3 | **Floor-based fallback is overused** | Looking at the NEW HERE data, many companies get assigned the "floor" employee count (25, 50, or 75) because ZoomInfo/Growjo data is unavailable. This means the Perplexity call cost was wasted for a floor fallback. |
| C4 | **Batch size of 1** | The `Loop Over Items` nodes process one company at a time. While necessary for rate limiting, the overhead of reading/writing to Google Sheets per item is expensive in execution time. |
| C5 | **88 companies in NEW HERE, only ~7 made it to Filtered** | The filtering is very aggressive ($25K WC premium minimum), meaning ~92% of Perplexity EE calls are for companies that won't qualify. Consider filtering BEFORE enrichment. |

### Cost Optimization Opportunities

1. **Pre-filter before Perplexity** — Calculate WC Premium estimate from WCIRB rates + ExMod BEFORE calling Perplexity. Only call Perplexity for companies that pass the threshold. This could save 50-80% of API costs.
2. **Cache enrichment results** — Store API responses in the Sources sheet with a timestamp. Skip re-enrichment for companies processed within the last 30 days.
3. **Batch Perplexity calls where possible** — Group 3-5 companies into a single Perplexity prompt to reduce per-call overhead.

---

## 6. Time Efficiency Review

### Current Processing Time Estimates

| Step | Time per Company | Bottleneck |
|------|-----------------|------------|
| Step 1 (EE) | ~5-10s (Perplexity API + parse + write) | API response time |
| Step 2 (Revenue) | ~5-10s | API response time |
| Step 3 (Copy to Filtered) | ~1-2s | Apps Script execution |
| Step 4 (POCs) | ~10-30s (Seamless AI + write) | API + rate limiting |
| Step 5 (LinkedIn) | ~5-15s (Apify scraper) | Scraper execution |
| Step 6 (Address Labels) | ~3-5s | Sheet writes + Doc generation |
| **Total per company** | **~30-70s** | |
| **100 companies** | **~50-120 minutes** | |

### Time Efficiency Issues

| # | Issue | Impact |
|---|-------|--------|
| T1 | **Batch size of 1 with Wait nodes** | Each company waits for the full API round-trip + a configurable delay. No parallelism. |
| T2 | **Google Sheets triggers are slow** | The GS trigger node polls every 30-60 seconds. Combined with the 45-second Apps Script runner, a single company can wait up to 2 minutes between steps. |
| T3 | **The `reformatARenewalRows_()` function rewrites the entire Filtered sheet** every time it's called | O(n) operation where n = total rows, not just new rows. Becomes progressively slower. |
| T4 | **Step 4 is manually triggered** | Human latency (could be hours or days) between Step 2 completion and Step 4 execution. |
| T5 | **Formula recalculation after bulk writes** | After the Apps Script writes formulas to NEW HERE, Google Sheets recalculates all cells. With 88+ rows of VLOOKUP formulas, this adds 5-10 seconds of spreadsheet lag. |

### Time Optimization Opportunities

1. **Automate Step 4 trigger** — After Step 2 sets "Ready for Seamless.AI" = "Yes", the scheduled runner already detects this. Make it automatic end-to-end.
2. **Increase batch size** — Process 3-5 companies per batch with a longer inter-batch delay instead of 1 company with a short delay.
3. **Pre-compute WC Premium** — The WCIRB rate VLOOKUPs can be done in Apps Script without formulas, avoiding the formula recalculation lag.
4. **Incremental reformatting** — Only reformat newly added companies instead of rewriting the entire sheet.

---

## 7. Ease of Use / Operator Error Review

### Current User Touchpoints

| Action | Who | Where | Risk |
|--------|-----|-------|------|
| Upload WCIRB data | Operator | Paste into NEW HERE sheet | Could paste into wrong columns; could overwrite headers |
| Set CRM check columns (H, I, J) | Operator | NEW HERE dropdowns | Low risk (dropdowns constrain input) |
| Set "Final Okay to Add" (M) | Operator | NEW HERE dropdown | Medium — triggers copy to Filtered |
| Execute Step 4 (POCs) | Operator | n8n UI "Execute workflow" button | Must remember to do this; easy to run twice |
| Set "Ready to Move to Address List" | Operator | Filtered sheet dropdown | Low risk (dropdown + green highlight) |
| Set thresholds | Operator | Custom menu | Low risk |
| Delete All Rows | Operator | Custom menu | VERY HIGH — single dialog destroys everything |

### Operator Error Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| O1 | **Pasting data into wrong columns** | High | Critical — breaks all formulas and mappings | None currently |
| O2 | **Accidentally sorting the Filtered sheet** | High | Critical — breaks 5-row block structure | None currently |
| O3 | **Editing column headers** | Medium | Critical — breaks both n8n and Apps Script | None currently |
| O4 | **Running Step 4 twice** | Medium | High — duplicate POC lookups, wasted Seamless AI credits | Partial (dedup exists but imperfect) |
| O5 | **Clicking "Delete All Rows" accidentally** | Low | Critical — all data destroyed | Single confirmation dialog only |
| O6 | **Editing cells in the Filtered sheet that are managed by automation** | High | High — overwrites get reversed or cause conflicts | No protected ranges |
| O7 | **Inserting rows in the middle of the sheet** | Medium | High — breaks row-counting logic | No structural protection |

### Ease-of-Use Improvements

1. **Protect sheet structure** — Lock header rows, protect columns managed by automation, restrict who can sort/filter.
2. **Add a dedicated "Upload" sheet** — Instead of having operators paste directly into NEW HERE, create a separate upload sheet with strict column templates. The Apps Script validates and copies to NEW HERE.
3. **Add a status dashboard** — A summary sheet showing: total companies in pipeline, companies per stage, errors/stuck items, last run time.
4. **Require double confirmation for destructive actions** — "Delete All Rows" should require typing "DELETE" to confirm, not just clicking "Yes".
5. **Add undo/backup** — Before any bulk operation, snapshot the data to a hidden backup sheet.

---

## 8. Security Review

### Current Security Posture

| Area | Status | Risk |
|------|--------|------|
| API Key storage (n8n) | Encrypted vault (AES-256) | Low |
| API Key in workflow JSON | Not exposed (credential refs only) | Low |
| Apps Script Web App URL | Public (anyone with URL can POST) | **HIGH** |
| Google Sheets access | OAuth 2.0 scoped | Low |
| Webhook URLs | Hardcoded in Apps Script CONFIG | **Medium** |
| Audit logging | Basic (onEdit only, no API write tracking) | Medium |
| Data at rest | Google encryption | Low |
| Data in transit | HTTPS/TLS | Low |

### Security Issues

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| S1 | **Apps Script Web App has no authentication** | High | The `doPost()` endpoint accepts any POST request with a matching `trigger` value. Anyone who discovers the URL can trigger `reformatARenewalRowsMenu`, `clearAllDataFormatting`, or `mainScheduledRunner` remotely. |
| S2 | **Webhook URLs are hardcoded in cleartext** | Medium | Both `EMPLOYEE_WEBHOOK_URL` and `SEAMLESS_WEBHOOK_URL` are in the Apps Script source. If the script is shared or the sheet is duplicated, these URLs are exposed. |
| S3 | **n8n webhooks have no authentication** | Medium | The n8n webhook endpoints accept any POST request. No API key, HMAC signature, or IP whitelist. |
| S4 | **Audit log only tracks manual edits** | Medium | n8n API writes (which constitute the majority of data changes) are not logged. There's no way to trace what n8n changed or when. |
| S5 | **Google Sheets is shared with edit access** | Low-Med | Anyone with edit access can modify automation-critical columns, headers, or structure. |
| S6 | **Personal contact data (emails, phones) stored in Google Sheets** | Medium | PII from Seamless AI is stored in a shared spreadsheet without additional access controls or data retention policies. |

### Security Recommendations

1. **Add authentication to the Apps Script Web App** — Use a shared secret token in the POST body that the script validates before executing any action.
2. **Add HMAC signature verification to n8n webhooks** — Generate a shared secret and validate the request signature.
3. **Move sensitive config to ScriptProperties** — Webhook URLs should not be in source code. Store them in ScriptProperties (already used for thresholds).
4. **Implement n8n write logging** — Add a logging step in each n8n workflow that writes to the Audit Log sheet whenever it modifies data.
5. **Add data retention policy** — Auto-delete POC contact data older than 90 days to reduce PII exposure.

---

## 9. Reliability & Error Handling Review

### Current Error Handling

| Component | Error Handling | Assessment |
|-----------|---------------|------------|
| n8n Perplexity nodes | No retry configured (most nodes) | **Poor** |
| n8n Google Sheets nodes | Default n8n retry | **Adequate** |
| n8n Code nodes (parse) | try/catch with null defaults | **Adequate** |
| Apps Script webhook calls | try/catch with Logger.log | **Poor** (fire-and-forget) |
| Apps Script scheduled runner | LockService + gap guard | **Good** for concurrency |
| Apps Script formula injection | No validation of results | **Poor** |
| Overall error notification | None | **Critical gap** |

### Reliability Issues

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| R1 | **No alerting on failure** | Critical | If the workflow fails at 2 AM, nobody knows until they manually check. No email, Slack, or dashboard notifications. |
| R2 | **Partial processing with no recovery** | Critical | If Step 1 processes 40/88 companies and fails, there's no way to resume from company #41. You must re-run the entire batch (re-processing the 40 already done). |
| R3 | **`callWebhook_()` is fire-and-forget** | High | The Apps Script sends webhooks but doesn't verify the n8n workflow actually started or completed. If n8n is down, the trigger is lost. |
| R4 | **Google Sheets API quotas** | High | Google Sheets API has a limit of ~300 requests/minute/user. With the scheduled runner making dozens of reads/writes every 45 seconds, plus n8n making its own API calls, quota exhaustion is possible under heavy load. |
| R5 | **`reformatARenewalRows_()` is destructive** | High | Deletes all rows and reinserts them. If it crashes mid-operation (Apps Script 6-minute timeout), the Filtered sheet is left in a corrupted state with missing rows. |
| R6 | **No idempotency on webhook triggers** | Medium | If `checkSeamlessTrigger_()` fires a webhook but the cell value update to "Sent" fails (e.g., quota error), the next runner cycle will fire the same webhook again. |

### Reliability Recommendations

1. **Add n8n error workflow** — Configure an error workflow that sends email/Slack notifications when any node fails.
2. **Implement checkpointing** — Add a "Last Processed Row" property that tracks progress through batches. On restart, resume from the last checkpoint.
3. **Make the reformat function non-destructive** — Instead of delete-all + reinsert, update in place. Only add new rows for new companies.
4. **Add webhook delivery confirmation** — After calling a webhook, check for a response code and retry if needed. Log the delivery status.
5. **Add a health check endpoint** — A simple n8n workflow that responds to a ping, so the Apps Script can verify n8n is reachable before triggering.

---

## 10. Google Apps Script Review

### Code Quality Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| Code organization | Good | CONFIG object, helper functions, clear sections |
| Naming conventions | Good | Consistent `functionName_()` for private functions |
| Error handling | Poor | Most functions silently fail; no error propagation |
| Performance | Fair | Many individual cell reads/writes instead of batch operations |
| Maintainability | Fair | Monolithic file; no comments explaining business logic |
| Testing | None | No test functions or test data |

### Specific Issues

| # | Function | Issue |
|---|----------|-------|
| GS1 | `fillNewHereFormulasForK_()` | Makes individual `sheet.getRange(rowIndex, col).setFormula()` calls in a loop. Should batch into a single `setValues()` call. Currently O(n) API calls where n = number of rows. |
| GS2 | `copyNewHereToRenewalByWcPremium_()` | The column mapping has obvious typos: `'PriorE xMod Year1'`, `'PriorE xMod 1'`, etc. (note the space before 'xMod'). These won't match any header unless the sheet headers also have these typos. |
| GS3 | `reformatARenewalRows_()` | Destructive rewrite of entire sheet. Uses `sheet.deleteRows()` + `sheet.insertRowsAfter()` which is slow and fragile. |
| GS4 | `checkSeamlessTrigger_()` | Block boundary detection walks row-by-row. If a company has 6 rows instead of 5 (operator error), the block detection includes the extra row and sends wrong data. |
| GS5 | `mainScheduledRunner()` | Runs 10+ functions sequentially every 45 seconds. If any function takes longer than expected, it can exceed the 6-minute Apps Script execution limit. |
| GS6 | `onEdit()` | The audit logging `logChange_()` runs on EVERY edit, including programmatic formula calculations. This generates noise and can slow down the sheet. |
| GS7 | `bucketizeEmployeeCounts()` | Rounds all EE counts ≤50 down to 25. This is a data integrity concern — why overwrite actual data with an approximation? The original value is lost. |
| GS8 | CONFIG.EMPLOYEE_WEBHOOK_URL | Points to `veteranvectors.app.n8n.cloud` while CONFIG.SEAMLESS_WEBHOOK_URL points to `timbheffins.app.n8n.cloud`. Two different n8n instances. |

---

## 11. n8n Workflow Review

### Lead Gen System (82 nodes)

| Aspect | Rating | Notes |
|--------|--------|-------|
| Node naming | Poor | Generic names like "If", "If4", "If5" give no indication of purpose |
| Error handling | Poor | Most nodes have no retry; empty If conditions |
| Documentation | Fair | Sticky notes label steps but don't explain logic |
| Modularity | Poor | All 6 steps in one workflow |
| Idempotency | Poor | Re-running processes duplicates |

### Specific n8n Issues

| # | Node | Issue |
|---|------|-------|
| N1 | Multiple `If` nodes | Empty conditions (leftValue and rightValue both empty strings). These always evaluate to `true`, making them dead branches. |
| N2 | `Update New Hire Sheet` | Uses `row_number: 0` as a match field — this is almost certainly wrong. row_number 0 doesn't exist in Google Sheets. |
| N3 | `Loop Over Items` (all instances) | Batch size 1. Every company requires a full loop iteration with individual API calls and sheet writes. |
| N4 | `Format Rows` node | Calls the Apps Script Web App URL. This URL is hardcoded and changes on every Apps Script deployment. |
| N5 | `Update Renewal (Revenue)` | Writes `"Ready for Seamless.AI": "Yes"` — but this fires for EVERY company regardless of whether the Seamless AI step should run. |
| N6 | Google Sheets trigger nodes | Use `rowAdded` trigger type. If rows are added by the Apps Script (not by user), the trigger may or may not fire depending on Google's trigger propagation. |
| N7 | `Parse EE data` code node | Robust JSON parsing with fence removal and null handling — this is one of the better-implemented nodes. |
| N8 | Wait nodes | Not visible in the exported JSON but referenced in the spec. Wait duration is configurable but there's no adaptive throttling based on API response headers. |

### Rerun EE Calculation (13 nodes)

This is a cleaner, focused workflow that does one thing well. It reads NEW HERE, filters for rows missing EE data, calls Perplexity, and updates the sheet. Issues:

- Webhook trigger at path `47ddd94f-b444-4f7e-9198-b3238767bb0f` — same as the one in the CONFIG, so the Apps Script "Re-check EE" button works.
- The `If6` node checks Bureau Number not empty AND EE's is empty — good filter logic.
- Uses `appendOrUpdate` with `useAppend: true` which creates new rows if the Bureau Number doesn't match. This could create duplicate rows if Bureau Number formats differ (e.g., leading zeros).

---

## 12. Data Integrity Review

### Current Data

From the CSV exports:

- **NEW HERE**: 88 companies, all with "Processing: Done" — enrichment complete
- **Filtered**: ~7 companies (3 rows each currently, transitioning to 5), with POC data for some
- **POCs**: Empty (0 data rows)
- **Sources**: 695 entries with EE and Revenue source URLs
- **Audit Log**: 1,239 entries

### Data Integrity Issues

| # | Issue | Details |
|---|-------|---------|
| D1 | **Employee count data quality is poor** | Many companies assigned floor values (25, 50, 75) because Perplexity couldn't find reliable data. The "EE Reasoning" field often says "floor-based fallback." These estimates are unreliable for WC premium calculation. |
| D2 | **WC Premium calculation depends on EE estimate** | Formula: `D * E * ExMod` where E is employee payroll estimate. If EE count is wrong, premium is wrong, and the company may be incorrectly filtered in or out. |
| D3 | **The "Blended Rate" column** (column D in NEW HERE) uses a fixed 60/20/20 weighting that may not be actuarially accurate for all class codes. |
| D4 | **Revenue data is similarly unreliable** | Many companies get "maturity floor" revenue estimates. The reasoning fields show "No ZoomInfo or Growjo data" frequently. |
| D5 | **Filtered sheet has 3-row blocks currently** | The spec says 5 rows, but the live data shows 3 rows per company. The transition hasn't happened yet, creating a mismatch between code (expects 5) and data (has 3). |
| D6 | **No data freshness tracking** | There's no "Last Enriched Date" column. Stale data from months ago looks identical to fresh data. |
| D7 | **Duplicate Bureau Numbers possible** | The dedup key uses Bureau Number OR (Primary Name + Street Address). Companies can appear in multiple ECU reports with different Bureau Numbers but same address. |

---

## 13. Recommendations — Making It Ironclad

### Tier 1: Critical (Fix Immediately)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| R1 | **Add schema validation at startup** — Before any processing, verify all expected column headers exist in all sheets. If any are missing or renamed, halt and alert. Add this to both the Apps Script scheduled runner and n8n workflow start. | Low | Prevents silent breakage from header changes |
| R2 | **Protect sheet structure** — Lock row 1 (headers) on all sheets. Protect columns managed by automation. Use Google Sheets "Protected Ranges" API. | Low | Prevents accidental operator changes |
| R3 | **Add error notifications** — Configure n8n error workflow that sends email/Slack when any node fails. Add similar alerting in Apps Script via MailApp.sendEmail(). | Low | Ensures failures are caught immediately |
| R4 | **Fix the empty If conditions** — Either configure them properly or remove them. Dead branches hide bugs. | Low | Prevents unexpected routing |
| R5 | **Fix the column mapping typos** — The `'PriorE xMod Year1'` etc. typos in `copyNewHereToRenewalByWcPremium_()` need to match actual sheet headers. | Low | Fixes data loss during copy |

### Tier 2: High Priority (Fix This Sprint)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| R6 | **Replace destructive reformat with incremental update** — Instead of deleting/reinserting all rows, only add new company blocks. Use a "Reformatted?" flag column. | Medium | Eliminates data loss risk from reformat crashes |
| R7 | **Add a pipeline status column** — Track each company's current stage (Uploaded → EE Done → Filtered → Domain/Rev Done → POC Ready → POC Done → Address Labels). | Medium | Makes pipeline visibility instant |
| R8 | **Authenticate the Apps Script Web App** — Add a shared secret token validated in `doPost()`. | Low | Closes the unauthenticated endpoint vulnerability |
| R9 | **Consolidate to one n8n instance** — Update all webhook URLs to point to the same instance. | Low | Eliminates dual-instance confusion |
| R10 | **Add pre-filtering before Perplexity** — Calculate WC Premium from WCIRB rates before calling Perplexity. Only enrich companies above the threshold. | Medium | Saves 50-80% of API costs |

### Tier 3: Important (Fix This Month)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| R11 | **Split the monolithic workflow** — Create separate n8n workflows for each step, connected via webhooks or sub-workflows. | High | Makes debugging, testing, and modification much easier |
| R12 | **Add a dedicated upload interface** — Create a clean "Upload" sheet with strict column templates and validation. Apps Script validates and copies to NEW HERE. | Medium | Eliminates paste-into-wrong-column errors |
| R13 | **Implement idempotent processing** — Use a processing hash or timestamp to prevent re-processing companies that have already been enriched. | Medium | Saves API costs and prevents duplicate data |
| R14 | **Add backup/snapshot before destructive operations** — Before "Delete All Rows" or "Reformat", copy current data to a hidden backup sheet. | Low | Enables recovery from operator errors |
| R15 | **Add data freshness tracking** — Add "Last Enriched" timestamp column to track when each company was last processed. | Low | Enables targeted re-enrichment |

### Tier 4: Nice to Have (Future Sprint)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| R16 | **Migrate from Google Sheets to a real database** — Use Airtable, Supabase, or a PostgreSQL database with n8n. Keep Google Sheets as a read-only dashboard. | Very High | Eliminates the root cause of most breakage |
| R17 | **Add automated testing** — Create a test dataset and validation workflow that runs before deploying changes. | High | Catches regressions before they hit production |
| R18 | **Implement adaptive rate limiting** — Read Perplexity/Seamless AI response headers for rate limit info and adjust delays dynamically. | Medium | Prevents 429 errors without over-throttling |
| R19 | **Add a monitoring dashboard** — A simple web page showing pipeline status, error rates, API costs, and processing times. | High | Provides operational visibility |

---

## 14. Priority Action Items

### Immediate (Do Today)

1. Fix the empty `If` node conditions in the n8n workflow
2. Fix the column mapping typos in `copyNewHereToRenewalByWcPremium_()`
3. Add error email notifications to the n8n workflow
4. Protect header rows (row 1) on all sheets

### This Week

5. Add schema validation to the scheduled runner
6. Add a "Pipeline Status" column to the Filtered sheet
7. Authenticate the Apps Script Web App endpoint
8. Consolidate webhook URLs to one n8n instance
9. Replace the destructive `reformatARenewalRows_()` with an incremental version

### This Month

10. Split the monolithic n8n workflow into step-specific workflows
11. Add pre-filtering to skip Perplexity calls for companies below WC Premium threshold
12. Create an upload template sheet with validation
13. Add backup snapshots before bulk operations
14. Implement idempotent processing with enrichment timestamps

---

## Appendix: File Inventory

| File | Type | Size | Description |
|------|------|------|-------------|
| Lead Gen System (4).json | n8n export | 249 KB | Main workflow (82 nodes, 6 steps) |
| Rerun EE Calculation.json | n8n export | 31 KB | EE recheck workflow (13 nodes) |
| Heffernan_Dev_Specification_Sheet.pdf | Spec | 491 KB | Seamless AI integration spec (28 pages) |
| 0. NEW HERE.csv | Data | 102 KB | 88 prospect companies |
| 1. Filtered Accounts & POCs.csv | Data | 13 KB | 7 filtered companies (3-row blocks) |
| 2. POCs.csv | Data | 128 B | Empty (header only) |
| Address Labels (General).csv | Data | 5.5 KB | 47 address labels |
| Address Labels (Non-Profit).csv | Data | 1.4 KB | 11 address labels |
| Audit Log.csv | Data | 139 KB | 1,239 audit entries |
| Prompts.csv | Config | 15 KB | AI prompt templates |
| Sources.csv | Data | 52 KB | 695 source URL entries |
| WCIRB Rates.csv | Reference | 6 KB | 493 class code rate entries |

---

*End of Audit Report*
