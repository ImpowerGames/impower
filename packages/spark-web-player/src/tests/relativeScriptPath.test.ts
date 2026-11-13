import { expect, it } from "vitest";
import { relativeScriptPath } from "../components/PlayerBar/playerBarState";

it.each([
  ["/c:/Users/me/proj", "file:///c%3A/Users/me/proj/main.sd", "main"],
  ["/home/me/proj", "file:///home/me/proj/main.sd", "main"],
  ["/home/me/proj", "file:///home/me/proj/scenes/intro.sd", "scenes/intro"],
  ["file:///c%3A/Users/me/proj", "file:///c%3A/Users/me/proj/main.sd", "main"],
  ["file:///c%3A/Users/me/proj", "file:///c%3A/Users/me/proj/scenes/intro.sd", "scenes/intro"],
  ["file:///home/me/proj", "file:///home/me/proj/main.sd", "main"],
])("shows %s + %s as %s", (workspace, uri, expected) => {
  expect(relativeScriptPath(uri, workspace)).toBe(expected);
});

it("keeps a script outside the workspace folder readable", () => {
  expect(relativeScriptPath("file:///home/me/other/main.sd", "/home/me/proj")).toBe(
    "/home/me/other/main",
  );
});

it("does not strip a sibling folder that shares the workspace prefix", () => {
  expect(relativeScriptPath("file:///home/me/project2/main.sd", "/home/me/proj")).toBe(
    "/home/me/project2/main",
  );
});

it("leaves a location without a workspace unchanged apart from the extension", () => {
  expect(relativeScriptPath("main.sd", undefined)).toBe("main");
});
