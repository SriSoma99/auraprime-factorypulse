---
title: "ADR-031: Episodic case memory, gated lesson synthesis and an evaluation gate on learning"
status: accepted
edition: community
related:
  - ../req/00-requirements.md
  - ../03-technical-design.md
  - ../05-data-architecture.md
  - ../06-application-architecture.md
---

# ADR-031: Episodic case memory, gated lesson synthesis and an evaluation gate on learning

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-05 |
| Decided by | Owner |
| Adds | LRN-5, LRN-6, LRN-7; AC-H10 |
| Extends | APP-12 (Learning and Verification), APP-07 (Knowledge Service); 03 section 12; 05 section 4.5 |

## Context

The learning loop (LRN-1 to LRN-4) updates numbers from verified outcomes: priors, knowledge-graph weights and retrieval ranking. It does not keep past incidents as reusable cases, does not turn them into reusable written lessons, and does not check that a learning update actually improves results before it takes effect. These are the episodic-memory, feedback-synthesis and self-evaluation parts of a self-improving agent.

## Decision

1. **Episodic case memory (LRN-5).** Each verified closure (LRN-2) produces a structured case record: asset class, signals and their trust verdicts, ranked hypotheses, the discriminating check, the confirmed failure mode, the action and the outcome. Diagnosis retrieves similar verified cases (by asset class, signal pattern and failure mode) through APP-07 and presents them as cited evidence, never as a decision. The causal engine still ranks hypotheses (invariant: LLM narrates, causal engine decides).
2. **Gated lesson synthesis (LRN-6).** From a verified case, the model drafts a short lesson (what signalled it, what separated the hypotheses, what fixed it). The draft is labelled AI-generated, cites the case, and enters retrieval only after a person with the configured role approves it. Rejected drafts are kept for audit and never used. Approval and rejection are audited through APP-20.
3. **Evaluation gate on learning (LRN-7).** A batch of learning updates (priors, graph weights, ranking, new cases and lessons) is staged, replayed on the benchmark harness (SIM-4) and the golden set, and activated only if the configured metrics do not regress beyond their tolerance. Otherwise the batch is rejected and stays inactive; any active batch can be rolled back (LRN-4).
4. **Not on the alert path.** None of this runs in Tier 0 (invariant 6). Learning is asynchronous in Tier 1.
5. **Configuration.** Similarity thresholds, the number of cases retrieved, the lesson approver role, metric tolerances and batch size are configuration keys, not code.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Let the agent write lessons into its own prompt memory automatically | Unreviewed self-modification; poisoning risk; conflicts with "LLM narrates, causal engine decides" |
| Keep numeric learning only | No reusable case knowledge; weaker explanations for technicians |
| Activate learning updates immediately with rollback only | A bad update affects live diagnoses before anyone notices |

## Consequences

- New entities CaseRecord, Lesson and LearningBatch (05 section 4.5); APP-12 and APP-07 gain responsibilities (06).
- Lessons add a human review step; the review queue is a new screen (later wireframe and UI work).
- Benchmark replay costs compute time per batch; batches are sized by configuration.
- Edition: case memory, lessons and the evaluation gate are Full (with LRN-3 and LRN-4); LRN-1 stays Community.
