import { describe, expect, it } from "vitest";
import {
  isNotification,
  isProgressResponse,
  isRequest,
  isResponse,
} from "../src";

const base = { jsonrpc: "2.0", method: "work" };
const cases: { name: string; message: unknown; kind?: string }[] = [
  {
    name: "null peer error payload",
    message: { ...base, id: 0, error: null },
    kind: "response",
  },
  { name: "request", message: { ...base, id: 0, params: {} }, kind: "request" },
  {
    name: "notification",
    message: { ...base, params: {} },
    kind: "notification",
  },
  {
    name: "null success",
    message: { ...base, id: 0, result: null },
    kind: "response",
  },
  {
    name: "error",
    message: { ...base, id: "id", error: { code: -1, message: "failed" } },
    kind: "response",
  },
  {
    name: "malformed peer error",
    message: { ...base, id: 0, error: "boom" },
    kind: "response",
  },
  {
    name: "canonical progress",
    message: { ...base, method: "work/progress", id: 0, value: {} },
    kind: "progress",
  },
  {
    name: "bare-method progress",
    message: { ...base, id: 0, value: {} },
    kind: "progress",
  },
  {
    name: "undefined notification id",
    message: { ...base, id: undefined, params: {} },
    kind: "notification",
  },
  {
    name: "undefined request result",
    message: { ...base, id: 0, params: {}, result: undefined },
    kind: "request",
  },
  {
    name: "undefined error slot",
    message: { ...base, id: 0, result: 42, error: undefined },
    kind: "response",
  },
  {
    name: "undefined result slot",
    message: {
      ...base,
      id: 0,
      result: undefined,
      error: { code: -1, message: "failed" },
    },
    kind: "response",
  },
  {
    name: "incidental value on success",
    message: { ...base, id: 0, result: 42, value: {} },
    kind: "response",
  },
  {
    name: "both result and error",
    message: {
      ...base,
      id: 0,
      result: null,
      error: { code: -1, message: "failed" },
    },
  },
  {
    name: "null is not an absent error",
    message: { ...base, id: 0, result: 42, error: null },
  },
  { name: "invalid numeric id", message: { ...base, id: NaN, result: 42 } },
  {
    name: "missing protocol marker",
    message: { method: "work", id: 0, result: 42 },
  },
  {
    name: "unrelated method",
    message: { ...base, method: "other", id: 0, result: 42 },
  },
  { name: "null input", message: null },
];

describe("core envelope classification", () => {
  it.each(cases)("$name", ({ message, kind }) => {
    const cloned = structuredClone(message);
    expect(isRequest(cloned, "work")).toBe(kind === "request");
    expect(isNotification(cloned, "work")).toBe(kind === "notification");
    expect(isResponse(cloned, "work")).toBe(kind === "response");
    expect(isProgressResponse(cloned, "work")).toBe(kind === "progress");
  });
});
