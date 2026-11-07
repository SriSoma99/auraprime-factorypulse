---
name: fp-docs-sync
description: Use whenever a AuraPrime FactoryPulse v2 design decision changes, to update the numbered design documents in doc/ consistently, keep IDs valid, and run the cross-check before finishing.
---

# AuraPrime FactoryPulse v2 Documentation Sync

The design set lives in `doc/` as TOGAF-aligned Markdown documents. A decision is not finished until every affected document says the same thing.

## Document map (all in doc/; the master copy is the document map in 04)
- REQ `req/00-requirements.md`: scope, requirement IDs, NFRs, regulatory, IP, risks, open questions (`00-requirements.md` at the doc root is only an index of it)
- 01 `01-business.md`: business architecture
- 02 `02-ui.md`: UI design
- 03 `03-technical-design.md`: technical design
- 04 `04-architecture-definition.md`: architecture definition document (principles, ADR log, gap analysis, work packages, governance, risks, open issues)
- 05 `05-data-architecture.md`: data architecture
- 06 `06-application-architecture.md`: application architecture (APP IDs, INT IDs, deployable units)
- 07 `07-technology-architecture.md`: technology architecture (standards, environments, spikes TO IDs)
- 08 `08-reference-mapping.md`: reference architecture mapping
- 09 `09-messaging.md`: messaging architecture
- 10 `10-configuration.md`: configuration architecture
- 11 `11-project-plan.md`: project plan and delivery tracking (estimates, budget ledger, timeline, feature tracker, time log, conflict log)
- `adr/`: one file per ADR when the decision needs more than a row in the 04 log; the 04 log row links to it
- `runbooks/`: operational runbooks (RB IDs)

## ID rules
- APP-01..26, INT-01..20, DU-01..18, ADR-001.. (continue the numbering, never reuse), requirement groups ING, DET, TRU, LIM, RAG, AGT, POL, LRN, FBK, OBS, MCP, API, SIM, UI, REG, IP, NFR-R/P/S/C/M, risks R, RK, BRK, open items OI, OQ, DO, AO, TO, UO; delivery tracking EST, BL, CON (defined in 11).
- Never cite an ID that does not exist. New IDs are added where they are defined first, then referenced.

## Procedure
1. State the decision in one sentence and list the documents it affects.
2. Update the source of truth first (requirements or ADR log), then the dependent documents in order: data, application, technology, technical design, UI, business.
3. Search for stale terms from superseded decisions (for example an old broker name) and fix or annotate every hit.
4. Add or update the ADR: context, decision, alternatives, consequences, status (Proposed or Accepted), date.
5. Update open items: close resolved ones, add new ones with an owner.
6. Keep each document's header (status, related documents) accurate.
7. Run the cross-check:
   - every APP and ADR ID cited exists where defined;
   - every requirement and NFR ID cited exists in the requirements document;
   - no stale terms remain;
   - diagrams still match the text.
8. Report the changed files with a short change summary. Do not recap the steps.

## Style
- Plain, direct sentences. Tables for catalogs and matrices. Mermaid for diagrams.
- Mark unverified external facts with the word verify.
- Regulatory text is a working interpretation; keep the note that counsel must review.
- Keep working scratch files out of `doc/` unless the owner says otherwise.
