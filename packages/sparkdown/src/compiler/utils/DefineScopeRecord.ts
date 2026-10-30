import { FlowBase } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import type { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { VariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import type { CompiledBlock } from "../classes/annotators/CompilationAnnotator";
import {
  classifyDefine,
  isScopedDefine,
  scopedDefineKey,
} from "./scopeDefineInstances";

export interface DefineScopeStats {
  blocks: number;
  blocksWalked: number;
  objectsVisited: number;
  declarations: number;
  classified: number;
  renamed: number;
}

export class DefineScopeRecord {
  static verify = false;
  static verifyFailures: string[] = [];

  protected _blocks = new WeakMap<object, BlockDefines>();
  protected _typeNames?: ReadonlySet<string>;
  protected _overlay?: PreviewOverlay;

  stats: DefineScopeStats = DefineScopeRecord.emptyStats();

  static emptyStats(): DefineScopeStats {
    return {
      blocks: 0,
      blocksWalked: 0,
      objectsVisited: 0,
      declarations: 0,
      classified: 0,
      renamed: 0,
    };
  }

  scope(
    blocks: readonly object[],
    typeNames: ReadonlySet<string>,
    renamed: ParsedObject[],
    preview?: { undo: (() => void)[]; rolledBack: () => ParsedObject[] },
  ): ParsedObject[] {
    const stats = (this.stats = DefineScopeRecord.emptyStats());
    const overlay = preview ? this.overlayFor(preview.undo) : undefined;
    const last = overlay ? overlay.typeNames : this._typeNames;
    const union = last && sameNames(last, typeNames) ? last : typeNames;
    const declarations: ParsedObject[] = [];
    stats.blocks = blocks.length;
    for (const block of blocks) {
      let entry = this._blocks.get(block);
      if (!entry) {
        const held = this.walk(block as CompiledBlock);
        entry = held.length > 0 ? { held } : NO_DEFINES;
        this._blocks.set(block, entry);
        stats.blocksWalked++;
      }
      const held = entry.held;
      if (held.length === 0) {
        continue;
      }
      for (const va of held) {
        declarations.push(va);
      }
      if (entry.under === union) {
        continue;
      }
      for (const va of held) {
        stats.classified++;
        const journal = preview
          ? (previous: Identifier | null) => {
              preview.undo.push(() => {
                va.identifier = previous;
                preview.rolledBack().push(va);
              });
            }
          : undefined;
        if (classifyDefine(va, union, journal)) {
          stats.renamed++;
          renamed.push(va);
        }
      }
      if (!overlay) {
        entry.under = union;
      }
    }
    stats.declarations = declarations.length;
    if (overlay) {
      overlay.typeNames = union;
    } else {
      this._typeNames = union;
    }
    return declarations;
  }

  protected overlayFor(undo: (() => void)[]): PreviewOverlay {
    if (this._overlay?.undo === undo) {
      return this._overlay;
    }
    const overlay: PreviewOverlay = { undo, typeNames: this._typeNames };
    this._overlay = overlay;
    undo.push(() => {
      if (this._overlay === overlay) {
        this._overlay = undefined;
      }
    });
    return overlay;
  }

  protected walk(block: CompiledBlock): VariableAssignment[] {
    const found: VariableAssignment[] = [];
    const seen = new Set<ParsedObject>();
    const stack: ParsedObject[] = [];
    if (block.content) {
      stack.push(...block.content);
    }
    if (block.hoistedKnots) {
      stack.push(...block.hoistedKnots);
    }
    while (stack.length > 0) {
      const obj = stack.pop()!;
      if (seen.has(obj)) {
        continue;
      }
      seen.add(obj);
      this.stats.objectsVisited++;
      if (isScopedDefine(obj)) {
        found.push(obj);
      }
      const content = obj.content;
      if (content) {
        for (const c of content) stack.push(c);
      }
      if (obj instanceof FlowBase) {
        if (obj._rootWeave) {
          stack.push(obj._rootWeave);
        }
        for (const sub of obj._subFlowsByName.values()) {
          stack.push(sub);
        }
      }
    }
    return found;
  }

  static check(
    story: ParsedObject,
    held: readonly ParsedObject[],
    skip: ReadonlySet<ParsedObject>,
    typeNames: ReadonlySet<string>,
  ): void {
    const declarations = new Set(held);
    if (declarations.size !== held.length) {
      DefineScopeRecord.verifyFailures.push(
        `${held.length - declarations.size} declarations held by more than one chunk`,
      );
    }
    const inStory = new Set<ParsedObject>();
    const stack: ParsedObject[] = [story];
    while (stack.length > 0) {
      const obj = stack.pop()!;
      if (isScopedDefine(obj) && !skip.has(obj)) {
        inStory.add(obj);
        const desired = scopedDefineKey(obj, typeNames);
        if (desired !== undefined && obj.identifier?.name !== desired) {
          DefineScopeRecord.verifyFailures.push(
            `${obj.structDefinition?.name?.name}: holds ${obj.identifier?.name}, a walk of the story gives ${desired}`,
          );
        }
      }
      if (obj.content) {
        for (const c of obj.content) stack.push(c);
      }
    }
    for (const obj of inStory) {
      if (!declarations.has(obj)) {
        DefineScopeRecord.verifyFailures.push(
          `${(obj as VariableAssignment).structDefinition?.name?.name}: in the story, in no chunk's record`,
        );
      }
    }
    for (const obj of declarations) {
      if (!inStory.has(obj)) {
        DefineScopeRecord.verifyFailures.push(
          `${(obj as VariableAssignment).structDefinition?.name?.name}: in a chunk's record, not in the story`,
        );
      }
    }
  }
}

interface PreviewOverlay {
  readonly undo: (() => void)[];
  typeNames?: ReadonlySet<string>;
}

interface BlockDefines {
  readonly held: readonly VariableAssignment[];
  under?: ReadonlySet<string>;
}

const NO_DEFINES: BlockDefines = Object.freeze({ held: [] });

const sameNames = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => {
  if (a.size !== b.size) {
    return false;
  }
  for (const name of a) {
    if (!b.has(name)) {
      return false;
    }
  }
  return true;
};
