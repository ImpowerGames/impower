import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
} {
  const compiler = testCompiler();
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
  if (!result.program.chunks) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = testStory(result.program.chunks);
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

scene start
  & run()
  done
end

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
      true,
      false,
      true,
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

scene start
  & run()
  done
end

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
      true,
      false,
      false,
      true,
      true,
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

scene start
  & run()
  done
end

function run()
local p = new Penguin()
p:speak()
local b = new Bird()
b:speak()
end
`);
    expect(errors).toEqual([]);
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

scene start
  & run()
  done
end

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

scene start
  & run()
  done
end

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
      10,
      null,
      "wanderer",
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

scene start
  & run()
  done
end

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
    const { errors, recorded } = compileAndCapture(`external host_record(v)

define Settings with
  difficulty = "normal"
end

scene start
  & run()
  done
end

function run()
host_record(Settings.difficulty)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["normal"]);
  });
});
