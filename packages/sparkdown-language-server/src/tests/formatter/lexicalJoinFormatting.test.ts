import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

test.each([
  ["local x = t[ [[s]] ]", "local x = t[ [[s]]]"],
  ["local x = a. .b", "local x = a. .b"],
  ["local x = a. =b", "local x = a. = b"],
  ["local x = t[ y]", "local x = t[y]"],
  ["local x = f( (z))", "local x = f((z))"],
  ["local x = a. b", "local x = a.b"],
])("formatting %j keeps only the spaces whose removal would join two tokens", (source, expected) => {
  expect(formatSource(`${source}\nHello.\n`)).toBe(`${expected}\nHello.\n`);
});
