import { test } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

test("dump call dot", () => {
  const src = "function run()\nlocal r = a:get().x\nend\n";
  // eslint-disable-next-line no-console
  console.log(stripAnsi(dumpTree(src)));
});
