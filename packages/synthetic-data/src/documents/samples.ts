// Sample knowledge documents for Acme line 1 (tenant t-acme), written to the RAG-12 templates (ADR-041).
// Synthetic and labelled (ADR-019). Server-side only: the files are read from disk.
import { readFileSync } from "node:fs";

export interface SampleDocument {
  file: string;
  title: string;
  docType: string;
  assetId: string;
  version: string;
  effectiveFrom: string;
  content: string;
}

const meta: Omit<SampleDocument, "content">[] = [
  { file: "equipment-manual-press-hydraulics.md", title: "Acme press hydraulic unit manual", docType: "equipment_manual", assetId: "as-x-press", version: "v1.0", effectiveFrom: "2026-01-15" },
  { file: "sop-return-filter-change.md", title: "Return-line filter change on the Acme press", docType: "sop", assetId: "as-x-press", version: "v1.2", effectiveFrom: "2026-03-01" },
  { file: "troubleshooting-low-clamp-pressure.md", title: "Low clamp pressure on the Acme press", docType: "troubleshooting_guide", assetId: "as-x-press", version: "v1.0", effectiveFrom: "2026-04-10" },
];

export function acmeLine1Samples(): SampleDocument[] {
  return meta.map(m => ({ ...m, content: readFileSync(new URL(`./acme-line-1/${m.file}`, import.meta.url), "utf8") }));
}
