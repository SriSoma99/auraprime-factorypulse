// ViewModel for M04 Work checklist. Readings are checked against the instrument range before sending;
// the server checks again. Each save carries an idempotency key (UI-AC-10).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, newIdempotencyKey, unwrap, type WorkOrderStep } from "@fp/sdk-ts";
import { api } from "@/lib/api";

export function readingProblem(step: WorkOrderStep, raw: string): string | null {
  if (!step.reading) return null;
  const v = Number(raw.replace(",", "."));
  if (raw.trim() === "" || Number.isNaN(v)) return "Enter a number.";
  const { min, max } = step.reading.instrumentRange;
  if (v < min || v > max) return `${v} ${step.reading.unit} is outside what this instrument can read (${min}–${max} ${step.reading.unit}). Check the value.`;
  return null;
}
export function readingNote(step: WorkOrderStep, v: number): string | null {
  if (!step.reading) return null;
  const { min, max } = step.reading.referenceRange;
  return v < min ? "Below reference." : v > max ? "Above reference." : "Within reference.";
}

export function useWorkOrderVM(id: string) {
  const qc = useQueryClient();
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["work-order", id], queryFn: async () => unwrap(await api.GET("/v1/work-orders/{workOrderId}", { params: { path: { workOrderId: id } } })) });
  const save = useMutation({
    mutationFn: async ({ step, body }: { step: number; body: { value?: number; choice?: string; done?: boolean } }) =>
      unwrap(await api.PUT("/v1/work-orders/{workOrderId}/steps/{stepNo}", { params: { path: { workOrderId: id, stepNo: step }, header: { "Idempotency-Key": newIdempotencyKey() } }, body })),
    onSuccess: wo => { setError(null); qc.setQueryData(["work-order", id], wo); void qc.invalidateQueries({ queryKey: ["incident"] }); },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.problem.detail ?? e.problem.title : "Could not save the step."),
  });
  const wo = q.data;
  const steps = wo?.steps ?? [];
  const current = steps.find(s => !s.done) ?? null;
  const done = steps.filter(s => s.done).length;
  const startable = wo?.status === "approved" || wo?.status === "in_progress";
  return {
    state: q.isLoading ? "loading" : q.isError || !wo ? "error" : wo.status === "completed" ? "submitted" : !startable ? "notApproved" : "inProgress",
    workOrder: wo, steps, current, progress: steps.length ? done / steps.length : 0, progressText: `${done} of ${steps.length} steps done`,
    input: (no: number) => inputs[no] ?? "", setInput: (no: number, v: string) => setInputs(s => ({ ...s, [no]: v })),
    choice: (no: number) => choices[no] ?? null, setChoice: (no: number, v: string) => setChoices(s => ({ ...s, [no]: v })),
    problem: current ? readingProblem(current, inputs[current.no] ?? "") : null,
    error, busy: save.isPending,
    saveCurrent: () => {
      if (!current) return;
      const body: { value?: number; choice?: string; done: boolean } = { done: true };
      if (current.reading) { if (readingProblem(current, inputs[current.no] ?? "")) return; body.value = Number((inputs[current.no] ?? "").replace(",", ".")); }
      if (current.choices) { const c = choices[current.no]; if (!c) { setError("Choose a finding."); return; } body.choice = c; }
      save.mutate({ step: current.no, body });
    },
  };
}
