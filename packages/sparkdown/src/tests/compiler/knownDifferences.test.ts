import { afterEach, describe, expect, test, vi } from "vitest";
import { expectWithinPin, reportStalePin, STALE_PIN_TITLE } from "./knownDifferences";
import { compareLanguages } from "./languageEquality";

const PIN = { ticket: "I-2048", subject: '"Hello {x end}\\nAfter\\n"', list: "the test's pins" };

function captureLog() {
  return vi.spyOn(console, "log").mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("a pinned known difference may shrink and may not grow", () => {
  test("observed differences equal to the pin pass and report nothing", () => {
    const log = captureLog();
    expectWithinPin(PIN, ["1:9", "1:10"], ["1:9", "1:10"]);
    expect(log).not.toHaveBeenCalled();
  });

  test("fewer observed differences pass and report the ones gone, with the pin's ticket", () => {
    vi.stubEnv("GITHUB_ACTIONS", "");
    const log = captureLog();
    expectWithinPin(PIN, ["1:9", "1:10", "1:11"], ["1:10"]);
    expect(log).toHaveBeenCalledTimes(1);
    const message = String(log.mock.calls[0]![0]);
    expect(message).toContain(STALE_PIN_TITLE);
    expect(message).toContain("I-2048");
    expect(message).toContain("1:9, 1:11");
    expect(message).not.toContain("1:10");
  });

  test("no observed differences pass and report every pinned one gone", () => {
    vi.stubEnv("GITHUB_ACTIONS", "");
    const log = captureLog();
    expectWithinPin(PIN, ["1:9", "1:10"], []);
    expect(String(log.mock.calls[0]![0])).toContain("no longer shows 1:9, 1:10");
  });

  test("a difference the pin does not list fails and names its position", () => {
    const log = captureLog();
    expect(() => expectWithinPin(PIN, ["1:9", "1:10"], ["1:9", "1:10", "1:12"])).toThrow(/I-2048[^]*\[ '1:12' \]/);
    expect(log).not.toHaveBeenCalled();
  });

  test("a difference that moved fails on its new position even though the count is unchanged", () => {
    captureLog();
    expect(() => expectWithinPin(PIN, ["1:9", "1:10"], ["1:9", "1:11"])).toThrow(/'1:11'/);
  });

  test("on GitHub Actions the report is one warning annotation line", () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    const log = captureLog();
    reportStalePin({ ...PIN, subject: '"100%\r\nAfter"' }, ["1:9"]);
    const line = String(log.mock.calls[0]![0]);
    expect(line.startsWith(`::warning title=${STALE_PIN_TITLE}::${STALE_PIN_TITLE} (I-2048): `)).toBe(true);
    expect(line).toContain("100%25%0D%0AAfter");
    expect(line).not.toMatch(/[\r\n]/);
  });

  test("a real pinned case whose pin lists a position no longer observed passes", async () => {
    vi.stubEnv("GITHUB_ACTIONS", "");
    const log = captureLog();
    const source = "Hello {x end}\nAfter\n";
    const { divergences } = await compareLanguages(source);
    const observed = divergences.map((d) => d.lineCol);
    expectWithinPin(PIN, ["99:0", ...observed], observed);
    expect(String(log.mock.calls[0]![0])).toContain("no longer shows 99:0.");
  });
});
