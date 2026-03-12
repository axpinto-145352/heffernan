# What They're Actually Asking For

## The Request (Plain English)

Nadia (Tim's mom) received a proposal from a developer/agency to build a **custom web application** that automates personalized outreach for insurance producers. The ask boils down to:

1. Upload a CSV of prospects
2. AI researches each prospect and their company
3. AI drafts personalized outreach emails
4. Human reviews and approves the drafts
5. Approved emails get pushed into **Outreach.io** (their CRM/sequencing tool)

**Goal:** Cut the EA (Executive Assistant) research time from 4-6 hours per batch down to ~90 minutes.

---

## What the Original Proposal Builds

The vendor's $29K proposal builds a **full custom web application** with:

- User authentication and role-based access
- Team data isolation
- Campaign management dashboard
- Admin tools
- Database backend
- Custom "Research Engine" (AI-powered company/prospect research)
- Outreach.io integration layer

### The Catch

> The Research Engine is Provider-owned and not delivered to Client.

**They keep the most valuable piece.** Nadia pays $29K for the shell, but the AI research logic stays proprietary to the vendor. Plus ongoing costs for hosting, database, API calls, and a maintenance retainer.

---

## What Nadia Already Has Access To

| Tool | What It Does | Already Paying? |
|------|-------------|-----------------|
| **Outreach.io** | Email sequencing, CRM, prospect management | Yes |
| **LinkedIn Sales Navigator** | Prospect research, company intel, lead lists | Yes |
| **ChatGPT** | AI research, email drafting | Yes ($20/mo) |
| **Apollo.io** | Contact database, email finder | Likely |
| **Clay** | Waterfall enrichment, AI research, integrations | Available |

These tools already cover 90%+ of the proposed workflow natively.

---

## The Real Problem Being Solved

This is NOT a software problem. It's a **workflow problem**:

> "How do I scale personalized outreach to ideal prospects without spending 4-6 hours per batch on manual research?"

The answer is process automation using existing tools — not a custom application.

---

## Why the $29K Build Is Wrong for This

| Issue | Detail |
|-------|--------|
| **Overkill architecture** | Roles, teams, admin tools — for 5 users |
| **Vendor lock-in** | Research engine is proprietary; you don't own it |
| **Ongoing costs** | Hosting + DB + AI API + maintenance retainer on top of $29K |
| **Risk** | Custom software has bugs, needs updates, breaks when APIs change |
| **Time to value** | Months to build vs. days to set up with existing tools |
| **No competitive moat** | The "AI research" is just API calls to the same LLMs everyone has access to |

---

## What We Recommend Instead

Build the same workflow using the tools Nadia already has (or can subscribe to for ~$200-400/month), orchestrated with the same n8n + Apps Script pattern we already run for Heffernan's WC lead gen system.

See: `02-BUILD-RECOMMENDATION.md`
