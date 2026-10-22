import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

// Formatting gives `expected`, and formatting that result changes nothing.
function expectFormatsTo(source: string, expected: string) {
  expect(formatSource(source)).toBe(expected);
  expect(formatSource(expected)).toBe(expected);
}

// I-788: the whitespace between two statements on one line is kept, so the
// second statement is not glued to the first one's last token.
test("formatting keeps the space between a number and the next statement", () => {
  const source = `function f()
  local v = 5 print(3)
  return v
end
`;
  expectFormatsTo(source, source);
});

test("formatting keeps the space between a name and the next statement", () => {
  const source = `function f()
  local v = x print(3)
  return v
end
`;
  expectFormatsTo(source, source);
});

test("formatting keeps the space after a block comment that spans lines", () => {
  const source = `function f()
  local t: number --[[a
  ]] print(1)
  return t
end
`;
  expectFormatsTo(source, source);
});

test("formatting collapses the space between two statements to one", () => {
  expectFormatsTo(
    `function f()
  local v = 5    print(3)
  return v
end
`,
    `function f()
  local v = 5 print(3)
  return v
end
`,
  );
});

test("formatting keeps a number ending in a point apart from the next statement", () => {
  const source = `function f()
  local v = 1. print(3)
  return v
end
`;
  expectFormatsTo(source, source);
});

test("formatting a concatenation after a number writes one space", () => {
  const expected = `function f(x)
  local v = 5 .. x
  return v
end
`;
  for (const space of [" ", "  ", "\t", " \t "]) {
    expectFormatsTo(
      `function f(x)
  local v = 5${space}.. x
  return v
end
`,
      expected,
    );
  }
});

test("formatting still glues a class to a name that ends in a digit", () => {
  expectFormatsTo(
    `layout a with
  column {
    text2 .title
    text .level2 .big
  }
end
`,
    `layout a with
  column {
    text2.title
    text.level2.big
  }
end
`,
  );
});

// I-1494: an alternator used as a Luau value keeps its words apart.
test("formatting keeps a match alternator's word apart from the next word", () => {
  const expected = `function f()
  local v = match match("x")|x="mage"end|mage="yes"end
  return v
end
`;
  expectFormatsTo(
    `function f()
  local v = match match("x") | x = "mage" end | mage = "yes" end
  return v
end
`,
    expected,
  );
  expectFormatsTo(
    `function f()
  local v = match match("x") | x = "mage" end| mage = "yes" end
  return v
end
`,
    expected,
  );
});

test("formatting keeps a cycle alternator's word apart from the next word", () => {
  const expected = `store s = cycle match("x")|x="a"end|"b"end
`;
  expectFormatsTo(
    `store s = cycle match("x") | x = "a" end | "b" end
`,
    expected,
  );
  expectFormatsTo(
    `store s = cycle match("x") | x = "a" end| "b" end
`,
    expected,
  );
});

test("formatting keeps nested alternator words apart in an interpolation", () => {
  expectFormatsTo(
    `{cycle cycle match("x") | x = "a" end | "b" end}
`,
    `{cycle cycle match("x")|x="a"end|"b"end}
`,
  );
});

// I-874's `-> two then`: a divert target stays apart from the keyword after
// it. The first pass still writes `one==`, which I-874 owns, so this checks
// only that no word is joined.
test("formatting keeps a divert target apart from then", () => {
  const formatted = formatSource(`function f()
  if -> one == -> two then
    return 1
  end
end
`);
  expect(formatted).toContain("-> two then");
  expect(formatSource(formatted)).toContain("-> two then");
});
