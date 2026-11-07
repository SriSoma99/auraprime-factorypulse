---
title: "ADR-041: Template-checked document uploads with second-person review, delete and withdraw"
status: accepted
edition: community
related:
  - ../04-architecture-definition.md
  - ../req/00-requirements.md
  - ../02-ui.md
  - ../10-configuration.md
  - ADR-040-role-based-screen-access.md
---

# ADR-041: Template-checked document uploads with second-person review, delete and withdraw

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-06 |
| Decided by | Owner (2026-11-05: streamlined document ingestion with sample documents for Acme line 1; delete and manage junk uploads; "can you allow to ingest something meaningless, for example I typed sss, description I typed ss"; "use a template or something that aligns with the tool format"; 2026-11-06: close the remaining open issues) |
| Implements | RAG-10 (approval before retrieval); adds RAG-12, RAG-13 |
| Keeps | RAG-5, RAG-8, RAG-11; invariant 3 (audit writer), invariant 4 (tenant isolation) |
| Components | APP-07 (knowledge service), the UI API (`/v1/knowledge/*`), W07 |

## Context

W07 accepted any non-empty title and text: "sss" and "ss" were indexed. The app showed every upload as approved although the API stored it unverified, invented a success when the call failed, listed hardcoded documents attributed to real manufacturers, and had no way to remove a document. The upload had no link to equipment, no document type and no version check.

## Decision

1. **Templates.** `knowledge.templates` defines document types (equipment manual, standard operating procedure, troubleshooting guide) with required Markdown section headings and a hint for each. The app inserts the skeleton; hints are HTML comments and do not count as text.
2. **Quality gate before indexing (RAG-12).** A deterministic check returns every problem at once, field by field: title length and words, a known type, equipment registered to the caller's tenant, a version label, a real effective date, size limit, minimum words, distinct-word and letter ratios, repeated characters, and each required section present with text. Thresholds are `knowledge.upload.*`. Then the injection scan (RAG-10). Refused uploads store nothing. The same text twice is refused.
3. **Second-person review (RAG-10).** An upload is indexed as `pending_review` and never retrieved. A different person with `use` on knowledge approves it (`knowledge.upload.require_second_reviewer`); API keys and agent tokens cannot.
4. **Delete or withdraw (RAG-13).** A document no answer, incident or work order step has cited is deleted with its chunks. A cited one is withdrawn: kept for the provenance ledger (RAG-8), never retrieved again. A reason is required. Upload, approval, deletion and withdrawal are written through `gov.append_audit`.
5. **Schema.** Migration 0014 adds status, type, equipment, content hash, uploader, reviewer and withdrawal columns to `know.citation`; `verified` always equals `status = 'approved'`.
6. **Samples.** Three synthetic documents for Acme line 1 (equipment `as-x-press`) follow the templates; the local mock controls serve them (ADR-030) and the app offers them only to the tenant that owns the equipment.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Length check only | "ssssssss" or repeated filler would still pass, and documents would not follow a common structure |
| Model-based quality scoring | Non-deterministic, costs tokens, and puts a model in the ingestion gate |
| Always hard delete | Breaks provenance: earlier answers would cite a document that no longer exists |
| Uploader approves their own document | One person could put unchecked text in front of the AI |

## Consequences

- W07 shows only API data; the fabricated client-side answers, documents and quarantine banner are gone, and the corpus no longer names real manufacturers.
- Retrieval defaults (`knowledge.retrieval.*`) and chunk size (`knowledge.chunk_chars`) are configuration.
- The answer model name in `/v1/knowledge/stats` and the Gemini client remain as they are until the owner decides ADR-038.
