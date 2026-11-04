import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

function expectFormatsTo(source: string, expected: string) {
  expect(formatSource(source)).toBe(expected);
  expect(formatSource(expected)).toBe(expected);
}

test("formatting keeps a bare do block inside repeat on its own line", () => {
  const source = `function f()
  repeat
    x = 1
    do
    end
  until x
end
`;
  expectFormatsTo(source, source);
});

test("formatting keeps a bare do block inside a while body on its own line", () => {
  const source = `function f()
  while x do
    y = 1
    do
      z = 1
    end
  end
end
`;
  expectFormatsTo(source, source);
});

test("formatting keeps a bare do block after a one-line for on its own line", () => {
  const source = `function f()
  for i = 1, 2 do print(i) end
  x = 1
  do
  end
end
`;
  expectFormatsTo(source, source);
});

test("formatting joins a multi-line while header onto its do", () => {
  expectFormatsTo(
    `function f()
  while x and
  y
  do
    z = 1
  end
end
`,
    `function f()
  while x and y do
    z = 1
  end
end
`,
  );
});

test("formatting joins a multi-line for header onto its do", () => {
  expectFormatsTo(
    `function f()
  for i = 1,
  10
  do
    print(i)
  end
end
`,
    `function f()
  for i = 1, 10 do
    print(i)
  end
end
`,
  );
});
