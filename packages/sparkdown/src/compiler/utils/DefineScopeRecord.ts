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

/** What one compile's scoping of the user's defines did. */
export interface DefineScopeStats {
  /** The chunks the program holds. */
  blocks: number;
  /** The chunks walked to find their defines: the ones lowered since the
   *  chunk was last seen. */
  blocksWalked: number;
  /** The parsed objects those walks visited. */
  objectsVisited: number;
  /** The define declarations the program holds. */
  declarations: number;
  /** The declarations classified again, because their chunk was walked or
   *  the type names they were last classified under changed. */
  classified: number;
  /** The declarations whose key changed. */
  renamed: number;
}

/**
 * The user's define declarations, found per chunk, and the type names each
 * chunk's declarations were last classified under (#709).
 *
 * `scopeDefineInstances` gives each typed define its global key from the
 * union of every user script's define type names, and once found it walked
 * the whole assembled story on every compile to find them. Almost every chunk
 * it walked was carried from the compile before by identity, and a carried
 * `CompiledBlock` holds the same parsed objects (the incremental parse gives
 * every block its reparse window touches a new one, and no pass writes into a
 * carried block's content but the identifiers this one sets). So:
 *
 * - **Which declarations a chunk holds** is a function of the block alone,
 *   kept in a `WeakMap` keyed by it and found by walking only a block not
 *   seen before.
 * - **Which key each declaration takes** is a function of its stable bare
 *   names and the union of type names. Each block records the union (by
 *   identity) its declarations were last classified under; a block whose
 *   record is not this compile's union is classified again. The union keeps
 *   its identity across compiles while its contents are unchanged. So a
 *   name that becomes or stops being a type anywhere classifies every
 *   chunk again (no walk), and a block that comes back after compiles that
 *   did not hold it (an include removed and restored) is classified under
 *   the union of the compile that holds it, never one it missed.
 *
 * Invariant: a declaration's identifier is the key its block's record says.
 * Only this pass writes a define's identifier, and it writes the record
 * after the identifiers.
 *
 * **Preview compiles** (#666) read the record, and write nothing that
 * outlives them. A preview records no block's classification, and compares
 * each compile's union with the one its own last compile classified under
 * (`PreviewOverlay`): a preview can compile two roots before its rollback,
 * and the second must find the identifiers as the first left them. Every identifier
 * the preview changes is journaled on its undo list, put back on rollback and
 * reported in `namesRolledBack` (the resolver resolves it again, as it does
 * any name a rollback put back), and the rollback drops the overlay. After the
 * rollback each declaration holds the key the last real compile gave it,
 * under the record that compile left, so the next real compile scopes as if
 * the preview had not happened. The blocks a preview lowers are recorded like
 * any other: what they hold is theirs alone, and they are dropped with the
 * preview.
 *
 * The builtins prelude is not recorded here: its story is parsed once and
 * classified by its own type names, which never change, so the compiler
 * scopes it once per parsed prelude (`SparkdownCompiler.compileStory`).
 */
export class DefineScopeRecord {
  /** When set, every pass is checked against a walk of the whole story, and
   *  each disagreement is pushed to {@link verifyFailures}. */
  static verify = false;
  static verifyFailures: string[] = [];

  // Per block: the define declarations it holds, and the type names they
  // were last classified under (none until a real compile classifies them).
  protected _blocks = new WeakMap<object, BlockDefines>();
  protected _typeNames?: ReadonlySet<string>;
  // The union the preview under way last classified under, while it lasts.
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

  /** Gives every define declaration of `blocks` its key under `typeNames`,
   *  and returns them all. `renamed` is given each declaration whose key
   *  changed. With `undo`, the compile is a preview: each change is
   *  journaled there, and `rolledBack` is given each declaration the
   *  rollback puts back. */
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

  /** The union the preview whose undo list is `undo` last classified under,
   *  which the rollback discards (`PreviewOverlay`). */
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

  /** The define declarations `block` holds. */
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
      // The assembled story holds a lowered flow's root weave and nested
      // flows in a flow of its own (`parseIncrementally`), so they are
      // reached here whether or not the lowered flow lists them as content.
      if (obj instanceof FlowBase) {
        if (obj._weave) {
          stack.push(obj._weave);
        }
        for (const sub of obj._subFlowsByName.values()) {
          stack.push(sub);
        }
      }
    }
    return found;
  }

  /** Checks a pass against a walk of the whole story (`verify`): the same
   *  declarations, each with the key `typeNames` gives it. */
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

/** The union a preview last classified under, in place of the record's: a
 *  preview can compile more than one root before its rollback
 *  (`previewCompile` compiles the edited script on its own when the
 *  requested root does not include it), and each compile after the first
 *  finds the identifiers as the compiles before it left them.
 *
 *  Comparing a compile's union with this one rather than with the last real
 *  compile's is what keeps that sound. While every compile of the preview
 *  has the real union, its identity is the record's, carried chunks stand as
 *  the record says, and none is classified. Once one compile of the preview
 *  has another union, it is a set of the preview's own, which no block's
 *  record holds, so that compile and every later one of the preview
 *  classify every carried chunk again. A later compile whose union has the
 *  real union's contents gets a set of its own too (it is compared with the
 *  preview's last, not the record's), so it cannot take a carried chunk's
 *  record for the identifiers an earlier compile of the preview changed.
 *  The rollback puts every identifier back and drops the overlay. */
interface PreviewOverlay {
  readonly undo: (() => void)[];
  typeNames?: ReadonlySet<string>;
}

interface BlockDefines {
  readonly held: readonly VariableAssignment[];
  under?: ReadonlySet<string>;
}

// The entry of every block that holds no define, which no classification
// writes to.
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
