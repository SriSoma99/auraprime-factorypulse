// Upload quality gate for the knowledge base (RAG-12, ADR-041). Runs before the injection scan (RAG-10) and before indexing,
// so meaningless text ("sss") and documents that do not follow a template never reach the corpus. Deterministic, no model calls.
import type { Config } from "@fp/config";

export type UploadRules = Config["knowledge"]["upload"];
export type DocTemplates = Config["knowledge"]["templates"];

export interface UploadInput {
  title?: unknown;
  docType?: unknown;
  assetId?: unknown;
  version?: unknown;
  effectiveFrom?: unknown;
  content?: unknown;
  classification?: unknown;
}

export type UploadField = "title" | "docType" | "assetId" | "version" | "effectiveFrom" | "content" | "classification";
export interface UploadProblem { field: UploadField; code: string; message: string }

export interface ValidUpload { title: string; docType: string; assetId: string; version: string; effectiveFrom: string; content: string }

const WORD = /[\p{L}\p{N}]+/gu;
const LETTER = /\p{L}/gu;
const HEADING = /^#{1,3}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm;
/** A version label such as v1, v2.3 or 1.0.4. */
const VERSION = /^v?\d{1,4}(\.\d{1,4}){0,2}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const words = (s: string): string[] => s.match(WORD) ?? [];
const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function repeatedRun(text: string, maxRun: number): string | null {
  const re = new RegExp(`(\\p{L})\\1{${maxRun},}`, "u");
  const m = re.exec(text);
  return m ? m[0] : null;
}

/** Splits Markdown into its headed sections; text before the first heading is ignored. */
export function sections(content: string): Map<string, string> {
  const out = new Map<string, string>();
  const hits = [...content.matchAll(HEADING)];
  hits.forEach((h, i) => {
    const start = h.index! + h[0].length;
    const end = i + 1 < hits.length ? hits[i + 1]!.index! : content.length;
    out.set(norm(h[1]!), content.slice(start, end));
  });
  return out;
}

/** The Markdown skeleton a person fills in for a document type. */
export function renderTemplate(docType: string, templates: DocTemplates): string | null {
  const t = templates[docType];
  if (!t) return null;
  return [`# ${t.label}: <title>`, "", ...t.sections.flatMap(s => [`## ${s.heading}`, `<!-- ${s.hint} -->`, ""])].join("\n");
}

/** Every problem with the upload, so the person can fix them all at once. An empty list means the upload is acceptable. */
export function validateUpload(input: UploadInput, rules: UploadRules, templates: DocTemplates, knownAssets: ReadonlySet<string>): { problems: UploadProblem[]; value: ValidUpload | null } {
  const problems: UploadProblem[] = [];
  const add = (field: UploadField, code: string, message: string) => problems.push({ field, code, message });

  const title = str(input.title);
  if (title.length < rules.title_min_chars) add("title", "too_short", `Title needs at least ${rules.title_min_chars} characters.`);
  else if (title.length > rules.title_max_chars) add("title", "too_long", `Title must be at most ${rules.title_max_chars} characters.`);
  if (title && words(title).filter(w => w.length > 1).length < rules.title_min_words) add("title", "too_few_words", `Title needs at least ${rules.title_min_words} words that describe the document.`);
  const titleRun = repeatedRun(title, rules.max_repeat_run);
  if (titleRun) add("title", "repeated_characters", `Title repeats one character too often ("${titleRun}").`);

  const docType = str(input.docType);
  const template = templates[docType];
  if (!template) add("docType", "unknown_type", `Choose a document type: ${Object.keys(templates).join(", ")}.`);

  const assetId = str(input.assetId);
  if (!knownAssets.has(assetId)) add("assetId", "unknown_asset", "Choose equipment registered for your plant.");

  const version = str(input.version);
  if (!VERSION.test(version)) add("version", "invalid_version", "Version must look like v1, v2.1 or 1.0.3.");

  const effectiveFrom = str(input.effectiveFrom);
  if (!DATE.test(effectiveFrom) || Number.isNaN(Date.parse(`${effectiveFrom}T00:00:00Z`)) || new Date(`${effectiveFrom}T00:00:00Z`).toISOString().slice(0, 10) !== effectiveFrom) {
    add("effectiveFrom", "invalid_date", "Effective date must be a real date in the form YYYY-MM-DD.");
  }

  const content = typeof input.content === "string" ? input.content : "";
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > rules.max_bytes) add("content", "too_large", `Document is ${bytes} bytes; the limit is ${rules.max_bytes}.`);
  // Template hints are HTML comments; they do not count as the person's text.
  const prose = content.replace(/<!--[\s\S]*?-->/g, "");
  const all = words(prose);
  if (all.length < rules.content_min_words) add("content", "too_few_words", `Document needs at least ${rules.content_min_words} words; it has ${all.length}.`);
  else {
    const distinct = new Set(all.map(w => w.toLowerCase())).size / all.length;
    if (distinct < rules.min_distinct_word_ratio) add("content", "repetitive", "Document repeats the same few words; paste the real text.");
  }
  const visible = prose.replace(/\s+/g, "").length;
  const letters = (prose.match(LETTER) ?? []).length;
  if (visible > 0 && letters / visible < rules.min_letter_ratio) add("content", "not_text", "Document is mostly symbols or numbers rather than written text.");
  const contentRun = repeatedRun(prose, rules.max_repeat_run);
  if (contentRun) add("content", "repeated_characters", `Document repeats one character too often ("${contentRun.slice(0, 12)}").`);

  if (template) {
    const found = sections(content);
    for (const s of template.sections) {
      const body = found.get(norm(s.heading));
      if (body === undefined) add("content", "missing_section", `Add the section "## ${s.heading}" (${template.label} template).`);
      else if (words(body.replace(/<!--[\s\S]*?-->/g, "")).length < rules.section_min_words) add("content", "empty_section", `Section "${s.heading}" needs at least ${rules.section_min_words} words.`);
    }
  }

  return { problems, value: problems.length ? null : { title, docType, assetId, version, effectiveFrom, content } };
}
