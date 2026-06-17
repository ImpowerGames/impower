// `define` OOP class sugar — class tables + `new` instance
// construction + metatable-chain method dispatch.
//
//   define Bird with ... end            → Bird = { defaults, methods }
//   define Penguin as Bird with ... end → setmetatable(Penguin, { __index = Bird })
//   local b = new Bird()                → instance with __index → Bird
//   b:fly()                             → colon dispatch up the chain, self threaded
//
// `store`-marked properties copy into the instance at construction
// (instance-owned → always serialized with the instance); unmarked
// properties stay on the class until written.

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

describe("define classes — the Bird/Penguin sample", () => {
  test("methods dispatch with self, overrides win, inherited methods fall through", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)

define Bird with
  canFly = true
  isFlying = false
  fly()
    self.isFlying = true
    host_record("I'm a bird and I'm flying!")
  end
end

define Penguin as Bird with
  canFly = false
  isSwimming = false
  fly()
    host_record("Penguins can't fly...")
  end
  swim()
    self.isSwimming = true
    host_record("I'm a penguin and I'm swimming!")
  end
end

& run()
done

function run()
local bird = new Bird()
bird:fly()
local penguin = new Penguin()
penguin:fly()
penguin:swim()
host_record(bird.isFlying)
host_record(penguin.isFlying)
host_record(penguin.isSwimming)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([
      "I'm a bird and I'm flying!",
      "Penguins can't fly...",
      "I'm a penguin and I'm swimming!",
      true, // bird:fly() wrote the instance
      false, // penguin's override never set isFlying — class default
      true, // penguin:swim() wrote the instance
    ]);
  });

  test("property defaults read through the inheritance chain; writes are per-instance", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)

define Bird with
  canFly = true
  fly()
    self.isFlying = true
  end
end

define Penguin as Bird with
  canFly = false
  swim()
    self.isSwimming = true
  end
end

& run()
done

function run()
local b1 = new Bird()
local b2 = new Bird()
host_record(b1.canFly)
local p = new Penguin()
host_record(p.canFly)
b1.canFly = false
host_record(b1.canFly)
host_record(b2.canFly)
host_record(Bird.canFly)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([
      true, // Bird default
      false, // Penguin override shadows the parent default
      false, // b1's own write
      true, // b2 untouched — still reads the class default
      true, // the class itself untouched
    ]);
  });

  test("inherited method called on subclass instance", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)

define Bird with
  noise = "tweet"
  speak()
    host_record(self.noise)
  end
end

define Penguin as Bird with
  noise = "honk"
end

& run()
done

function run()
local p = new Penguin()
p:speak()
local b = new Bird()
b:speak()
end
`);
    expect(errors).toEqual([]);
    // Penguin has no methods of its own here BUT has a method-less
    // body — note: a define without methods is a data-define, so give
    // Penguin a method? No — Penguin inherits speak through the
    // chain, and `noise` resolves to the INSTANCE's class default
    // first ("honk"), demonstrating self-driven lookup.
    expect(recorded).toEqual(["honk", "tweet"]);
  });

  test("init constructor receives new's arguments", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)

define Critter with
  name = "???"
  init(name, hp)
    self.name = name
    self.hp = hp
  end
  describe()
    host_record(self.name)
    host_record(self.hp)
  end
end

& run()
done

function run()
local c = new Critter("Maw", 12)
c:describe()
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["Maw", 12]);
  });

  test("store-marked properties are instance-owned from construction", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)

define Hero with
  store hp = 10
  title = "wanderer"
  rest()
    self.hp = self.hp + 1
  end
end

& run()
done

function run()
local h = new Hero()
host_record(rawget(h, "hp"))
host_record(rawget(h, "title"))
host_record(h.title)
h:rest()
host_record(h.hp)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([
      10, // store prop copied into the instance at construction
      null, // non-store prop NOT on the instance...
      "wanderer", // ...but reads fine through __index
      11,
    ]);
  });

  test("methods can call other methods through self", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)

define Counter with
  store n = 0
  bump()
    self.n = self.n + 1
  end
  bumpTwice()
    self:bump()
    self:bump()
  end
end

& run()
done

function run()
local c = new Counter()
c:bumpTwice()
host_record(c.n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([2]);
  });

  test("data-only defines keep the legacy struct path (no runtime class)", () => {
    // A define with NO methods must not become a runtime global —
    // it routes through the compile-time struct registry exactly as
    // before (flat dot-access globals for its properties).
    const { errors, recorded } = compileAndCapture(`external host_record(v)

define Settings with
  difficulty = "normal"
end

& run()
done

function run()
host_record(Settings.difficulty)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["normal"]);
  });
});
