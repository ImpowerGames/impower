import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

// #1224 reads brace blocks in `layout` and `component` bodies, and #1227
// formats them by brace depth. The formatter must not change what such a body
// means.

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
    // #1225; #1227 indents a continuation line one level past its element.
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

  test("a handler that spans lines is formatted as the Luau code it is", () => {
    // #1225, round 1 (comment 5940793507, finding 3): the statements of a
    // closure that spans lines are Luau, so they take Luau's spacing, as a
    // one-line closure's do; before #1225 they were struct body lines. The
    // continuation lines around them keep their place.
    const source = `layout popup with
  button
    .fancy
    @click={
      score=score+1
      combo=combo*2
    }
  column {
    button "Go" @click={
      score=0
    } "Done"
  }
end
`;
    expect(formatSource(source)).toBe(`layout popup with
  button
    .fancy
    @click={
      score = score + 1
      combo = combo * 2
    }
  column {
    button "Go" @click={
      score = 0
    } "Done"
  }
end
`);
  });

  test("lines inside a block indent by its braces, and the lines after it keep their level", () => {
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
    // The block's header line sits among the body's indented lines and takes
    // its level from them; the lines inside it take their depth from its
    // braces (#1227). `stage` stays a sibling of `column.panel`.
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
