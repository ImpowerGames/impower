// An unknown global read inside a block statement (`if`, `match`, a loop) in
// a scene, a branch or at the top level is reported on the statement that
// reads it, as the same read in an `&` statement is (#944).

import { expect, test } from "vitest";
import { diagnoseDetailed } from "./diagnosticTestHarness";

const WARNING = "Cannot find variable named `foo`";

test.each([
  ["if in a scene", "scene start()\n  if foo >= 1 then\n    Yes.\n  end\nend\n", 1],
  [
    "if in a branch",
    "scene start()\n  branch first\n    if foo >= 1 then\n      Yes.\n    end\n  end\nend\n",
    2,
  ],
  [
    "top-level match after a scene",
    "scene start()\n  Hello.\nend\n\nmatch (foo)\n  | other = A recruit.\nend\n",
    4,
  ],
  ["match in a scene", "scene start()\n  match (foo)\n    | other = A recruit.\n  end\nend\n", 1],
  ["control: & read in a scene", "scene start()\n  & print(foo)\nend\n", 1],
])("%s", (_name, source, line) => {
  const found = diagnoseDetailed(source).filter((d) => d.message === WARNING);
  expect(found.map((d) => d.range!.start.line)).toEqual([line]);
});
