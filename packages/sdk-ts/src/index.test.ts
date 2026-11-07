// unwrap keeps the problem details the API sends, including the list of upload problems (RAG-12).
import { describe, it, expect } from "vitest";
import { ApiError, unwrap } from "./index.ts";

const response = (status: number) => new Response(null, { status, statusText: "Unprocessable" });

describe("unwrap", () => {
  it("returns data", () => {
    expect(unwrap({ data: { ok: true }, response: response(200) })).toEqual({ ok: true });
  });
  it("throws ApiError with detail, trace ID and the problems list", () => {
    const problems = [{ field: "title", code: "too_short", message: "Title needs at least 8 characters." }];
    try {
      unwrap({ error: { type: "about:blank", title: "Document not accepted", status: 422, detail: "Fix this", traceId: "t1", problems }, response: response(422) });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).problem).toEqual({ type: "about:blank", title: "Document not accepted", status: 422, detail: "Fix this", traceId: "t1", problems });
    }
  });
  it("falls back to the HTTP status when the body is not a problem", () => {
    expect(() => unwrap({ error: undefined, response: response(422) })).toThrow(ApiError);
  });
});
