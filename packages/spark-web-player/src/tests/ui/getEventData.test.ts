// getEventData translates a DOM event into the serializable payload the engine
// receives. For two-way binding, a range/number control's value must cross as a
// NUMBER (not the DOM's string `.value`) so a numeric Luau store keeps its type.

import { describe, expect, test } from "vitest";
import { getEventData } from "../../app/utils/getEventData";

function inputEvent(input: HTMLInputElement, type: "input" | "change" = "input") {
  const event = new Event(type);
  Object.defineProperty(event, "target", { value: input });
  Object.defineProperty(event, "currentTarget", { value: input });
  return event;
}

describe("getEventData (two-way input payload)", () => {
  test("a range control sends its value as a number", () => {
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.value = "80";
    const data = getEventData(inputEvent(input)) as { value?: unknown };
    expect(data.value).toBe(80);
    expect(typeof data.value).toBe("number");
  });

  test("a number control sends its value as a number", () => {
    const input = document.createElement("input");
    input.type = "number";
    input.value = "42";
    const data = getEventData(inputEvent(input)) as { value?: unknown };
    expect(data.value).toBe(42);
  });

  test("a text control still sends its value as a string", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "Link";
    const data = getEventData(inputEvent(input)) as { value?: unknown };
    expect(data.value).toBe("Link");
    expect(typeof data.value).toBe("string");
  });

  test("a checkbox sends checked", () => {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    const data = getEventData(inputEvent(input, "change")) as {
      checked?: unknown;
    };
    expect(data.checked).toBe(true);
  });

  test("a blank number control falls back to the raw string (NaN guard)", () => {
    const input = document.createElement("input");
    input.type = "number";
    input.value = "";
    const data = getEventData(inputEvent(input)) as { value?: unknown };
    // valueAsNumber is NaN for an empty number field — don't write NaN.
    expect(data.value).toBe("");
  });
});
