import { PassThrough } from "node:stream";
import { MessageChannel } from "node:worker_threads";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import * as core from "../src";
import * as editor from "../../spark-editor-protocol/src";
import {
  asLspRequest,
  asLspNotification,
} from "../../spark-editor-protocol/src/integrations/lsp";
import { HoverMessage } from "../../spark-editor-protocol/src/protocols/textDocument/HoverMessage";
import { DidOpenTextDocumentMessage } from "../../spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";

describe("shared entry points and integrations", () => {
  it("exports the same core request implementation and guards", () => {
    expect(editor.MessageProtocolRequestType.prototype).toBeInstanceOf(
      core.MessageProtocolRequestType,
    );
    expect(editor.isRequest).toBe(core.isRequest);
    expect(editor.isResponse).toBe(core.isResponse);
    expect(editor.isNotification).toBe(core.isNotification);
    expect(editor.isProgressResponse).toBe(core.isProgressResponse);
  });

  it("preserves literal methods, parameters, results and exclusive responses", () => {
    const descriptor = new editor.MessageProtocolRequestType<
      "typed",
      { text: string },
      number
    >("typed");
    const message = descriptor.request({ text: "hello" });
    expectTypeOf(message.method).toEqualTypeOf<"typed">();
    expectTypeOf(message.params).toEqualTypeOf<{ text: string }>();
    expectTypeOf(message._result).toEqualTypeOf<number | undefined>();
    const success: core.ResponseMessage<"typed", number> = descriptor.response(
      0,
      42,
    );
    const failure: core.ResponseMessage<"typed", number> = descriptor.error(0, {
      code: -1,
      message: "failed",
    });
    // @ts-expect-error Both success and error are forbidden.
    const both: core.ResponseMessage<"typed", number> = {
      jsonrpc: "2.0",
      method: "typed",
      id: 0,
      result: 42,
      error: { code: -1, message: "bad" },
    };
    // @ts-expect-error A response cannot omit both alternatives.
    const neither: core.ResponseMessage<"typed", number> = {
      jsonrpc: "2.0",
      method: "typed",
      id: 0,
    };
    expect(core.isResponse(success)).toBe(true);
    expect(core.isResponse(failure)).toBe(true);
    expect(core.isResponse(both)).toBe(false);
    expect(core.isResponse(neither)).toBe(false);
  });

  it("uses genuine LSP descriptors through a real vscode-jsonrpc connection", async () => {
    const outgoing = new PassThrough();
    const incoming = new PassThrough();
    const client = createMessageConnection(
      new StreamMessageReader(incoming),
      new StreamMessageWriter(outgoing),
    );
    const server = createMessageConnection(
      new StreamMessageReader(outgoing),
      new StreamMessageWriter(incoming),
    );
    const params = {
      textDocument: { uri: "file:///main.sd" },
      position: { line: 2, character: 3 },
    };
    const result = { contents: "hover result" };
    let received: unknown;
    server.onRequest(asLspRequest(HoverMessage.type), (value) => {
      received = value;
      return result;
    });
    const opened = new Promise<unknown>((resolve) => {
      server.onNotification(
        asLspNotification(DidOpenTextDocumentMessage.type),
        resolve,
      );
    });
    client.listen();
    server.listen();
    try {
      expect(
        await client.sendRequest(asLspRequest(HoverMessage.type), params),
      ).toEqual(result);
      expect(received).toEqual(params);
      const notification = {
        textDocument: {
          uri: "file:///main.sd",
          languageId: "sparkdown",
          version: 1,
          text: "Hello",
        },
      };
      await client.sendNotification(
        asLspNotification(DidOpenTextDocumentMessage.type),
        notification,
      );
      expect(await opened).toEqual(notification);
    } finally {
      client.dispose();
      server.dispose();
      outgoing.destroy();
      incoming.destroy();
    }
  });

  it("transfers binary request and response payloads over a real MessagePort", async () => {
    const { port1, port2 } = new MessageChannel();
    const descriptor = new editor.MessageProtocolRequestType<
      "binary",
      { data: ArrayBuffer },
      ArrayBuffer
    >("binary");
    const buffer = new Uint8Array([1, 2, 255]).buffer;
    try {
      const received = new Promise<unknown>((resolve) =>
        port2.once("message", resolve),
      );
      port1.postMessage(descriptor.request({ data: buffer }), [buffer]);
      expect(buffer.byteLength).toBe(0);
      const request = await received;
      if (!descriptor.isRequest(request)) throw new Error("Not a request");
      expect([...new Uint8Array(request.params.data)]).toEqual([1, 2, 255]);
      const result = descriptor.result(request.params.data, [
        request.params.data,
      ]);
      const returned = new Promise<unknown>((resolve) =>
        port1.once("message", resolve),
      );
      port2.postMessage(
        descriptor.response(request.id, result.result),
        result.transfer,
      );
      expect(request.params.data.byteLength).toBe(0);
      const response = await returned;
      if (!descriptor.isResponse(response) || response.error)
        throw new Error("Not a successful response");
      expect([...new Uint8Array(response.result)]).toEqual([1, 2, 255]);
    } finally {
      port1.close();
      port2.close();
    }
  });
});
