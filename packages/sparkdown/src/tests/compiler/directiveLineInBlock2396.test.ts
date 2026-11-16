import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";
import { treeScopeStackAt, vscodeScopeStacksPerChar } from "./scopeEquality";

const DIRECTIVE_SCOPES = ["meta.image.sd", "meta.audio.sd"];
const TEXT_CHUNK = "string.display.text.chunk.sd";

const HEADS = ["BUNNY:", "BUNNY (softly):", ":", "^:", "%:", "$:", "@hud:"];

const LINES = [
  "[[show overlay bunny@serious]]",
  "((play music theme))",
  "[[bunny@serious]] ((play music theme))",
  "[[bunny@serious]]  [[raffles@shy]]",
];

const ASSET_LINE_NODES = new Set(["ImageLine", "AudioLine", "ImageAndAudioLine"]);

function sourceFor(head: string, line: string): string {
  return `scene start\n  ${line}\n  ${head}\n    ${line}\n    Hello.\nend\n`;
}

function fromDirective(stack: string[]): string[] {
  const at = stack.findIndex((scope) => DIRECTIVE_SCOPES.includes(scope));
  return at < 0 ? [] : stack.slice(at);
}

function offsets(source: string, line: string): [scene: number, block: number] {
  const scene = source.indexOf(line);
  const block = source.indexOf(line, scene + line.length);
  return [scene, block];
}

function nearestLineNode(tree: any, offset: number): string | undefined {
  let node = tree.resolveInner(offset, 1);
  while (node) {
    if (ASSET_LINE_NODES.has(node.name) || node.name === "TextChunk") return node.name;
    node = node.parent;
  }
  return undefined;
}

describe("a directive line inside a display block reads as it does at scene level (I-2396)", () => {
  for (const head of HEADS) {
    for (const line of LINES) {
      const source = sourceFor(head, line);
      const [scene, block] = offsets(source, line);

      test(`${head} ${line}: tree engine`, () => {
        const tree = parseSource(source);
        expect(nearestLineNode(tree, block + 2)).toBe(nearestLineNode(tree, scene + 2));
        for (let i = 0; i < line.length; i++) {
          const blockStack = treeScopeStackAt(tree, block + i);
          expect(blockStack, `offset ${i}`).not.toContain(TEXT_CHUNK);
          expect(fromDirective(blockStack), `offset ${i}`).toEqual(
            fromDirective(treeScopeStackAt(tree, scene + i)),
          );
        }
      });

      test(`${head} ${line}: vscode-textmate`, async () => {
        const stacks = await vscodeScopeStacksPerChar(source);
        for (let i = 0; i < line.length; i++) {
          expect(stacks[block + i], `offset ${i}`).not.toContain(TEXT_CHUNK);
          expect(fromDirective(stacks[block + i]!), `offset ${i}`).toEqual(
            fromDirective(stacks[scene + i]!),
          );
        }
      });
    }
  }
});
