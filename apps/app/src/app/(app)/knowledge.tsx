// W07 Knowledge (02 section 6.1; RAG-1, RAG-6, RAG-10, RAG-12, RAG-13; ADR-041): ask the approved corpus, upload a document
// that follows a template, have a second person approve it, and delete or withdraw documents that should not be there.
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useKnowledgeVM } from "@/features/knowledge/useKnowledgeVM";
import { STATUS_LABEL } from "@/features/knowledge/derive";
import type { Classification, DocumentFilter, UploadField } from "@/features/knowledge/types";
import { VIEW_ONLY_NOTE } from "@/features/shell/useAccess";
import { Badge } from "@/ui/domain";
import { Button, Card, Chip, Divider, Heading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { radius, space } from "@/ui/tokens";

const SAMPLE_QUESTIONS = [
  "How do I inspect and clean the weld transformer coolant strainer when flow FT-401 drops?",
  "What is the lockout procedure before opening the coolant loop?",
];
const FILTERS: DocumentFilter[] = ["all", "pending_review", "approved", "withdrawn"];
const CLASSIFICATIONS: { id: Classification; label: string }[] = [{ id: "public", label: "Public" }, { id: "internal", label: "Internal" }, { id: "restricted", label: "Restricted" }];

function Field({ label, value, onChange, placeholder, problems, multiline, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; problems?: string[]; multiline?: boolean; testID: string }) {
  const t = useTheme();
  const bad = !!problems?.length;
  return (
    <View style={{ gap: 4, flexGrow: 1, flexBasis: multiline ? "100%" : 200 }}>
      <T size="small" bold>{label}</T>
      <TextInput testID={testID} accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.muted} multiline={multiline}
        style={{ color: t.ink, fontSize: multiline ? 13 : 14, fontFamily: multiline ? "monospace" : undefined, minHeight: multiline ? 220 : 40, textAlignVertical: "top",
          backgroundColor: t.surfaceAlt, borderRadius: radius.sm, borderWidth: 1, borderColor: bad ? t.badLine : t.line, paddingHorizontal: space.md, paddingVertical: space.sm }} />
      {problems?.map(p => <T key={p} size="small" tone="bad" testID={`problem-${testID}`}>{p}</T>)}
    </View>
  );
}

function Choice({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const t = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={{ borderRadius: radius.sm, borderWidth: 1, borderColor: selected ? t.accent : t.line, backgroundColor: selected ? t.surface : t.surfaceAlt, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 40, justifyContent: "center" }}>
      <T size="small" bold={selected}>{label}</T>
    </Pressable>
  );
}

export default function KnowledgeScreen() {
  const vm = useKnowledgeVM();
  const t = useTheme();
  const [q, setQ] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const fieldProblems = (f: UploadField) => vm.problems[f];

  return (
    <Screen testID="w07-knowledge-base">
      <View style={{ gap: 2 }}>
        <Heading level={1}>Knowledge</Heading>
        <T tone="muted" size="small">Manuals, procedures and troubleshooting guides. Answers cite only approved documents (RAG-6, RAG-10).</T>
      </View>

      {vm.stats ? (
        <Card>
          <Row style={{ flexWrap: "wrap", gap: space.lg }}>
            <View><T size="small" tone="muted">Approved documents</T><T bold size="title" testID="stat-documents">{vm.stats.totalDocuments}</T></View>
            <View><T size="small" tone="muted">Indexed chunks</T><T bold size="title">{vm.stats.totalChunks}</T></View>
            <View><T size="small" tone="muted">Answers recorded</T><T bold size="title">{vm.stats.totalProvenanceQueries}</T></View>
            <View><T size="small" tone="muted">Answer model</T><Chip label={vm.stats.activeModel} tone="ai" /></View>
          </Row>
        </Card>
      ) : null}

      <Card>
        <Heading level={2}>Ask the knowledge base</Heading>
        <Row style={{ gap: space.sm, flexWrap: "wrap" }}>
          <View style={{ flexGrow: 1, flexBasis: 260 }}>
            <TextInput testID="ask-input" accessibilityLabel="Question" value={q} onChangeText={setQ} onSubmitEditing={() => vm.ask(q)} placeholder="Ask about a procedure, a part or a symptom"
              placeholderTextColor={t.muted} style={{ color: t.ink, fontSize: 14, minHeight: 44, backgroundColor: t.surfaceAlt, borderRadius: radius.sm, borderWidth: 1, borderColor: t.line, paddingHorizontal: space.md }} />
          </View>
          <Button label={vm.asking ? "Searching…" : "Ask"} onPress={() => vm.ask(q)} variant="primary" disabled={vm.asking || !q.trim()} testID="ask-submit" />
        </Row>
        <Row style={{ flexWrap: "wrap", gap: space.xs }}>
          {SAMPLE_QUESTIONS.map(s => <Choice key={s} label={s} selected={false} onPress={() => { setQ(s); vm.ask(s); }} testID={`ask-sample-${SAMPLE_QUESTIONS.indexOf(s)}`} />)}
        </Row>
        {vm.queryError ? <T tone="bad" size="small">{vm.queryError}</T> : null}
        {vm.answer ? (
          <View testID="ask-answer" style={{ gap: space.sm, backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: space.md }}>
            <Row style={{ flexWrap: "wrap", gap: space.xs }}>
              <Chip label={vm.answer.model} tone="ai" />
              <Chip label={vm.answer.citationsVerified ? "Citations verified" : "Insufficient evidence"} tone={vm.answer.citationsVerified ? "ok" : "warn"} />
              <Badge text={`${vm.answer.latencyMs} ms`} />
            </Row>
            <T>{vm.answer.answer}</T>
            {vm.hits.map(h => (
              <View key={h.chunkId} style={{ gap: 2, borderTopWidth: 1, borderColor: t.line, paddingTop: space.sm }}>
                <Row style={{ flexWrap: "wrap", gap: space.xs }}><Chip label={h.docId} mono /><T size="small" bold>{h.section}</T><Badge text={`similarity ${(h.similarity * 100).toFixed(0)}%`} /></Row>
                <T size="small">{h.text}</T>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Card testID="upload-card">
        <Row style={{ justifyContent: "space-between", flexWrap: "wrap", gap: space.sm }}>
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Heading level={2}>Add a document</Heading>
            <T size="small" tone="muted">Pick a type and the equipment, then fill in the template. Text that is too short, repetitive or missing a section is refused with the reasons.</T>
          </View>
          <Button label={showUpload ? "Close" : "Add a document"} onPress={() => setShowUpload(!showUpload)} disabled={!vm.canUse} testID="upload-toggle" />
        </Row>
        {!vm.canUse ? <T size="small" tone="muted" testID="view-only">{VIEW_ONLY_NOTE}</T> : null}

        {showUpload && vm.canUse ? (
          <View style={{ gap: space.md }}>
            {vm.samplesAvailable ? (
              <View style={{ gap: space.xs }} testID="samples">
                <T size="small" bold>Sample documents (local build)</T>
                {vm.samples.length ? (
                  <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                    {vm.samples.map((s, i) => <Choice key={s.title} label={s.title} selected={vm.draft.title === s.title} onPress={() => vm.loadSample(i)} testID={`sample-${i}`} />)}
                  </Row>
                ) : <T size="small" tone="muted" testID="samples-none">The sample documents are for Acme line 1. Sign in as the Acme shift lead to load them.</T>}
              </View>
            ) : null}

            <View style={{ gap: space.xs }}>
              <T size="small" bold>Document type</T>
              <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                {vm.templates.map(tp => <Choice key={tp.docType} label={tp.label} selected={vm.draft.docType === tp.docType} onPress={() => vm.setField("docType", tp.docType)} testID={`doctype-${tp.docType}`} />)}
              </Row>
              {fieldProblems("docType")?.map(p => <T key={p} size="small" tone="bad">{p}</T>)}
            </View>

            <View style={{ gap: space.xs }}>
              <T size="small" bold>Equipment</T>
              <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                {vm.equipment.map(e => <Choice key={e.assetId} label={`${e.name} · ${e.lineName}`} selected={vm.draft.assetId === e.assetId} onPress={() => vm.setField("assetId", e.assetId)} testID={`asset-${e.assetId}`} />)}
              </Row>
              {fieldProblems("assetId")?.map(p => <T key={p} size="small" tone="bad">{p}</T>)}
            </View>

            <View style={{ gap: space.xs }}>
              <T size="small" bold>Classification</T>
              <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                {CLASSIFICATIONS.map(c => <Choice key={c.id} label={c.label} selected={vm.draft.classification === c.id} onPress={() => vm.setField("classification", c.id)} testID={`class-${c.id}`} />)}
              </Row>
              <T size="small" tone="muted">Restricted text is answered only by the local template, never sent to a cloud model.</T>
            </View>

            <Row style={{ flexWrap: "wrap", gap: space.md, alignItems: "flex-start" }}>
              <Field label="Title" value={vm.draft.title} onChange={v => vm.setField("title", v)} placeholder="Return-line filter change on press 2" problems={fieldProblems("title")} testID="upload-title" />
              <Field label="Version" value={vm.draft.version} onChange={v => vm.setField("version", v)} placeholder="v1.0" problems={fieldProblems("version")} testID="upload-version" />
              <Field label="Effective from" value={vm.draft.effectiveFrom} onChange={v => vm.setField("effectiveFrom", v)} placeholder="YYYY-MM-DD" problems={fieldProblems("effectiveFrom")} testID="upload-effective" />
            </Row>

            {vm.chosenTemplate ? (
              <Row style={{ flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
                <T size="small" tone="muted">Required sections: {vm.chosenTemplate.sections.map(s => s.heading).join(", ")}.</T>
                <Button label="Insert template" onPress={vm.insertTemplate} testID="insert-template" />
              </Row>
            ) : null}
            <Field label="Document text (Markdown)" value={vm.draft.content} onChange={v => vm.setField("content", v)} placeholder="Choose a type, then Insert template" problems={fieldProblems("content")} multiline testID="upload-content" />

            <Row style={{ justifyContent: "flex-end" }}>
              <Button label={vm.uploading ? "Checking…" : "Check and upload"} onPress={vm.submit} variant="primary" disabled={vm.uploading} testID="upload-submit" />
            </Row>
          </View>
        ) : null}
        {vm.uploadMessage ? <T size="small" tone={vm.uploadMessage.tone} bold testID="upload-message">{vm.uploadMessage.text}</T> : null}
      </Card>

      <Card testID="catalog">
        <Heading level={2}>Documents</Heading>
        <Row style={{ flexWrap: "wrap", gap: space.xs }}>
          {FILTERS.map(f => <Choice key={f} label={`${f === "all" ? "All" : STATUS_LABEL[f]} (${vm.counts[f]})`} selected={vm.filter === f} onPress={() => vm.setFilter(f)} testID={`filter-${f}`} />)}
        </Row>
        {vm.docMessage ? <T size="small" tone={vm.docMessage.tone} bold testID="doc-message">{vm.docMessage.text}</T> : null}
        {vm.state === "loading" ? <T tone="muted">Loading documents…</T> : null}
        {vm.state === "error" ? <T tone="bad">Documents could not be loaded. Try again shortly.</T> : null}
        {vm.state === "empty" ? <T tone="muted">No documents yet. Add one above.</T> : null}
        {vm.docs.map(d => (
          <View key={d.id} testID={`doc-${d.id}`} style={{ gap: space.xs, paddingVertical: space.sm, borderTopWidth: 1, borderColor: t.line }}>
            <Row style={{ flexWrap: "wrap", gap: space.xs }}>
              <T bold>{d.title}</T>
              <Chip label={d.version} mono />
              <Chip label={STATUS_LABEL[d.status]} tone={d.status === "approved" ? "ok" : d.status === "pending_review" ? "warn" : "default"} dashed={d.status === "withdrawn"} testID={`status-${d.id}`} />
              {d.cited ? <Badge text="Cited" /> : null}
            </Row>
            <T size="small" tone="muted">
              {[d.id, d.assetName, d.section, d.classification, `effective ${d.effectiveDate}`, `${d.chunkCount} chunks`, d.uploadedBy ? `uploaded by ${d.uploadedBy}` : "seeded corpus", d.reviewedBy ? `approved by ${d.reviewedBy}` : null, d.hash ? `sha256 ${d.hash.slice(0, 12)}` : null].filter(Boolean).join(" · ")}
            </T>
            {d.withdrawnReason ? <T size="small">Withdrawn: {d.withdrawnReason}</T> : null}
            <Row style={{ flexWrap: "wrap", gap: space.xs }}>
              {d.actions.approve ? <Button label="Approve" variant="primary" onPress={() => vm.approve(d.id)} disabled={!d.actions.approve.allowed || vm.busy} testID={`approve-${d.id}`} /> : null}
              {d.actions.remove ? <Button label={d.actions.remove.label} onPress={() => vm.startRemove(d.id)} disabled={!d.actions.remove.allowed || vm.busy} testID={`remove-${d.id}`} /> : null}
            </Row>
            {d.actions.approve?.reason ? <T size="small" tone="muted">{d.actions.approve.reason}</T> : null}
            {vm.removing?.id === d.id && d.actions.remove ? (
              <View style={{ gap: space.sm, backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: space.md }} testID={`remove-panel-${d.id}`}>
                <T size="small">{d.actions.remove.explain}</T>
                <Field label="Reason (kept in the audit log)" value={vm.removing.reason} onChange={vm.setRemoveReason} placeholder="Uploaded by mistake" testID="remove-reason" />
                <Row style={{ gap: space.xs }}>
                  <Button label={`Confirm ${d.actions.remove.label.toLowerCase()}`} variant="primary" onPress={vm.confirmRemove}
                    disabled={vm.busy || vm.removing.reason.trim().length < (vm.rules?.reasonMinChars ?? 1)} testID="remove-confirm" />
                  <Button label="Cancel" onPress={vm.cancelRemove} testID="remove-cancel" />
                </Row>
              </View>
            ) : null}
          </View>
        ))}
        <Divider />
        <T size="small" tone="muted">Only approved documents are used in answers. A document nobody cited is deleted; a cited one is withdrawn so earlier answers stay traceable (RAG-8, RAG-13).</T>
      </Card>
    </Screen>
  );
}
