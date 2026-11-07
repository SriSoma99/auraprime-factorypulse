import { describe, expect, it } from "vitest";
import { countByStatus, deriveKnowledgeState, documentActions, filterDocuments, problemsByField, samplesFor } from "./derive";
import type { KnowledgeDocument } from "./types";

const doc = (over: Partial<KnowledgeDocument>): KnowledgeDocument => ({
  id: "DOC-1", title: "Return-line filter change", section: "Standard operating procedure", version: "v1.2", status: "approved", docType: "sop",
  assetId: "as-x-press", assetName: "Acme press hydraulics", chunkCount: 3, effectiveDate: "2026-03-01", uploadedBy: "Acme shift lead",
  uploadedById: "u-acme-lead", uploadedAt: "2026-11-06T10:00:00Z", reviewedBy: null, withdrawnReason: null, classification: "internal", hash: "ab", cited: false, ...over,
});
const docs = [doc({ id: "A", status: "pending_review" }), doc({ id: "B" }), doc({ id: "C", status: "withdrawn" }), doc({ id: "D" })];
const me = { principalId: "u-acme-reliability", canUse: true, requireSecondReviewer: true };

describe("deriveKnowledgeState", () => {
  it("covers loading, error, empty and ready", () => {
    expect(deriveKnowledgeState(undefined, true, false)).toBe("loading");
    expect(deriveKnowledgeState(undefined, false, true)).toBe("error");
    expect(deriveKnowledgeState([], false, false)).toBe("empty");
    expect(deriveKnowledgeState(docs, false, false)).toBe("ready");
  });
});

describe("filterDocuments and countByStatus", () => {
  it("filters by lifecycle state and counts each", () => {
    expect(filterDocuments(docs, "all").map(d => d.id)).toEqual(["A", "B", "C", "D"]);
    expect(filterDocuments(docs, "approved").map(d => d.id)).toEqual(["B", "D"]);
    expect(countByStatus(docs)).toEqual({ all: 4, pending_review: 1, approved: 2, withdrawn: 1 });
  });
});

describe("documentActions", () => {
  it("lets a second person approve a pending document", () => {
    expect(documentActions(doc({ status: "pending_review" }), me).approve).toEqual({ allowed: true, reason: null });
  });
  it("blocks the uploader from approving their own document", () => {
    const a = documentActions(doc({ status: "pending_review" }), { ...me, principalId: "u-acme-lead" }).approve!;
    expect(a.allowed).toBe(false);
    expect(a.reason).toMatch(/another person/);
  });
  it("allows the uploader when the second-reviewer rule is off", () => {
    expect(documentActions(doc({ status: "pending_review" }), { ...me, principalId: "u-acme-lead", requireSecondReviewer: false }).approve!.allowed).toBe(true);
  });
  it("offers no approval once approved, and nothing at all once withdrawn", () => {
    expect(documentActions(doc({}), me).approve).toBeNull();
    expect(documentActions(doc({ status: "withdrawn" }), me)).toEqual({ approve: null, remove: null });
  });
  it("deletes an uncited document and withdraws a cited one", () => {
    expect(documentActions(doc({}), me).remove!.label).toBe("Delete");
    expect(documentActions(doc({ cited: true }), me).remove!.label).toBe("Withdraw");
  });
  it("disables every action for a view-only role", () => {
    const a = documentActions(doc({ status: "pending_review" }), { ...me, canUse: false });
    expect(a.approve!.allowed).toBe(false);
    expect(a.remove!.allowed).toBe(false);
  });
});

describe("problemsByField", () => {
  it("groups the API's upload problems by field", () => {
    expect(problemsByField([
      { field: "title", code: "too_short", message: "Title needs at least 8 characters." },
      { field: "content", code: "too_few_words", message: "Too few words." },
      { field: "content", code: "missing_section", message: "Add Safety." },
    ])).toEqual({ title: ["Title needs at least 8 characters."], content: ["Too few words.", "Add Safety."] });
    expect(problemsByField(undefined)).toEqual({});
  });
});

describe("samplesFor", () => {
  it("keeps only samples for the tenant's own equipment", () => {
    const samples = [{ assetId: "as-x-press", title: "a" }, { assetId: "as-other", title: "b" }];
    expect(samplesFor(samples, [{ assetId: "as-x-press" }]).map(s => s.title)).toEqual(["a"]);
    expect(samplesFor(samples, undefined)).toEqual([]);
  });
});
