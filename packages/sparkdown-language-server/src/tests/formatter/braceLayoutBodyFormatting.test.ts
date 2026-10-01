import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

// #1224 reads brace blocks in `layout` and `component` bodies; formatting them
// by brace depth comes later (#1227). Until then the formatter must not change
// what such a body means.

describe("formatting a layout body written with brace blocks", () => {
  test("well-formed source round-trips unchanged", () => {
    const source = `component card(title) with
  column.card {
    text.title "{title}"
    slot
  }
end

layout inventory with
  column.panel #child-gap=8 {
    text.title "Inventory"
    for item in player.bag do
      row.item {
        image #src={item.icon}
        text "{item.name}"
        button "Use" @click=use_item(item)
      }
    else
      text.empty "Your bag is empty."
    end
    choice.0 { text }
    title { stroke; text }
    row = { text "a" #width=5; text "b" }
    card("Inventory") { text "body" }
  }
  stage:
    mask.shadow_1
end
`;
    expect(formatSource(source)).toBe(source);
  });

  test("an element whose parts go on over later lines round-trips unchanged", () => {
    // #1225. Indenting continuation lines is the formatter slice's (#1227).
    const source = `layout popup with
  button
    .fancy
    #bg-color=green
    "Okay"
    @click={
      score = 0
      combo = 0
    }
  {
    text "Confirm"
  }
  column {
    text
      .title
      "Inventory"
    button "Go" @click={
      score = score + 1
    }
  }
end
`;
    expect(formatSource(source)).toBe(source);
  });

  test("lines inside a block keep their indentation, and the lines after it keep their level", () => {
    const source = `layout hud with
      column.panel {
text.title "Inventory"
          row.item {
   text "a"
        }
  }
    stage:
      mask.shadow_1
end
`;
    // Only the block's header line, which sits among the body's indented
    // lines, is re-indented. `stage` stays a sibling of `column.panel`.
    expect(formatSource(source)).toBe(`layout hud with
  column.panel {
text.title "Inventory"
          row.item {
   text "a"
        }
  }
  stage:
    mask.shadow_1
end
`);
  });
});
