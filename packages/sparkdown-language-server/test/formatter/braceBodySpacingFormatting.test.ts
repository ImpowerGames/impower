import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

function expectFormat(source: string, expected: string, tabs = false) {
  const options = tabs ? { insertSpaces: false } : {};
  const formatted = formatSource(source, options);
  expect(formatted).toBe(expected);
  expect(formatSource(formatted, options)).toBe(formatted);
}

describe("formatting the spacing of a brace body", () => {
  test("a class is glued to the name or class before it, and keeps one space after anything else", () => {
    expectFormat(
      `layout a {
  column {
    text   .title   .big "a"   .after #w=1   .y
    card("x")   .c
    fill.footer   .f { text }
    button @click={ go() }   .wide
  }
}
`,
      `layout a {
  column {
    text.title.big "a" .after #w=1 .y
    card("x") .c
    fill.footer.f { text }
    button @click={ go() } .wide
  }
}
`,
    );
  });

  test("a class is glued to any name the grammar takes, a letter outside ASCII or a final `-` included", () => {
    expectFormat(
      `layout a {
  column {
    café   .title
    custom- .title .big
    ñandú_2 .x
    card() .c
  }
}
`,
      `layout a {
  column {
    café.title
    custom-.title.big
    ñandú_2.x
    card() .c
  }
}
`,
    );
  });

  test("a `;` takes no space before it and one after it, except at the end of a line or after a `{`", () => {
    expectFormat(
      `layout a {
  column {
    row {  ;  }
    text "a" ;
    text "b";text "c"   ;   text "d"
  }
}
`,
      `layout a {
  column {
    row { ; }
    text "a";
    text "b"; text "c"; text "d"
  }
}
`,
    );
  });

  test("an optional `=` takes one space on each side, and a block one space before its `{`", () => {
    expectFormat(
      `layout a {
  column{
    row={text}
    row   =   {   text   }
    title{}
    empty   {   }
  }
}
`,
      `layout a {
  column {
    row = { text }
    row = { text }
    title {}
    empty {}
  }
}
`,
    );
  });

  test("a struct block's key keeps its whitespace, which the readers take as written", () => {
    const source = `style quote {
  > :last-child {
    margin-bottom = 0
  }
  > text , > image{a = 1}
}
`;
    expectFormat(
      source,
      `style quote {
  > :last-child {
    margin-bottom = 0
  }
  > text , > image { a = 1 }
}
`,
    );
  });

  test("a one-line closure has the same spacing at the root and inside a block", () => {
    expectFormat(
      `layout a {
  button @click={ a=1 }
  column {
    button @click={a=1}
  }
}
`,
      `layout a {
  button @click={ a = 1 }
  column {
    button @click={ a = 1 }
  }
}
`,
    );
  });
});

describe("formatting the indentation of a brace body", () => {
  test("a comment between an element and its continuation lines lines up with them", () => {
    expectFormat(
      `layout a {
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
}
`,
      `layout a {
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
}
`,
    );
  });

  test("every comment of a run before a continuation lines up with it, and the next run is decided on its own", () => {
    expectFormat(
      `layout a {
  button
-- one
     // two

  -- three
        .fancy
  column {
      -- four
  // five
    row
    text
 -- six

      -- seven
          "x"
  }
}
`,
      `layout a {
  button
    -- one
    // two

    -- three
    .fancy
  column {
    -- four
    // five
    row
    text
      -- six

      -- seven
      "x"
  }
}
`,
    );
  });

  test("a multi-line closure's statements indent by their Luau blocks, and a comment in it stays with them", () => {
    expectFormat(
      `layout a {
  button
    @click={
  -- reset
          if score > 0 then
  score = 0
              end
        }
}
`,
      `layout a {
  button
    @click={
      -- reset
      if score > 0 then
        score = 0
      end
    }
}
`,
    );
  });

  test("tabs indent one per level", () => {
    expectFormat(
      `layout a {
  column {
      text
        .title
  row {
 text "a"
      }
  }
}
`,
      `layout a {
\tcolumn {
\t\ttext
\t\t\t.title
\t\trow {
\t\t\ttext "a"
\t\t}
\t}
}
`,
      true,
    );
  });
});
