import { describe, expect, it } from "vitest";
import { MessageProtocolRequestType as CoreRequest } from "@impower/jsonrpc/src";
import { MessageProtocolNotificationType as CoreNotification } from "@impower/jsonrpc/src";
import { MessageProtocolRequestType as EditorRequest } from "../src";
import { MessageProtocolNotificationType as EditorNotification } from "../src";

for (const [name, Request, Notification] of [
  ["core", CoreRequest, CoreNotification],
  ["editor", EditorRequest, EditorNotification],
] as const) {
  describe(name, () => {
    it("treats explicitly undefined optional fields as absent after structured clone", () => {
      const envelope = { jsonrpc: "2.0", method: "test/shared" };
      const type = new Request<"test/shared", {}, number>("test/shared");
      const note = new Notification<"test/shared", {}>("test/shared");
      expect(
        type.isResponse(
          structuredClone({ ...envelope, id: 0, result: 42, error: undefined }),
        ),
      ).toBe(true);
      expect(
        type.isResponse(
          structuredClone({
            ...envelope,
            id: 0,
            result: undefined,
            error: { code: -1, message: "failed" },
          }),
        ),
      ).toBe(true);
      expect(
        type.isRequest(
          structuredClone({
            ...envelope,
            id: 0,
            params: {},
            result: undefined,
            error: undefined,
            value: undefined,
          }),
        ),
      ).toBe(true);
      expect(
        note.is(
          structuredClone({
            ...envelope,
            params: {},
            id: undefined,
            result: undefined,
            error: undefined,
            value: undefined,
          }),
        ),
      ).toBe(true);
      expect(
        type.isProgressResponse(
          structuredClone({
            ...envelope,
            id: 0,
            value: { percentage: 50 },
            result: undefined,
            error: undefined,
            params: undefined,
          }),
        ),
      ).toBe(true);
    });
    const request = new Request<"test/shared", { text: string }, string | null>(
      "test/shared",
    );
    const notification = new Notification<"test/shared", { text: string }>(
      "test/shared",
    );
    it("preserves request payloads and distinguishes notifications", () => {
      const message = request.request({ text: "hello" });
      expect(message.params).toEqual({ text: "hello" });
      expect(request.is(message)).toBe(true);
      expect(notification.is(message)).toBe(false);
      expect(
        notification.is(notification.notification({ text: "hello" })),
      ).toBe(true);
      expect(request.is(notification.notification({ text: "hello" }))).toBe(
        false,
      );
    });
    it.each([0, 1, "", "request-id"])(
      "matches response ID %s exactly",
      (id) => {
        const response = request.response(id, null);
        expect(request.isResponse(response)).toBe(true);
        expect(request.isResponse(response, id)).toBe(true);
        expect(request.isResponse(response, "unrelated")).toBe(false);
        expect(
          request.isResponse(
            request.error(id, { code: -1, message: "failed" }),
            id,
          ),
        ).toBe(true);
      },
    );
    it("recognizes its progress and the legacy bare-method form without treating either as a request or response", () => {
      const progress = request.progress(0, {
        kind: "report",
        title: "Loading",
        cancellable: false,
      });
      for (const message of [
        progress,
        { ...progress, method: request.method },
      ]) {
        expect(request.isProgressResponse(message, 0)).toBe(true);
        expect(request.isProgressResponse(message, 1)).toBe(false);
        expect(request.isRequest(message)).toBe(false);
        expect(request.isResponse(message)).toBe(false);
      }
    });
    it.each([
      null,
      undefined,
      0,
      "message",
      {},
      { method: "other", id: 0 },
      { method: "test/shared", id: 0, result: null },
      { jsonrpc: "2.0", method: "test/shared", id: null, result: null },
      { jsonrpc: "2.0", method: "test/shared", id: NaN, result: null },
      { jsonrpc: "2.0", method: "test/shared", id: false, result: null },
      {
        jsonrpc: "2.0",
        method: "test/shared",
        id: 0,
        result: null,
        error: { code: -1, message: "bad" },
      },
    ])("rejects unrelated or malformed input %j", (message) => {
      expect(request.isResponse(message)).toBe(false);
      expect(request.isRequest(message)).toBe(false);
      expect(request.isProgressResponse(message)).toBe(false);
      expect(notification.is(message)).toBe(false);
    });
    it("retains transfer lists", () => {
      const transfer = [new ArrayBuffer(8)];
      expect(request.result("ok", transfer)).toEqual({
        result: "ok",
        transfer,
      });
    });
  });
}
