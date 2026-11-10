import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { LocalBindings } from "../../compiler/utils/localBinding";

const URI = "file:///binding.sd";

function bindingsOf(source: string) {
  const registry = new SparkdownDocumentRegistry(["references"]);
  registry.set({ textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" } });
  const bindings = new LocalBindings(registry.tree(URI)!, (from, to) => source.slice(from, to));
  const offset = (needle: string, occurrence = 1) => {
    let found = -1;
    for (let i = 0; i < occurrence; i++) {
      found = source.indexOf(needle, found + 1);
    }
    if (found < 0) throw new Error(`no occurrence ${occurrence} of ${needle}`);
    return found;
  };
  return {
    offset,
    bindingOf: (needle: string, occurrence = 1) => bindings.bindingOf(offset(needle, occurrence)),
  };
}

describe("LocalBindings · a use's root resolves to the binding in scope (I-1969)", () => {
  test("a parameter binds its name in the function, and declares itself", () => {
    const { bindingOf, offset } = bindingsOf("function show(settings)\n  return settings.score\nend\n");
    expect(bindingOf("settings", 1)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
  });

  test("an anonymous function's parameter binds only inside that function", () => {
    const { bindingOf, offset } = bindingsOf(
      "function show()\n  local f = function(settings)\n    return settings.score\n  end\n  return settings.score\nend\n",
    );
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 3)).toBeNull();
  });

  test("a local binds its name in later statements of its block and of nested functions", () => {
    const { bindingOf, offset } = bindingsOf(
      "function outer()\n  local settings = {score = 2}\n  function inner()\n    return settings.score\n  end\n  return settings.score\nend\n",
    );
    expect(bindingOf("settings", 1)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 3)).toBe(offset("settings", 1));
  });

  test("a local does not bind its own initializer or statements before it", () => {
    const { bindingOf } = bindingsOf(
      "function show()\n  local result = settings.score\n  local settings = settings\n  return result\nend\n",
    );
    expect(bindingOf("settings", 1)).toBeNull();
    expect(bindingOf("settings", 3)).toBeNull();
  });

  test("a local whose block has ended no longer binds its name", () => {
    const { bindingOf, offset } = bindingsOf(
      "function show()\n  if true then\n    local settings = 1\n    x = settings\n  end\n  return settings.score\nend\n",
    );
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 3)).toBeNull();
  });

  test("a local in one branch of an if binds later statements of that branch only", () => {
    const { bindingOf, offset } = bindingsOf(
      "function show()\n  if a then\n    local settings = 1\n    x = settings\n  elseif b then\n    local other = 2\n    x = settings.score\n  else\n    y = settings.score + other\n  end\nend\n",
    );
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 3)).toBeNull();
    expect(bindingOf("settings", 4)).toBeNull();
    expect(bindingOf("other", 2)).toBeNull();
  });

  test("each use resolves to its own binding, and distinct bindings of one name stay distinct", () => {
    const { bindingOf, offset } = bindingsOf(
      "function a(settings)\n  local settings = settings\n  return settings\nend\nfunction b()\n  local settings = 3\n  return settings\nend\n",
    );
    expect(bindingOf("settings", 3)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 4)).toBe(offset("settings", 2));
    expect(bindingOf("settings", 6)).toBe(offset("settings", 5));
  });

  test("a const in a function binds like a local, and a top-level const binds nothing", () => {
    const { bindingOf, offset } = bindingsOf(
      "const settings = 1\nfunction show()\n  const other = 2\n  const function helper()\n    return 1\n  end\n  return settings + other + helper()\nend\n",
    );
    expect(bindingOf("settings", 1)).toBeNull();
    expect(bindingOf("settings", 2)).toBeNull();
    expect(bindingOf("other", 2)).toBe(offset("other", 1));
    expect(bindingOf("helper", 2)).toBe(offset("helper", 1));
  });

  test("calling a parameter resolves the call to it, and calling a global function does not", () => {
    const { bindingOf, offset } = bindingsOf("function show(callback)\n  return callback() + helper()\nend\n");
    expect(bindingOf("callback", 2)).toBe(offset("callback", 1));
    expect(bindingOf("helper", 1)).toBeNull();
  });

  test("a recursive local function resolves its own name inside its body", () => {
    const { bindingOf, offset } = bindingsOf(
      "function outer()\n  local function settings(n)\n    if n > 0 then\n      return settings(n - 1)\n    end\n    return 0\n  end\n  return settings(2)\nend\n",
    );
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 3)).toBe(offset("settings", 1));
  });

  test("a repeat body's local binds its own until condition and not a later one", () => {
    const { bindingOf, offset } = bindingsOf(
      "function show()\n  repeat\n    local settings = {score = 2}\n  until settings.score > 0\n  repeat\n    x = 1\n  until settings\nend\n",
    );
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 3)).toBeNull();
  });

  test("a local in one function does not bind the name in another", () => {
    const { bindingOf } = bindingsOf(
      "function show()\n  local settings = 1\n  return settings\nend\nfunction other()\n  return settings.score\nend\n",
    );
    expect(bindingOf("settings", 3)).toBeNull();
  });

  test.each([
    ["a generic for's variable", "function show(t)\n  for settings, v in pairs(t) do\n    x = settings.score\n  end\nend\n"],
    ["a numeric for's variable", "function show()\n  for settings = 1, 3 do\n    x = settings.score\n  end\nend\n"],
  ])("%s is bound where it is declared and in the loop body", (_, source) => {
    const { bindingOf, offset } = bindingsOf(source);
    expect(bindingOf("settings", 1)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
  });

  test("a loop variable does not bind the name after the loop", () => {
    const { bindingOf } = bindingsOf("function show()\n  for settings = 1, 3 do\n  end\n  x = settings.score\nend\n");
    expect(bindingOf("settings", 2)).toBeNull();
  });

  test("a scene's local binds later lines of the scene and its branches, and not another scene", () => {
    const { bindingOf, offset } = bindingsOf(
      "scene show\n  local settings = {score = 2}\n  {settings.score}\n  branch b\n    {settings.score}\n  end\nend\nscene other\n  {settings.score}\nend\n",
    );
    expect(bindingOf("settings", 1)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 3)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 4)).toBeNull();
  });

  test("a local in a choice's body binds the lines after it", () => {
    const { bindingOf, offset } = bindingsOf(
      "scene s\n  choose\n    * Go\n      local picked = 1\n      {picked}\n  end\nend\n",
    );
    expect(bindingOf("picked", 2)).toBe(offset("picked", 1));
  });

  test("a define method's parameter and const bind inside the method", () => {
    const { bindingOf, offset } = bindingsOf(
      "define Bird with\n  sing(settings)\n    const other = 2\n    return settings.score + other\n  end\nend\n",
    );
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
    expect(bindingOf("other", 2)).toBe(offset("other", 1));
  });

  test("a scene's and a branch's parameters bind inside their section and not after it", () => {
    const { bindingOf, offset } = bindingsOf(
      "scene start(settings)\n  {settings.score}\n  branch sub(other)\n    {settings} {other}\n  end\n  {other}\nend\nscene next\n  {settings}\nend\n",
    );
    expect(bindingOf("settings", 1)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 3)).toBe(offset("settings", 1));
    expect(bindingOf("other", 2)).toBe(offset("other", 1));
    expect(bindingOf("other", 3)).toBeNull();
    expect(bindingOf("settings", 4)).toBeNull();
  });

  test.each([
    ["a story for loop", "scene start\n  for settings = 1, 3 do\n    {settings}\n  end\n  {settings}\nend\n"],
    ["a story for-in loop", "scene start\n  for settings in pairs({1}) do\n    {settings}\n  end\n  {settings}\nend\n"],
    ["an explicit for loop", "scene start\n  & for settings = 1, 3 do print(settings) end\n  {settings}\nend\n"],
  ])("%s binds its variable in its body and not after it", (_, source) => {
    const { bindingOf, offset } = bindingsOf(source);
    expect(bindingOf("settings", 1)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 3)).toBeNull();
  });

  test("a while condition is not a loop variable", () => {
    const { bindingOf } = bindingsOf("function show()\n  while settings do\n    x = settings\n  end\nend\n");
    expect(bindingOf("settings", 1)).toBeNull();
    expect(bindingOf("settings", 2)).toBeNull();
  });

  test("a story repeat body's local binds its until condition", () => {
    const { bindingOf, offset } = bindingsOf("scene start\n  repeat\n    local settings = 1\n  until settings > 0\nend\n");
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
  });

  test("a bare local declaration binds a statement after it on the same line", () => {
    const { bindingOf, offset } = bindingsOf("function f()\n  local settings return settings\nend\n");
    expect(bindingOf("settings", 1)).toBe(offset("settings", 1));
    expect(bindingOf("settings", 2)).toBe(offset("settings", 1));
  });

  test("a top-level use with no local declaration is unbound", () => {
    const { bindingOf } = bindingsOf("scene s\n  {settings.score}\nend\n");
    expect(bindingOf("settings")).toBeNull();
  });
});
