import { describe, expect, test } from "vitest";
import { parseSource } from "@impower/sparkdown/src/tests/compiler/grammarSnapshot";
import { type SyntaxNode } from "@lezer/common";
import { labelsAt } from "./completionHarness";

const event = "store event = { global = 1 }\n";
const item = "store item = { global = 1 }\n";
const layout = (body: string) => `layout hud with\n${body}\nend\n`;
const component = (body: string, parameter = "item") => `component card(${parameter}) with\n${body}\nend\n`;
const loop = (body: string, header = "for item in {} do") => layout(`  ${header}\n${body}\n  end`);
const braceLoop = (body: string, header = "for item in {} do") => layout(`  column {\n    ${header}\n${body}\n    end\n  }`);

// Only existing runtime bindings are unknown here; no DOM field, component
// argument or iterator result type is inferred. Positive boundary controls
// distinguish a shadowed receiver from an unrelated missing completion site.
const cases: [string, string, string[], string][] = [
  ["inline handler event shadows a stored global", event + layout('  button "Go" @click={ return event.@1 }'), [], "LuauSparkleHandlerClosure"],
  ["inline handler event shadows an outer local", 'local event = { outer = 1 }\n' + layout('  button "Go" @click={ return event.@1 }'), [], "LuauSparkleHandlerClosure"],
  ["multiline handler event is its own parameter", event + layout('  button "Go" @click={\n    return event.@1\n  }'), [], "LuauSparkleHandlerClosure"],
  ["brace property handler event is its own parameter", event + layout('  button {\n    @click = { return event.@1 }\n  }'), [], "LuauSparkleHandlerClosure"],
  ["call handler event shadows a stored global", event + 'store use = function(value) end\n' + layout('  button "Go" @click=use(event.@1)'), [], "LuauSparkleEventAttribute"],
  ["a nested handler closure captures unknown event", event + layout('  button "Go" @click={\n    local nested = function() return event.@1 end\n  }'), [], "LuauSparkleHandlerClosure"],
  ["explicit handler event assignment supplies a shape", event + layout('  button "Go" @click={ event = { assigned = 1 }; return event.@1 }'), ["assigned"], "LuauSparkleHandlerClosure"],
  ["an authored handler local shadows event", event + layout('  button "Go" @click={ local event = { inner = 1 }; return event.@1 }'), ["inner"], "LuauSparkleHandlerClosure"],
  ["an earlier initializer captures implicit event before a later local", event + layout('  button "Go" @click={ local saved = event; local event = { later = 1 }; return saved.@1 }'), [], "LuauSparkleHandlerClosure"],
  ["a nested parameter shadows explicitly assigned event", event + layout('  button "Go" @click={ event = { assigned = 1 }; local nested = function(event) return event.@1 end }'), [], "LuauSparkleHandlerClosure"],

  ["component interpolation uses its parameter rather than a stored global", item + component('  text "{item.@1}"'), [], "LuauComponent"],
  ["component interpolation uses its parameter rather than an outer local", 'local item = { outer = 1 }\n' + component('  text "{item.@1}"'), [], "LuauComponent"],
  ["component handler captures its unknown parameter", item + component('  button "Go" @click={ return item.@1 }'), [], "LuauComponent"],
  ["an authored handler local shadows a component parameter", item + component('  button "Go" @click={ local item = { inner = 1 }; return item.@1 }'), ["inner"], "LuauComponent"],
  ["a component parameter annotation does not infer a literal shape", item + component('  text "{item.@1}"', "item: { field: number }"), [], "LuauComponent"],
  ["a sibling component parameter does not hide a global", item + component('  text "first"') + 'component other() with\n  text "{item.@1}"\nend\n', ["global"], "LuauComponent"],

  ["a generic Sparkle loop variable shadows a stored global", item + loop('    text "{item.@1}"'), [], "LuauSparkleForLoop"],
  ["a generic Sparkle loop variable shadows an outer local", 'local item = { outer = 1 }\n' + loop('    text "{item.@1}"'), [], "LuauSparkleForLoop"],
  ["a numeric Sparkle loop variable shadows a stored global", item + loop('    text "{item.@1}"', "for item = 1, 3 do"), [], "LuauSparkleForLoop"],
  ["a brace generic loop variable shadows a stored global", item + braceLoop('      text "{item.@1}"'), [], "LuauSparkleBlockFor"],
  ["a brace numeric loop variable shadows a stored global", item + braceLoop('      text "{item.@1}"', "for item = 1, 3 do"), [], "LuauSparkleBlockFor"],
  ["a loop iterable uses the outer receiver", item + loop('    text "body"', "for item in item.@1 do"), ["global"], "LuauSparkleForLoop"],
  ["a numeric loop bound uses the outer receiver", item + loop('    text "body"', "for item = item.@1, 3 do"), ["global"], "LuauSparkleForLoop"],
  ["a plain loop else restores the outer receiver", item + loop('    text "body"\n  else\n    text "{item.@1}"'), ["global"], "LuauSparkleForLoop"],
  ["a brace loop else restores the outer receiver", item + braceLoop('      text "body"\n    else\n      text "{item.@1}"'), ["global"], "LuauSparkleBlockFor"],
  ["a sibling after a loop uses the outer receiver", item + loop('    text "body"') + layout('  text "{item.@1}"'), ["global"], "LuauLayout"],
  ["a nested loop else retains the outer loop's unknown binding", item + loop('    for item in {} do\n      text "body"\n    else\n      text "{item.@1}"\n    end'), [], "LuauSparkleForLoop"],
  ["a loop else retains the component's unknown parameter", item + component('  for item in {} do\n    text "body"\n  else\n    text "{item.@1}"\n  end'), [], "LuauComponent"],
  ["a loop handler captures its unknown iteration parameter", item + loop('    button "Go" @click={ return item.@1 }'), [], "LuauSparkleForLoop"],
  ["an authored handler local shadows the iteration parameter", item + loop('    button "Go" @click={ local item = { inner = 1 }; return item.@1 }'), ["inner"], "LuauSparkleForLoop"],
  ["a component call argument uses its enclosing iteration parameter", item + loop('    card(item.@1)'), [], "LuauSparkleForLoop"],
  ["ordinary Luau loops retain their real AST local identity", item + 'function main()\n  for item in {} do\n    return item.@1\n  end\nend\n', [], "LuauForLoop"],
  ["an annotated multi-target loop does not borrow the outer value", item + loop('    text "{item.@1}"', "for key: { a: number, b: string }, item in {} do"), [], "LuauSparkleForLoop"],
  ["a function-valued property captures a genuine global event", event + 'define Point with\n  callback = function() return event.@1 end\nend\n', ["global"], "LuauPropertyDefinition"],
];

describe("static member receivers respect authored runtime bindings (#867)", () => {
  test.each(cases)("%s", (_name, source, expected, owner) => {
    const cursor = source.indexOf("@1");
    expect(cursor).toBeGreaterThanOrEqual(0);
    const tree = parseSource(source.replace("@1", ""));
    const enclosing: string[] = [];
    for (let node: SyntaxNode | null = tree.resolveInner(cursor, -1); node; node = node.parent) enclosing.push(node.name);
    expect(enclosing.includes(owner), `the existing grammar owns this member cursor: ${enclosing.join(" > ")}`).toBe(true);
    expect(labelsAt(source).sort()).toEqual(expected);
  });
});
