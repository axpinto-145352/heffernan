# Outreach Automation — Initial Proposal

**Prepared for:** Nadia Messiah, Director of Innovation/Development, Heffernan Insurance Brokers
**Prepared by:** Anthony Pinto, Veteran Vectors
**Date:** March 2026
**Status:** Draft for Review

---

## Background

Nadia's team received a $29,000 proposal to build a custom web application that automates
prospect research and personalized email outreach. After reviewing that proposal, we've
identified several concerns and are presenting an alternative approach that delivers the
same outcome at a fraction of the cost, using tools Heffernan already has access to.

---

## Concerns with the Original Proposal

**1. You wouldn't own the most important part.**
The vendor's proposal explicitly states that the AI Research Engine — the core value of the
system — remains the vendor's property. You'd pay $29K for a shell around technology
you can't control, modify, or take with you.

**2. It's built for a company, not a team.**
The architecture includes multi-user roles, team isolation, and admin tooling designed for
a 50-person sales org. Your team has 5 users. That's $29K in infrastructure you won't use.

**3. Ongoing costs stack up.**
Beyond the $29K, there are monthly hosting, database, AI API pass-throughs, and a maintenance
retainer. The total first-year cost is likely $35-45K+.

**4. Time to value is months, not days.**
Custom software takes 2-4 months to build, test, and deploy. The alternative we propose
can be operational in 1-2 weeks.

---

## What We Propose Instead

We build the same workflow — CSV upload, AI research, personalized drafts, human review,
Outreach.io push — using the **exact same architecture** that already powers Heffernan's
WC Prospects Lead Generation System.

### The Stack

| Layer | Tool | Role |
|-------|------|------|
| **Interface** | Google Sheets | Upload CSVs, review drafts, approve emails |
| **Orchestration** | Google Apps Script | Scheduling, validation, Outreach.io API calls |
| **AI Engine** | n8n (webhooks) | Company research, contact lookup, email drafting |
| **Research** | Perplexity API | Company intel, news, pain points |
| **Contacts** | Apollo.io or Seamless.AI | Decision-maker names, emails, phones |
| **Drafting** | Claude or GPT API | Personalized email copy |
| **Delivery** | Outreach.io API | Push approved emails into sequences |
| **Monitoring** | Slack | Error alerts, batch completion summaries |

### The Workflow

```
EA pastes CSV  →  AI researches companies  →  AI finds contacts
     │                                              │
     │              (all automated, ~5 min)         │
     ▼                                              ▼
AI drafts personalized emails  →  EA reviews in Google Sheets
     │                                              │
     │              (~60-90 min for 50 prospects)   │
     ▼                                              ▼
EA clicks "Approve"  →  System pushes to Outreach.io sequences
```

### What the EA's Day Looks Like

| Before | After |
|--------|-------|
| Open LinkedIn Sales Nav | Paste CSV into Google Sheet |
| Research each company manually (4-6 hrs) | Click "Run Batch" — wait 5 minutes |
| Draft each email from scratch | Review AI drafts, edit as needed (~90 min) |
| Copy-paste into Outreach one by one | Click "Push to Outreach" — done |
| **Total: 5-7 hours** | **Total: ~2 hours** |

---

## What We Deliver

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | **Google Sheet Workbook** | Pre-built template with Upload, Enriched, Drafts, Approved, Sent, Prompts, and Config tabs. Includes data validation, conditional formatting, and status tracking. |
| 2 | **Apps Script Orchestrator** | Custom menus: "Import Batch," "Run Research," "Push to Outreach." Handles validation, deduplication, webhook calls, and Outreach.io API integration. |
| 3 | **n8n: Company Research Workflow** | AI-powered company research via Perplexity. Returns industry, recent news, pain points, and growth signals. |
| 4 | **n8n: Contact Lookup Workflow** | Decision-maker discovery via Apollo or Seamless.AI. Returns name, title, email, phone, LinkedIn URL. |
| 5 | **n8n: Email Drafting Workflow** | Personalized email generation using Claude or GPT. Uses company research + contact info + configurable templates. |
| 6 | **n8n: Error Notifier** | Slack alerts on any workflow failure (reuses existing Heffernan pattern). |
| 7 | **Prompt Library** | Tuned AI prompts for research and email drafting, editable directly in the Google Sheet. |
| 8 | **Documentation** | Setup guide, prompt editing guide, troubleshooting runbook. |

---

## What You Own

**Everything.** Every line of code, every prompt, every workflow. No proprietary black boxes.
If you want to switch vendors, modify the system, or bring it in-house — you can.

---

## Cost Comparison

| | Original Proposal | Our Approach |
|-|-------------------|--------------|
| **Upfront** | $29,000 | 20-30 hours of development |
| **Monthly tools** | Hosting + DB + AI + retainer (~$500-1000/mo) | ~$10-85/mo incremental (Perplexity + Apollo + AI API) |
| **First year total** | ~$35,000-45,000+ | Dev hours + ~$120-1,020 in tools |
| **Time to launch** | 2-4 months | 1-2 weeks |
| **Ownership** | Vendor owns research engine | You own everything |
| **Maintenance** | Vendor dependency | Your team edits prompts & templates directly |

---

## Our Recommendation

**Phase 1 — Validate the workflow (Week 1)**
Run the process manually with ChatGPT and 10-20 real prospects. Don't automate anything yet.
Confirm that AI-researched, AI-drafted emails actually get responses. This costs $0.

**Phase 2 — Build the automation (Weeks 2-3)**
If Phase 1 produces results, we build the full pipeline described above. Same architecture
as the WC Lead Gen system — proven, running, already familiar to the Heffernan team.

**Phase 3 — Iterate on prompts (Ongoing)**
The quality of the output depends on the prompts. We tune research prompts and email
templates based on real response data. This is where the real value compounds — and it's
something Nadia's team can do themselves by editing a Google Sheet cell.

---

## Next Steps

1. Review this proposal
2. If aligned, provide a sample CSV of 10-20 real prospects for Phase 1 testing
3. Confirm Outreach.io API access (OAuth2 credentials or admin contact)
4. We run Phase 1, share results, and go from there

---

*This proposal is based on the same Google Sheets + Apps Script + n8n architecture currently
powering the Heffernan WC Prospects Lead Generation System (Workflow ID: D0tSzFV5AZh0qgcZ).
The patterns, error handling, and monitoring are proven and in production.*
