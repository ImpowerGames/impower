// P5 W3 — golden-master EQUIVALENCE gate.
//
// Sourcing the engine's defines from the live runtime `__def` tables
// (runtimeSourcedDefines, with the builtins prelude source-injected) must emit
// the SAME JSON-RPC message stream as the static program.defines channel. This
// runs representative UI fixtures BOTH ways and asserts the captured stream is
// byte-identical — the equivalence oracle for the swap.

import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

const FIXTURES: { name: string; src: string }[] = [
  {
    name: "dialogue with an authored character",
    src: `define hero as character with
  name = "Hero"
end

-> start
scene start
hero: Hello there.
end
`,
  },
  {
    name: "reactive layout (config + for)",
    src: `store n = 2
layout main with
  text "count {n}"
  for i = 1, n do
    text "row {i}"
  end
end

-> start
scene start
  Hi.
end
`,
  },
  {
    name: "authored animation on a backdrop",
    src: `define my_pan as animation with
  keyframes = {
    background_position = "right"
  }
end

-> start
scene start
  An image beat.
end
`,
  },
];

const stream = async (src: string, runtimeSourcedDefines: boolean) => {
  const h = createHarness(
    src,
    0,
    runtimeSourcedDefines ? { runtimeSourcedDefines: true } : {},
  );
  await h.ready;
  return JSON.stringify(h.snapshot(), null, 2);
};

describe("P5 W3: runtime-sourced defines == static channel", () => {
  for (const { name, src } of FIXTURES) {
    test(`${name}: message stream byte-identical (runtime vs static)`, async () => {
      const staticStream = await stream(src, false);
      const runtimeStream = await stream(src, true);
      expect(runtimeStream).toBe(staticStream);
    });
  }

  // The message stream can't see defines consumed only for internal decisions.
  // Directly assert the runtime context is a SUPERSET of the static one: every
  // static define entry is present with a matching $type/$name and identical
  // values for every scalar the static struct carries (richer runtime props are
  // allowed; losses or changed scalars are not).
  test("runtime context preserves every static define (same scalars, ≥ props)", async () => {
    const SRC = `define boss as character with
  name = "Boss"
  stats = {
    hp = 100
  }
end

define my_pan as animation with
  keyframes = {
    background_position = "right"
  }
end

-> start
scene start
boss: Hi.
end
`;
    const off = createHarness(SRC);
    await off.ready;
    const on = createHarness(SRC, 0, { runtimeSourcedDefines: true });
    await on.ready;
    const offCtx = (off.game as any).context as Record<string, any>;
    const onCtx = (on.game as any).context as Record<string, any>;
    const isScalar = (v: unknown) => v == null || typeof v !== "object";

    for (const [type, structs] of Object.entries(offCtx)) {
      if (type === "system" || !structs || typeof structs !== "object") {
        continue;
      }
      for (const [name, struct] of Object.entries<any>(structs)) {
        if (!struct || typeof struct !== "object") {
          continue;
        }
        const onStruct = onCtx[type]?.[name];
        expect(onStruct, `${type}.${name} missing from runtime context`).toBeTruthy();
        for (const [k, v] of Object.entries(struct)) {
          if (isScalar(v)) {
            expect(onStruct[k], `${type}.${name}.${k} differs`).toBe(v);
          }
        }
      }
    }
  });
});
