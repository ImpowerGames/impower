import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

// Formatting gives `expected`, and formatting that result changes nothing.
function expectFormatsTo(source: string, expected: string) {
  expect(formatSource(source)).toBe(expected);
  expect(formatSource(expected)).toBe(expected);
}

// I-1546: a Luau line in a scene or function body is indented by the block
// that holds it.

// I-1544: the compiler closes a scene only at its own `end`, so a function
// written inside a scene closed with `end` stays in the scene's body.

test("a local function inside a scene keeps the scene's indent and the lines after it", () => {
  const source = `scene main
  local function j() end
  if true then
    x
  end
end
`;
  expectFormatsTo(source, source);
});

test("a multi-line function inside a scene is indented as part of the scene body", () => {
  expectFormatsTo(
    `scene main
local function j()
print(1)
end
x = 1
end
`,
    `scene main
  local function j()
    print(1)
  end
  x = 1
end
`,
  );
});

test("a function inside a branch of a closed scene keeps the branch's indent", () => {
  const source = `scene main
  branch b
    function j()
      print(1)
    end
    Hello.
  end
end
`;
  expectFormatsTo(source, source);
});

test("a function after a closed scene still starts at column 0 after a blank line", () => {
  expectFormatsTo(
    `scene main
  Hello.
end
  function j()
print(1)
  end
`,
    `scene main
  Hello.
end

function j()
  print(1)
end
`,
  );
});

// I-1545: a function body line that starts at column 0 has no whitespace
// node or `Newline` node at its start to carry its indent.

test("a column-0 call line in a function body is indented", () => {
  expectFormatsTo(
    "function g(c)\nprint(1)\nend\n",
    "function g(c)\n  print(1)\nend\n",
  );
});

test("a column-0 call line in a nested function body is indented by both blocks", () => {
  expectFormatsTo(
    "function g(c)\nif c then\nlocal function h()\nprint(1)\nend\nend\nend\n",
    "function g(c)\n  if c then\n    local function h()\n      print(1)\n    end\n  end\nend\n",
  );
});
