import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

// #1227: the spacing and indentation rules of brace bodies that the format
// fixtures under `__snapshots__/format/ui/` do not single out. Each case also
// formats its own output to itself.

function expectFormat(source: string, expected: string, tabs = false) {
  const options = tabs ? { insertSpaces: false } : {};
  const formatted = formatSource(source, options);
  expect(formatted).toBe(expected);
  expect(formatSource(formatted, options)).toBe(formatted);
}

describe("formatting the spacing of a brace body", () => {
  test("a class is glued to the name or class before it, and keeps one space after anything else", () => {
    // Glued after `#w=1` the class would join the value (`1.y`), after the
    // content it would join the string, and after a call's arguments or a
    // closure's `}` it would no longer follow a name.
    expectFormat(
      `layout a with
  column {
    text   .title   .big "a"   .after #w=1   .y
    card("x")   .c
    fill footer   .f { text }
    button @click={ go() }   .wide
  }
end
`,
      `layout a with
  column {
    text.title.big "a" .after #w=1 .y
    card("x") .c
    fill footer .f { text }
    button @click={ go() } .wide
  }
end
`,
    );
  });

  test("a `;` takes no space before it and one after it, except at the end of a line or after a `{`", () => {
    expectFormat(
      `layout a with
  column {
    row {  ;  }
    text "a" ;
    text "b";text "c"   ;   text "d"
  }
end
`,
      `layout a with
  column {
    row { ; }
    text "a";
    text "b"; text "c"; text "d"
  }
end
`,
    );
  });

  test("an optional `=` takes one space on each side, and a block one space before its `{`", () => {
    expectFormat(
      `layout a with
  column{
    row={text}
    row   =   {   text   }
    title{}
    empty   {   }
  }
end
`,
      `layout a with
  column {
    row = { text }
    row = { text }
    title {}
    empty {}
  }
end
`,
    );
  });

  test("a struct block's key keeps its whitespace, which the readers take as written", () => {
    const source = `style quote with
  > :last-child {
    margin-bottom = 0
  }
  > text , > image{a = 1}
end
`;
    expectFormat(
      source,
      `style quote with
  > :last-child {
    margin-bottom = 0
  }
  > text , > image { a = 1 }
end
`,
    );
  });

  test("a one-line closure on an indented-form line keeps the spacing it has today", () => {
    // Only a closure on a brace line is spaced inside its braces; the
    // indented forms format as before until the last slice of #1222.
    expectFormat(
      `layout a with
  button @click={ a=1 }
  column {
    button @click={a=1}
  }
end
`,
      `layout a with
  button @click={a = 1}
  column {
    button @click={ a = 1 }
  }
end
`,
    );
  });
});

describe("formatting the indentation of a brace body", () => {
  test("a comment between an element and its continuation lines lines up with them", () => {
    expectFormat(
      `layout a with
  button
-- at the top of the body
        .fancy
  column {
    text
  // inside a block
          "Inventory"
    -- before the next element
    row
  }
end
`,
      `layout a with
  button
    -- at the top of the body
    .fancy
  column {
    text
      // inside a block
      "Inventory"
    -- before the next element
    row
  }
end
`,
    );
  });

  test("a multi-line closure's statements indent by their Luau blocks, and a comment in it stays with them", () => {
    expectFormat(
      `layout a with
  button
    @click={
  -- reset
          if score > 0 then
  score = 0
              end
        }
end
`,
      `layout a with
  button
    @click={
      -- reset
      if score > 0 then
        score = 0
      end
    }
end
`,
    );
  });

  test("tabs indent one per level", () => {
    expectFormat(
      `layout a with
  column {
      text
        .title
  row {
 text "a"
      }
  }
end
`,
      `layout a with
\tcolumn {
\t\ttext
\t\t\t.title
\t\trow {
\t\t\ttext "a"
\t\t}
\t}
end
`,
      true,
    );
  });
});
