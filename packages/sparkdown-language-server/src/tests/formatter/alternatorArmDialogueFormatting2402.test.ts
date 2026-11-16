import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

test("formatting indents a block dialogue opened right after an alternator arm's bar one level under the bar's line", () => {
  const source = `scene s
  queue
    | GUIDE (softly):
        Welcome back.
        It has been a while.
    | Other line.
  end
end
`;
  const expected = `scene s
  queue
    | GUIDE (softly):
      Welcome back.
      It has been a while.
    | Other line.
  end
end
`;
  expect(formatSource(source)).toBe(expected);
  expect(formatSource(expected)).toBe(expected);
});
