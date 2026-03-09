# Assessment Report: WC Prospects Lead Generation System

**Date:** 2026-03-09
**Type:** n8n Workflows + Google Apps Script Automation
**Mode:** Deep
**Overall Risk Level:** MEDIUM

## Executive Summary

The WC Prospects Lead Generation System is a well-engineered v2 rebuild that sits in the top quartile of Google Sheets automation systems for robustness. Key strengths include header-based column references, lock + gap guards, comprehensive audit logging, and solid error handling with retry/backoff. However, the review surfaced critical cybersecurity gaps (webhook auth bypass, formula injection via `USER_ENTERED` cell format, missing auth token on Step 2 calls), data integrity risks (destructive reformat with no rollback, unvalidated AI parse ranges), and compliance gaps (no CCPA data subject rights process, no data retention policy). The system is production-ready for its current scale (~200 prospects/quarter) but requires the fixes listed below before the Seamless.AI workflow goes live.

## Priority Matrix

| Priority | Finding | Lens | Confidence | Effort | Impact |
|----------|---------|------|------------|--------|--------|
| 🔴 Critical | Webhook auth bypass when `WEBHOOK_AUTH_TOKEN` env var is unset — any POST accepted | 8, 16 | HIGH | Low | High |
| 🔴 Critical | Step 2 "Trigger Apps Script Format" sends no auth token — will fail at runtime | 16 | HIGH | Low | High |
| 🔴 Critical | `cellFormat: USER_ENTERED` on n8n Sheets writes allows formula injection from API responses | 8, 16 | HIGH | Low | High |
| 🟡 Important | Destructive reformat (`clearContent` then `setValues`) with no backup — data loss on write failure | 13 | HIGH | Med | High |
| 🟡 Important | `parseInt()` NaN propagation in Seamless webhook validation | 13 | HIGH | Low | Med |
| 🟡 Important | No EE count sanity range check — hallucinated values pass through unchecked | 10, 13 | HIGH | Low | Med |
| 🟡 Important | doPost auth failures not logged to audit trail | 9, 16 | HIGH | Low | Med |
| 🟡 Important | doPost returns raw error messages (potential info leak) | 8 | HIGH | Low | Med |
| 🟡 Important | No CCPA data subject rights infrastructure (CA-specific system) | 15 | MED | Med | Med |
| 🟡 Important | No data retention policy — prospect data accumulates indefinitely | 15 | MED | Low | Med |
| 🟡 Important | Error messages in cells truncated to 50 chars — too short for diagnosis | 11 | HIGH | Low | Low |
| 🟡 Important | No first-run setup validation — missing ScriptProperties cause cryptic errors | 11 | HIGH | Med | Med |
| 🟢 Nice to Have | N+1 cell writes in `fillPocNumbers_` and `fillAddressLabelsFormulas_` | 14 | HIGH | Med | Low |
| 🟢 Nice to Have | Perplexity model not version-pinned via env var | 5, 10 | HIGH | Low | Low |
| 🟢 Nice to Have | n8n execution data may contain PII — set minimum retention | 16 | MED | Low | Low |
| 🟢 Nice to Have | Step 6 prompt hardcoded inline instead of Prompts sheet | 12 | HIGH | Low | Low |
| 🟢 Nice to Have | No dependency version tracking in architecture docs | 12 | HIGH | Low | Low |

## Top 3 Actions This Week

1. **Fix webhook auth bypass (Lens 16.2):** Change Seamless webhook validation from `if (expectedToken && ...)` to `if (!expectedToken || token !== expectedToken)` — fail-closed, not fail-open. Add auth token to Step 2 Apps Script trigger call.
2. **Switch `cellFormat` from `USER_ENTERED` to `RAW` on all n8n Google Sheets write nodes** — prevents formula injection from any external API response (Perplexity, Apify, Seamless.AI).
3. **Add backup before destructive reformat** — copy Filtered sheet data before `clearContent()` to prevent data loss on write failure.

## Dimensional Analysis

### 1. Legal — CAUTION | Confidence: HIGH | Severity: 3
- LinkedIn scraping via Apify operates in a legal gray area (LinkedIn ToS prohibits unauthorized scraping)
- Seamless.AI contact data triggers CCPA/TCPA obligations for CA residents — no opt-out/deletion mechanism exists
- AI-generated employee counts used for WC Premium qualification could create E&O liability if used in binding quotes
- doPost endpoint deployed as "Anyone" access — mitigated by token auth but increases attack surface
- No documented Data Processing Agreements (DPAs) with Perplexity, Apify, Seamless.AI, n8n

### 2. Ethical — CAUTION | Confidence: MED | Severity: 2
- Prospects are not informed of automated data collection combining AI enrichment, LinkedIn scraping, and contact harvesting
- AI employee count estimation may have uneven accuracy across business types (bias risk)
- Audit log can be fully deleted via menu, destroying the accountability record
- Physical mail targeting via automated data harvesting warrants proportionate, non-manipulative messaging

### 3. Logistical — CAUTION | Confidence: HIGH | Severity: 3
- Single Google Sheet as database — 10M cell limit, API quota (300 req/min) with 4 polling triggers + scheduled runner
- Apps Script 6-minute execution limit risk as data grows beyond ~2,000 rows
- Apps Script Web App URL changes on every redeployment — manual update required in n8n
- Seamless.AI workflow blocked on credential provisioning (Nadia Messiah, Heffernan IT)
- Error notifier uses placeholder Slack URL — if misconfigured, all error visibility lost

### 4. Current State — PASS | Confidence: HIGH
- Well-structured v2 rebuild addressing documented v1 failures
- Header-based column resolution, lock + gap guard, exponential backoff retries, audit logging with rotation
- Human approval gate ("Final Okay" / "Manual Override") before prospects enter enrichment pipeline
- Top quartile for Google Sheets automation systems in terms of robustness
- Separation between Apps Script (orchestration) and n8n (API calls/enrichment) is clean

### 5. Future Strategy — CAUTION | Confidence: HIGH | Severity: 3
- Apps Script execution limits are a hard ceiling — needs early-exit timers as data grows
- Single-vendor dependency on Perplexity `sonar-pro` for 3 critical steps — no fallback
- Seamless.AI API has no published stability SLA — no abstraction layer for provider swap
- Single-spreadsheet architecture supports ~1,100 companies before degradation
- n8n Cloud lock-in — credentials, execution history, and webhook URLs are not portable

### 6. Cost Effectiveness — CAUTION | Confidence: MED | Severity: 2
- API costs are negligible (~$3-9/quarter for Perplexity, ~$6-50 for Apify)
- n8n Cloud execution count is the cost driver: 4 triggers polling every minute = ~172,800 executions/month — likely requires Enterprise plan
- Total incremental cost ~$84-359/quarter vs. 67-100 hours saved in manual research — strong ROI
- Reducing poll frequency to every 5 minutes for Steps 5 & 6 would cut executions ~60%

### 7. Time Effectiveness — PASS | Confidence: HIGH
- ~3-7 minutes automated per company vs. ~25-35 minutes manual — saves 20-28 minutes each
- Manual POC entry is the largest remaining bottleneck (10-15 min/company, 33-50 hrs/quarter)
- Maintenance burden estimated at 1-2 hours/month
- Prompt changes can be made without code changes (stored in Prompts sheet)

### 8. Security — CAUTION | Confidence: HIGH | Severity: 3
- **CRITICAL:** Webhook auth bypass when `WEBHOOK_AUTH_TOKEN` is unset — `if (expectedToken && ...)` evaluates to false, skipping auth entirely
- String comparison for token auth is not timing-safe (low practical risk over internet)
- `cellFormat: USER_ENTERED` on n8n Sheets writes could execute formulas from API responses
- No secret rotation mechanism documented
- Credential storage follows best practices — zero hardcoded secrets
- Formula injection prevention implemented in Apps Script (`sanitizeForSheet_`)

### 9. Guardrails & Governance — CAUTION | Confidence: HIGH | Severity: 2
- Error notifier has no fallback if Slack is down — errors silently lost
- No monitoring for stuck/hung n8n executions
- "Delete All Rows" has no backup step before destruction
- Audit trail is comprehensive (10k row rotation, edit tracking, source logging)
- Lock + gap guard is solid concurrency protection

### 10. AI Safety & Responsible AI — CAUTION | Confidence: HIGH | Severity: 2
- No model version pinning — `sonar-pro` could change behavior silently
- No EE count reasonableness check — hallucinated values pass through unchecked
- Prompt templates in Google Sheet editable by any sheet user (prompt injection vector)
- Step 6 prompt hardcoded inline — inconsistent with Steps 1 & 2 (Prompts sheet)
- Low temperature (0.1) reduces hallucination variance — good
- No PII sent to AI models — only company names, addresses, Bureau Numbers

### 11. Client Experience & Usability — PASS | Confidence: MED
- Custom "Automation Tools" menu with threshold setting, sort toggle, audit log tools
- Dropdown-based inputs prevent typos in action columns
- "REVIEW NEEDED" flags surface AI failures visibly in cells
- Error messages truncated to 50 chars in cells — too short for diagnosis
- No first-run validation — missing ScriptProperties cause cryptic errors
- Documentation is comprehensive and well-structured

### 12. Maintainability & Handoff Readiness — CAUTION | Confidence: HIGH | Severity: 3
- Bus factor of 1 — combines 6+ technologies requiring specialized knowledge
- n8n workflow JSON not synced from UI changes — no export discipline
- Credential placeholders require manual replacement with no validation
- Vendor lock-in on Perplexity (3 steps), Apify, Seamless.AI, n8n Cloud
- Excellent inline documentation and architecture docs
- Header-based column references eliminate the most common maintenance failure

### 13. Data Integrity & Quality — CAUTION | Confidence: HIGH | Severity: 3
- **Destructive reformat** clears all rows then writes — data loss on write failure
- `parseInt()` NaN propagation in Seamless webhook validation
- AI parse results not validated for reasonable ranges
- Deduplication is well-implemented at both Apps Script and n8n layers
- Header-based column lookup provides schema drift detection with clear errors
- No n8n execution ID written to sheet for data lineage tracing

### 14. Code Quality & Architecture — PASS | Confidence: HIGH | Severity: 2
- Clean structure with section markers, consistent naming, JSDoc comments
- CONFIG centralized with lazy-loading Proxy pattern
- Per-step error isolation in scheduled runner
- Minor N+1 cell operations in `fillPocNumbers_` and `fillAddressLabelsFormulas_`
- Source URL extraction logic duplicated across two parse nodes in n8n

### 15. Regulatory Compliance — CAUTION | Confidence: MED | Severity: 3
- System processes CA residents (WCIRB is CA-specific) — CCPA applies
- No data subject access request (DSAR) mechanism
- No data retention policy — prospect data accumulates indefinitely
- LinkedIn scraping via Apify is a ToS risk
- Phone numbers collected via Seamless.AI trigger TCPA obligations for telemarketing use

### 16. Cybersecurity — CAUTION | Confidence: HIGH | Severity: 3
- **CRITICAL:** Auth token missing from Step 2 Apps Script trigger call — will fail at runtime
- **CRITICAL:** Webhook auth bypass when env var unset (fail-open logic)
- `USER_ENTERED` cellFormat allows formula injection from external API responses
- doPost auth failures not logged — no detection of brute-force attempts
- n8n execution logs may contain PII — review retention settings
- Credential storage is well-implemented (externalized, never in source)

## Cross-Cutting Themes

1. **Fail-open defaults:** Both the webhook auth check and the `USER_ENTERED` cell format default to permissive behavior. The system should fail closed by default.
2. **Destructive operations without safety nets:** The reformat function and delete-all function both destroy data without creating backups first.
3. **Single-vendor dependencies:** Perplexity (3 steps), Google Sheets (entire data layer), n8n Cloud (orchestration) — no fallback for any.
4. **Compliance gap for CA data:** The system is specifically designed for California (WCIRB) but lacks CCPA-required data subject rights infrastructure.
5. **Strong v2 foundation:** The rebuild addressed all major v1 failures. The issues found are incremental hardening, not fundamental architecture flaws.
