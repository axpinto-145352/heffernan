# Outreach Automation — Initial Proposal

**Prepared for:** Janine Berthold, Heffernan Insurance Brokers
**Prepared by:** Anthony Pinto, Veteran Vectors
**Date:** March 2026
**Status:** Draft for Review

---

## Background

Janine's team received a $29,000 proposal to build a custom web application that automates
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

## Why This Costs Less Than a Typical Build

Veteran Vectors has already built and deployed the WC Prospects Lead Generation System
for Heffernan. That existing engagement means significant infrastructure is already in place:

- **n8n Cloud** — Already provisioned and running Heffernan workflows. No new instance needed.
- **Perplexity API** — Already integrated and active. Additional usage shares the existing subscription, keeping incremental costs low.
- **Seamless.AI / Apollo** — Contact lookup integration already built and tested.
- **Slack alerting** — Error notification patterns already configured for Heffernan's workspace.
- **Google Workspace patterns** — Apps Script orchestration, sheet templates, and deployment patterns are proven and reusable.

A net-new vendor would need to stand up all of this from scratch. We're extending
an existing, working system — which is why we can deliver at $5,000 instead of $29,000.

---

## Cost Comparison

| | Original Proposal | Our Approach |
|-|-------------------|--------------|
| **Upfront build** | $29,000 | $5,000 (flat fee) |
| **Monthly tools** | Hosting + DB + AI + retainer (~$500-1000/mo) | ~$10-85/mo incremental (Perplexity + Apollo + AI API) |
| **Monthly maintenance** | Included in retainer above | $500/mo (monitoring, updates, security, prompt tuning) |
| **First year total** | ~$35,000-45,000+ | ~$11,120-12,020 |
| **Time to launch** | 2-4 months | 1-2 weeks |
| **Ownership** | Vendor owns research engine | You own everything |
| **Maintenance** | Vendor dependency | Veteran Vectors — proactive monitoring, API updates, security patches |

---

## ROI Analysis

### Time Savings

The primary cost being eliminated is manual EA research and email drafting time.

| Metric | Current (Manual) | With Automation |
|--------|-----------------|-----------------|
| Research time per batch (50 prospects) | 4-6 hours | ~5 minutes (automated) |
| Email drafting per batch | 1-2 hours | ~5 minutes (automated) |
| Review & approval per batch | N/A (drafts don't exist yet) | 60-90 minutes |
| Outreach.io data entry per batch | 30-60 minutes | ~1 minute (automated) |
| **Total time per batch** | **5.5-8 hours** | **~2 hours** |
| **Time saved per batch** | — | **3.5-6 hours** |

### Dollar Value of Time Saved

Assuming the EA runs **2 batches per week** (conservative for active prospecting):

| Assumption | Value |
|------------|-------|
| EA fully-loaded hourly cost | $35-50/hr |
| Hours saved per batch | 4.5 hours (midpoint) |
| Batches per week | 2 |
| Hours saved per week | 9 hours |
| Hours saved per year (50 weeks) | **450 hours** |
| **Annual value of time saved** | **$15,750 - $22,500** |

### Total Cost of Ownership — 2-Year Comparison

| | Their Custom App | Our Build |
|-|-----------------|-----------|
| Year 1 upfront | $29,000 | $5,000 |
| Year 1 monthly tools | ~$6,000-12,000 | ~$120-1,020 |
| Year 1 maintenance | ~$3,000-6,000 | $6,000 ($500/mo) |
| **Year 1 total** | **$38,000-47,000** | **$11,120-12,020** |
| Year 2 monthly tools | ~$6,000-12,000 | ~$120-1,020 |
| Year 2 maintenance | ~$3,000-6,000 | $6,000 ($500/mo) |
| **Year 2 total** | **$9,000-18,000** | **$6,120-7,020** |
| **2-year total** | **$47,000-65,000** | **$17,240-19,040** |

At **$17-19K over two years vs. $47-65K**, you save 63-71% while getting the same
outcome — plus full ownership, faster launch, and a proven architecture.
Our approach pays for itself within the first month of time savings alone.

### Capacity Increase

Beyond time savings, the real ROI is **throughput**. The EA's freed-up hours can be
redirected to higher-value work:

| Metric | Current | With Automation |
|--------|---------|-----------------|
| Prospects researched per week | ~100 (2 batches x 50) | ~250-500 (same effort, more batches) |
| Personalized emails sent per week | ~100 | ~250-500 |
| EA hours available for other work | 0 | 9 hours/week |

At 2.5-5x outreach volume with no additional headcount, even a modest improvement in
reply rates compounds into significantly more pipeline.

### ROI Summary

| | Year 1 | Year 2 | 2-Year Total |
|-|--------|--------|--------------|
| **Our total cost** | $11,120-12,020 | $6,120-7,020 | $17,240-19,040 |
| **Time savings value** | $15,750-22,500 | $15,750-22,500 | $31,500-45,000 |
| **Net ROI** | +$3,730-10,480 | +$9,730-15,380 | +$14,260-25,960 |
| **Hours returned to the team** | 450 hours | 450 hours | **900 hours** |

The system pays for itself in Year 1 and generates $10-15K in net value by Year 2.
Over two years, nearly **900 hours** of manual research and data entry time are
returned to the team — the equivalent of adding a half-time employee at zero headcount cost.

---

## Case Study: Heffernan WC Prospects Lead Generation System

We don't need to theorize about whether this architecture works. **It's already running
in production for Heffernan.**

### The System

In February 2026, we built the WC Prospects Lead Generation System for Heffernan Insurance
Brokers — a 6-step pipeline that takes raw WCIRB (Workers' Compensation Insurance Rating
Bureau) prospect data and transforms it into fully enriched, outreach-ready lead profiles
with mailing labels.

### Same Architecture

| Component | WC Lead Gen (Live) | Outreach System (Proposed) |
|-----------|-------------------|---------------------------|
| UI / Data Layer | Google Sheets | Google Sheets |
| Orchestration | Google Apps Script | Google Apps Script |
| AI Enrichment | n8n webhooks | n8n webhooks |
| Company Research | Perplexity API | Perplexity API |
| Contact Discovery | Seamless.AI API | Apollo or Seamless.AI API |
| Output | Google Docs (labels) | Outreach.io (sequences) |
| Error Monitoring | Slack alerts | Slack alerts |
| Prompt Management | Google Sheet "Prompts" tab | Google Sheet "Prompts" tab |

### What It Does Today

The WC system processes **88 prospect companies** per batch:

1. AI estimates employee count per company via Perplexity
2. Filters to ~7 qualified companies by WC premium threshold ($25K+)
3. AI researches revenue, domain, entity type, industry for each
4. Discovers 5 decision-maker contacts per company (ranked by seniority)
5. Scrapes LinkedIn profiles via Apify
6. Generates formatted mailing labels in Google Docs

**Processing time:** ~50-120 minutes for 88 companies, fully automated.
**Manual effort:** Click one button, review results.

### What This Proves

- The Google Sheets + Apps Script + n8n pattern **works at scale** for Heffernan
- The team already knows how to use it — same interface, same Slack alerts, same workflow
- n8n webhook sub-workflows are reliable, retryable, and maintainable
- Perplexity + Seamless.AI enrichment produces usable, accurate data
- The Prompts tab approach lets non-technical users tune AI behavior without touching code

The outreach system is essentially the same pipeline with a different output destination
(Outreach.io instead of Google Docs). The research, contact discovery, and orchestration
patterns are identical.

---

## Head-to-Head: Their Build vs. Ours

| Factor | $29K Custom App | Veteran Vectors Build |
|--------|----------------|----------------------|
| **Architecture** | Custom web app, database, auth, roles | Google Sheets + Apps Script + n8n (proven in production) |
| **IP ownership** | Vendor retains research engine | Client owns 100% of code, prompts, workflows |
| **Time to first batch** | 2-4 months (build + test + deploy) | 1-2 weeks |
| **Monthly operating cost** | $500-1,000+ (hosting, DB, AI, retainer) | $510-585 (API usage + maintenance retainer) |
| **Maintenance model** | Vendor dependency for all changes | $500/mo retainer — monitoring, API updates, security, prompt tuning |
| **Proven at Heffernan?** | No — net new, untested | Yes — same architecture already live for WC system |
| **Scalability ceiling** | High (it's a real app) | Sufficient (~500 prospects/week before needing upgrade) |
| **Risk if vendor disappears** | System becomes unmaintainable (research engine is proprietary) | Zero impact — everything is self-contained |
| **Switching cost** | High — locked into vendor's platform | Low — standard tools, exportable data, no lock-in |
| **User training** | New UI to learn | Same Google Sheets interface team already uses |
| **Prompt iteration speed** | Requires vendor to modify research engine | Edit a cell in the Prompts tab, run next batch |

---

## Our Recommendation

**Phase 1 — Validate the workflow (Week 1) — Included**
Run the process manually with ChatGPT and 10-20 real prospects. Don't automate anything yet.
Confirm that AI-researched, AI-drafted emails actually get responses. This costs $0.

**Phase 2 — Build the automation (Weeks 2-3) — $5,000 flat fee**
If Phase 1 produces results, we build the full pipeline described above. Same architecture
as the WC Lead Gen system — proven, running, already familiar to the Heffernan team.
Includes all 8 deliverables listed above, documentation, and team walkthrough.

**Phase 3 — Ongoing maintenance — $500/month**
Production systems require ongoing care. The monthly retainer covers:
- **Monitoring & uptime** — Proactive workflow health checks, error triage, Slack alert review
- **API & integration updates** — Outreach.io, Perplexity, Apollo/Seamless.AI API changes, version upgrades, breaking change remediation
- **Security & access management** — OAuth token rotation, credential hygiene, permissions audits
- **Prompt optimization** — Tuning research and email prompts based on real response data to continuously improve output quality
- **Priority support** — Direct access for troubleshooting, questions, and ad hoc adjustments

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
