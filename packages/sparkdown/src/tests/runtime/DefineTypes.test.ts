// `define` as the unified type/instance/namespace construct — the
// companion / O / N model:
//
//   define companion as character with store trust = 0 end
//   define O as companion with name = "Orion", color = "teal" end
//   define N as character with name = "Nova", color = "violet" end
//
// Each `define D as T` auto-creates the named singleton D, inheriting
// T's props/methods, registered under T (and ancestors) so `T.D` and
// `Grandparent.D` resolve, and enumerable via `instances(T)`.
// `store` props are copied into each instance (per-instance, serialized).
// `new T()` mints fresh anonymous instances.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
} {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const errors: string[] = [];
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

const COMPANION_PRELUDE = `external host_record(v)

define companion as character with
  store trust = 0
end

define O as companion with
  name = "Orion"
  color = "teal"
end

define N as character with
  name = "Nova"
  color = "violet"
end
`;

describe("define type/instance/namespace model", () => {
  test("members are accessed through their type (companion.O)", () => {
    const { errors, recorded } = compileAndCapture(`${COMPANION_PRELUDE}
& run()
done

function run()
host_record(companion.O.name)
host_record(companion.O.color)
host_record(N.name)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["Orion", "teal", "Nova"]);
  });

  test("members are also reachable through the grandparent type", () => {
    const { errors, recorded } = compileAndCapture(`${COMPANION_PRELUDE}
& run()
done

function run()
host_record(character.O.name)
host_record(character.N.name)
host_record(character.companion.trust)
end
`);
    expect(errors).toEqual([]);
    // O is a companion, companion is a character — so character.O bubbles up.
    expect(recorded).toEqual(["Orion", "Nova", 0]);
  });

  test("store props are inherited as own keys; mutation is per-instance", () => {
    const { errors, recorded } = compileAndCapture(`${COMPANION_PRELUDE}
& run()
done

function run()
host_record(O.trust)
host_record(rawget(O, "trust"))
O.trust = O.trust + 1
host_record(O.trust)
host_record(companion.trust)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([
      0, // inherited store default, copied into O at creation
      0, // ...and it's an OWN key (store-copied), not just inherited
      1, // per-instance mutation
      0, // the type's own default is untouched
    ]);
  });

  test("instances(T) iterates members only, yielding (name, instance)", () => {
    const { errors, recorded } = compileAndCapture(`${COMPANION_PRELUDE}
define P as companion with
  name = "Pax"
end

& run()
done

function run()
local count = 0
for k, v in instances(companion) do
  count = count + 1
  host_record(k)
  host_record(v.name)
  host_record(v.trust)
end
host_record(count)
end
`);
    expect(errors).toEqual([]);
    // companion's members are O and P (both `as companion`). trust (a
    // prop) and __storeProps (bookkeeping) are NOT yielded.
    expect(recorded).toEqual([
      "O",
      "Orion",
      0,
      "P",
      "Pax",
      0,
      2,
    ]);
  });

  test("iinstances(T) yields ordinals", () => {
    const { errors, recorded } = compileAndCapture(`${COMPANION_PRELUDE}
& run()
done

function run()
for i, v in iinstances(character) do
  host_record(i)
  host_record(v.name)
end
end
`);
    expect(errors).toEqual([]);
    // character's members in registration (document) order: companion
    // (no name → nil), then O (bubbled up from companion as it's
    // declared), then N.
    expect(recorded).toEqual([1, null, 2, "Orion", 3, "Nova"]);
  });

  test("the reset loop: mutate every member through instances()", () => {
    const { errors, recorded } = compileAndCapture(`${COMPANION_PRELUDE}
& run()
done

function run()
O.trust = 5
for k, v in instances(companion) do
  v.trust = 0
end
host_record(O.trust)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0]);
  });

  test("new T() mints fresh anonymous instances of a define-type", () => {
    const { errors, recorded } = compileAndCapture(`${COMPANION_PRELUDE}
& run()
done

function run()
local c = new companion()
host_record(c.trust)
c.trust = 7
host_record(c.trust)
host_record(companion.trust)
host_record(O.trust)
end
`);
    expect(errors).toEqual([]);
    // Fresh instance gets its own store default; mutating it leaves
    // both the type and the named singleton O untouched.
    expect(recorded).toEqual([0, 7, 0, 0]);
  });

  test("methods + data coexist on a type; instances dispatch them", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)

define Actor as character with
  store hp = 10
  greet()
    host_record(self.name)
  end
end

define Hero as Actor with
  name = "Knight"
end

& run()
done

function run()
host_record(Actor.Hero.name)
Hero:greet()
host_record(Hero.hp)
host_record(character.Hero.name)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["Knight", "Knight", 10, "Knight"]);
  });
});
