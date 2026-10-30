import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compileUI(source: string): {
  layout: Record<string, any>;
  component: Record<string, any>;
  errors: string[];
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
  for (const docDiags of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiags as any[]) {
      const msg =
        typeof d?.message === "string"
          ? d.message
          : (d?.message?.value ?? JSON.stringify(d));
      if (d?.severity === 1 || d?.severity == null) errors.push(msg);
    }
  }
  const context = result.program.context ?? {};
  return {
    layout: context["layout"] ?? {},
    component: context["component"] ?? {},
    errors,
  };
}

describe("screen · named-element tree", () => {
  test("nested elements + scalars + bare markers", () => {
    const r = compileUI(`layout main with
  stage {
    backdrop {
      image = "black"
    }
    portrait {
      mask.shadow_1
      mask.shadow_2
      image
    }
  }
end
scene start
end
`);
    expect(r.errors).toEqual([]);
    expect(r.layout["main"]).toEqual({
      $type: "layout",
      $name: "main",
      $recursive: true,
      stage: {
        backdrop: { image: "black" },
        portrait: {
          "mask shadow_1": {},
          "mask shadow_2": {},
          image: {},
        },
      },
    });
  });
});

describe("screen · classed element with content", () => {
  test("`text.h1 \"…\"` splits into key = tag + classes, value = content", () => {
    const r = compileUI(`layout main with
  column {
    text.h1 "Sparkle x Pico"
    text "plain"
    image
  }
end
scene start
end
`);
    expect(r.errors).toEqual([]);
    expect(r.layout["main"]).toEqual({
      $type: "layout",
      $name: "main",
      $recursive: true,
      column: {
        "text h1": "Sparkle x Pico",
        text: "plain",
        image: {},
      },
    });
  });

  test("inline attributes are still excised from a classed content line", () => {
    const r = compileUI(`layout main with
  column {
    text.h1 #padding=8 "Titled"
    button.primary "Go" @click=noop
  }
end
scene start
end
`);
    expect(r.errors).toEqual([]);
    expect(r.layout["main"]!["column"]).toEqual({
      "text h1": "Titled",
      "button primary": "Go",
    });
  });
});

describe("screen · reactive content interpolation", () => {
  test("interpolated content compiles cleanly (binding evaluators hoisted)", () => {
    const r = compileUI(`store hp = 100
store max_hp = 100
layout hud with
  text = "HP: {hp} / {max_hp + 0}"
end
scene start
end
`);
    expect(r.errors).toEqual([]);
    expect(r.layout["hud"]["text"]).toBe("HP: {hp} / {max_hp + 0}");
  });
});

describe("screen · adjacency content", () => {
  test("`tag \"content\"` produces the same context struct as `tag = \"content\"`", () => {
    const r = compileUI(`layout main with
  stage {
    backdrop {
      image "black"
    }
  }
end
scene start
end
`);
    expect(r.errors).toEqual([]);
    expect(r.layout["main"]["stage"]).toEqual({ backdrop: { image: "black" } });
  });
});

describe("screen · inline events", () => {
  test("`@event` handlers are dropped from the static struct + compile cleanly", () => {
    const r = compileUI(`store hp = 100
function use_item()
end
function take_damage(n)
end
layout hud with
  row {
    button "Use" @click=use_item
    button "Hit" @click=take_damage(10)
  }
end
scene start
end
`);
    expect(r.errors).toEqual([]);
    expect(r.layout["hud"]["row"]).toEqual({
      button: "Hit",
    });
  });
});

describe("screen · classes", () => {
  test("classes stay in the static struct key; content is the value", () => {
    const r = compileUI(`layout main with
  stage {
    mask.shadow_1
    text.title "Inventory"
  }
end
scene start
end
`);
    expect(r.errors).toEqual([]);
    expect(r.layout["main"]["stage"]).toEqual({
      "mask shadow_1": {},
      "text title": "Inventory",
    });
  });
});

describe("screen · control flow", () => {
  test("if/elseif/else compiles cleanly (condition evaluators hoisted)", () => {
    const r = compileUI(`store dead = false
store hp = 100
layout hud with
  if dead then
    text "over"
  elseif hp < 10 then
    text "low"
  else
    text "ok"
  end
end
scene start
end
`);
    expect(r.errors).toEqual([]);
  });
});

describe("screen · for loop", () => {
  test("for/in/do/else compiles cleanly (iterable binding hoisted)", () => {
    const r = compileUI(`store inventory = {}
function use_item()
end
layout bag with
  for item in inventory do
    button "Use" @click=use_item
  else
    text "empty"
  end
end
scene start
end
`);
    expect(r.errors).toEqual([]);
  });
});

describe("screen · match", () => {
  test("match/case/else compiles cleanly (matched expr hoisted)", () => {
    const r = compileUI(`store player_class = "knight"
layout sheet with
  match player_class do
  case "knight"
    text "Knight"
  else
    text "Other"
  end
end
scene start
end
`);
    expect(r.errors).toEqual([]);
  });
});

describe("component", () => {
  test("component produces $type component", () => {
    const r = compileUI(`component card with
  body {
    title {
      text
    }
  }
end
scene start
end
`);
    expect(r.errors).toEqual([]);
    const c = r.component["card"];
    expect(c["$type"]).toBe("component");
    expect(c["$name"]).toBe("card");
    expect(c["body"]).toEqual({ title: { text: {} } });
  });

  test("component inheritance records $extends", () => {
    const r = compileUI(`component my_button as button with
  label {
    text
  }
end
scene start
end
`);
    expect(r.errors).toEqual([]);
    expect(r.component["my_button"]["$extends"]).toBe("button");
  });
});

describe("screen · coexistence", () => {
  test("screen + style + narrative compile together", () => {
    const r = compileUI(`style title with
  font_size = lg
end
layout s with
  textbox {
    title {
      text
    }
  }
end
scene start
  Hi.
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.layout["s"]["textbox"]).toEqual({ title: { text: {} } });
  });
});
