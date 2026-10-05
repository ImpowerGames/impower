import { describe, expect, test } from "vitest";
import { completeAt } from "../providers/braceCompletionHarness";

// This exercises completion's use of source metadata. Marker parsing itself
// belongs to the end-to-end tests added after the coordinated grammar change.
describe("declared property lookup in completion (#580)", () => {
  const registry = {
    context: { animation: {
      $default: { $type: "animation", $name: "$default", timing: { duration: 0 } },
      template: { nickname: "Fade", typo: 1 },
      child: { $extends: "template" },
    } },
    definitionProperties: [{
      type: "animation", name: "template", root: false,
      properties: [{
        path: ["nickname"], key: { from: 0, to: 8 }, declared: true, value: "Fade",
      }, {
        path: ["typo"], key: { from: 9, to: 13 }, declared: false, value: 1,
      }], openPaths: [],
    }],
  };

  test("a structural child offers the parent's declared addition and inherited defaults", () => {
    const labels = completeAt("animation child as template with\n  nick|\nend\n", registry)
      .map((item) => item.label);
    expect(labels).toContain("nickname");
    expect(labels).toContain("timing");
    expect(labels).not.toContain("typo");
  });

  test("nested property completion uses the requested level's shape", () => {
    const items = completeAt("animation child as template with\n  timing { dur| }\nend\n", registry);
    expect(items.find((item) => item.label === "duration")?.insertText).toBe("duration = ");
    expect(items.map((item) => item.label)).not.toContain("nickname");
  });
});
