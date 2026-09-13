import { expect, it } from "vitest";
import { parseProtocolJSON, stringifyProtocolJSON } from "@impower/spark-editor-protocol/src/utils/protocolJSON";

it("round trips nested binary imports including empty and large buffers", () => {
  const data = Uint8Array.from({ length: 200_003 }, (_, i) => i % 256).buffer;
  const message = { jsonrpc: "2.0", id: "import", method: "workspace/willCreateFiles", params: { files: [
    { uri: "file://local/image.png", data },
    { uri: "file://local/empty.sd", data: new ArrayBuffer(0) },
  ] } };
  expect(parseProtocolJSON(stringifyProtocolJSON(message))).toEqual(message);
  expect(data.byteLength).toBe(200_003);
});

it("preserves ordinary protocol fields and rejects malformed binary data", () => {
  const message = { result: { text: "$sparkBuffer", $sparkBuffer: "plain", count: 0, value: null } };
  expect(parseProtocolJSON(stringifyProtocolJSON(message))).toEqual(message);
  expect(() => parseProtocolJSON('{"$sparkBuffer":"%%%"}')).toThrow();
});
