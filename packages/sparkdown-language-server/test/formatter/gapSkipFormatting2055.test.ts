import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

const compact = (text: string) => text.replace(/\s+/g, "");

test.each([
  "scene start\n  Hello {x end}, said the guard.\n  if x do then\n    Inside the if.\n  end\n  local a = 0 & a = 2\n  Value {a}.\nend\n",
  "scene start\n    Hello {{x until}}.\n  while x then do\n  Hi.\n  end\nend\n",
  "style 1bad {\n  color = red\n}\n",
  "style s.t {\n  color = red\n}\n",
  "layout 2main {\n  box {\n  }\n}\n",
  "morph 2m {\n  x = 1\n}\n",
  "screen 9s {\n}\n",
  "component 1c(t) {\n}\n",
  "Hello {x &}\n",
  "scene start\n  if x == 1 then名\n  end\n  Hi {a b c}.\nend\n",
  "function f()\n  if x do then\n    return 1\n  end\nend\n",
])("formatting keeps text the grammar passes over, and formats it the same way twice: %j", (source) => {
  const once = formatSource(source);
  expect(compact(once)).toBe(compact(source));
  expect(formatSource(once)).toBe(once);
});
