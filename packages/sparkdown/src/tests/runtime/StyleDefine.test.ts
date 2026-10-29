import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compileStyle(source: string): {
  style: Record<string, any>;
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
  return { style: result.program.context?.["style"] ?? {}, errors };
}

describe("style · flat props", () => {
  test("scalar props become struct keys (raw CSS names preserved)", () => {
    const r = compileStyle(`style panel with
  position = absolute
  flex_direction = column
  font_size = 3.4cqh
end
`);
    expect(r.errors).toEqual([]);
    expect(r.style["panel"]).toEqual({
      $type: "style",
      $name: "panel",
      position: "absolute",
      flex_direction: "column",
      font_size: "3.4cqh",
    });
  });

  test("whole-line `--` Luau comments are skipped (not bogus props)", () => {
    const r = compileStyle(`style panel with
  position = absolute
  -- background_color = rgba(0,0,0,0.8)
  font_size = 3.4cqh
end
`);
    expect(r.errors).toEqual([]);
    expect(r.style["panel"]).toEqual({
      $type: "style",
      $name: "panel",
      position: "absolute",
      font_size: "3.4cqh",
    });
    expect(JSON.stringify(r.style["panel"])).not.toContain("--");
    expect(JSON.stringify(r.style["panel"])).not.toContain("background_color");
  });

  test("complex CSS values kept raw; quoted strings unquoted", () => {
    const r = compileStyle(`style bg with
  translate = calc(cos(45deg)*1cqh) calc(sin(45deg*-1)*1cqh)
  image = "black"
  aspect_ratio = 4/3
end
`);
    expect(r.errors).toEqual([]);
    const s = r.style["bg"];
    expect(s["translate"]).toBe("calc(cos(45deg)*1cqh) calc(sin(45deg*-1)*1cqh)");
    expect(s["image"]).toBe("black");
    expect(s["aspect_ratio"]).toBe("4/3");
  });

  test("`<type>.<name>` references resolve to { $type, $name } (not raw strings)", () => {
    const r = compileStyle(`style dialogue_background with
  background_image = image.ui_dialogue_box
  font_family = font.courier_prime_sans
  position = absolute
  aspect_ratio = 1341/381
end
`);
    expect(r.errors).toEqual([]);
    const s = r.style["dialogue_background"];
    expect(s["background_image"]).toEqual({
      $type: "image",
      $name: "ui_dialogue_box",
    });
    expect(s["font_family"]).toEqual({
      $type: "font",
      $name: "courier_prime_sans",
    });
    expect(s["position"]).toBe("absolute");
    expect(s["aspect_ratio"]).toBe("1341/381");
  });
});

describe("style · nested (breakpoints + selectors)", () => {
  test("@breakpoint and > selector nest under their literal keys", () => {
    const r = compileStyle(`style speech_box with
  height = 100%
  @screen-size(sm) {
    width = 100%
  }
  > text {
    color = black
    font_size = 3cqh
  }
end
`);
    expect(r.errors).toEqual([]);
    expect(r.style["speech_box"]).toEqual({
      $type: "style",
      $name: "speech_box",
      height: "100%",
      "@screen-size(sm)": { width: "100%" },
      "> text": { color: "black", font_size: "3cqh" },
    });
  });

  test("attribute selectors (`> #image^=raffles_ { … }`) survive", () => {
    const r = compileStyle(`style shadow with
  > #image^=raffles_ {
    background_color = #E5323E
  }
  > #image^=bunny_ {
    background_color = #48A5F2
  }
end
`);
    expect(r.errors).toEqual([]);
    const s = r.style["shadow"];
    expect(s["> #image^=raffles_"]).toEqual({ background_color: "#E5323E" });
    expect(s["> #image^=bunny_"]).toEqual({ background_color: "#48A5F2" });
  });
});

describe("style · inheritance + boundaries", () => {
  test("`as PARENT` records $extends", () => {
    const r = compileStyle(`style danger as button with
  background_color = red
end
`);
    expect(r.errors).toEqual([]);
    expect(r.style["danger"]["$extends"]).toBe("button");
  });

  test("many style blocks coexist (no duplicate-`style` collision)", () => {
    const r = compileStyle(`style a with
  position = absolute
end
style b with
  position = relative
end
style c with
  > text {
    color = white
  }
end
`);
    expect(r.errors).toEqual([]);
    for (const name of ["a", "b", "c"]) {
      expect(r.style[name]?.$name).toBe(name);
    }
  });
});
