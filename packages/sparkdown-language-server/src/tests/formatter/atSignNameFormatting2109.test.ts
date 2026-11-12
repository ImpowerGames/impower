import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

const FORMATTED = `define mia@party as filtered_image with
  image = image.mia@night
  attributes = { "happy", "hat" }
end

store word@count = 0

function count@all(text)
  local seen@here = #text
  return seen@here + word@count
end

scene start
  & word@count = count@all("abc")
  [[mia@night:happy]]
  [[mia@night~hat]]
  [[mia@night + mia@party:hat]]
  The count is {word@count}.
end
`;

describe("formatting @ names (#2109)", () => {
  test("leaves formatted @ names as written", () => {
    expect(formatSource(FORMATTED)).toBe(FORMATTED);
  });

  test("spaces operators around an @ name as around any name", () => {
    const loose = FORMATTED.replace("seen@here + word@count", "seen@here+word@count").replace(
      "& word@count = count@all",
      "& word@count=count@all",
    );
    expect(formatSource(loose)).toBe(FORMATTED);
  });
});
