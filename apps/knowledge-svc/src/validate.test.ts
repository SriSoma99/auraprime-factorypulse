// Upload quality gate (RAG-12, ADR-041): junk is refused with every reason, template documents pass.
import { describe, it, expect } from "vitest";
import { configSchema } from "@fp/config";
import { acmeLine1Samples } from "@fp/synthetic-data";
import { renderTemplate, sections, validateUpload, type UploadInput } from "./validate.js";

const cfg = configSchema.parse({});
const rules = cfg.knowledge.upload;
const templates = cfg.knowledge.templates;
const assets = new Set(["as-x-press"]);
const sample = acmeLine1Samples()[1]!;
const good: UploadInput = { title: sample.title, docType: sample.docType, assetId: sample.assetId, version: sample.version, effectiveFrom: sample.effectiveFrom, content: sample.content };
const codes = (input: UploadInput) => validateUpload(input, rules, templates, assets).problems.map(p => `${p.field}:${p.code}`);

describe("validateUpload", () => {
  it("accepts every Acme line 1 sample document", () => {
    for (const s of acmeLine1Samples()) {
      const r = validateUpload({ ...s }, rules, templates, assets);
      expect(r.problems, s.file).toEqual([]);
      expect(r.value?.title).toBe(s.title);
    }
  });

  it("refuses the owner's example: title 'sss' and description 'ss'", () => {
    expect(codes({ ...good, title: "sss", content: "ss" })).toEqual(expect.arrayContaining([
      "title:too_short", "title:too_few_words", "content:too_few_words", "content:missing_section",
    ]));
  });

  it("refuses repeated characters and repetitive text", () => {
    expect(codes({ ...good, title: "Pump ssssssss manual" })).toContain("title:repeated_characters");
    const filler = Array.from({ length: 80 }, () => "pump valve").join(" ");
    expect(codes({ ...good, content: filler })).toContain("content:repetitive");
  });

  it("refuses symbol or number noise", () => {
    const noise = Array.from({ length: 80 }, (_, i) => `${i}#${i * 7}%`).join(" ");
    expect(codes({ ...good, content: noise })).toContain("content:not_text");
  });

  it("names each missing or empty template section", () => {
    const withoutVerification = sample.content.replace(/## Verification[\s\S]*$/, "");
    expect(codes({ ...good, content: withoutVerification })).toEqual(["content:missing_section"]);
    const emptySafety = sample.content.replace(/## Safety\n[\s\S]*?## Procedure/, "## Safety\n\nTBD\n\n## Procedure");
    expect(codes({ ...good, content: emptySafety })).toEqual(["content:empty_section"]);
  });

  it("checks metadata: type, registered equipment, version and a real date", () => {
    expect(codes({ ...good, docType: "poem" })).toContain("docType:unknown_type");
    expect(codes({ ...good, assetId: "as-wc4-coolant" })).toContain("assetId:unknown_asset");
    expect(codes({ ...good, version: "latest" })).toContain("version:invalid_version");
    expect(codes({ ...good, effectiveFrom: "2026-02-30" })).toContain("effectiveFrom:invalid_date");
    expect(codes({ ...good, title: 42 })).toContain("title:too_short");
  });

  it("refuses a body over the size limit", () => {
    const big = `${sample.content}\n${"word ".repeat(rules.max_bytes / 5)}`;
    expect(codes({ ...good, content: big })).toContain("content:too_large");
  });

  it("does not count template hints as the person's text", () => {
    const skeleton = renderTemplate("sop", templates)!;
    expect(codes({ ...good, content: skeleton })).toEqual(expect.arrayContaining(["content:too_few_words", "content:empty_section"]));
  });
});

describe("renderTemplate and sections", () => {
  it("renders every configured heading so a filled template validates", () => {
    for (const [type, t] of Object.entries(templates)) {
      const md = renderTemplate(type, templates)!;
      for (const s of t.sections) expect(md).toContain(`## ${s.heading}`);
    }
    expect(renderTemplate("unknown", templates)).toBeNull();
  });

  it("matches headings regardless of case and spacing", () => {
    const s = sections("intro\n## Corrective  ACTION\nfix it\n### Safety ##\nstay safe");
    expect([...s.keys()]).toEqual(["corrective action", "safety"]);
    expect(s.get("safety")!.trim()).toBe("stay safe");
  });
});
