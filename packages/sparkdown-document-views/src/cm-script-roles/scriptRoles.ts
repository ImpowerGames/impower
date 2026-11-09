import { syntaxTree } from "@codemirror/language";
import { Facet, Prec, Range } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

interface ScriptRole {
  readonly className: string;
  readonly nodes: readonly string[];
  readonly within?: readonly string[];
}

export const SPEAKER_ROLE: ScriptRole = {
  className: "cm-role-speaker",
  nodes: ["DialogueCharacterName"],
};

export const DIALOGUE_ROLE: ScriptRole = {
  className: "cm-role-dialogue",
  nodes: ["TextChunk"],
  within: ["BlockDialogue", "InlineDialogue"],
};

export const DECLARED_NAME_ROLE: ScriptRole = {
  className: "cm-role-declared",
  nodes: [
    "SceneDeclarationName",
    "BranchDeclarationName",
    "LabelDeclarationName",
    "LuauDefineName",
    "LuauFunctionDeclarationName",
  ],
};

export const scriptRole = Facet.define<ScriptRole>();

export const isWithin = (node: SyntaxNode, names: readonly string[]) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (names.includes(parent.name)) {
      return true;
    }
  }
  return false;
};

const buildRoleMarks = (view: EditorView): DecorationSet => {
  const roles = view.state.facet(scriptRole);
  if (roles.length === 0) {
    return Decoration.none;
  }
  const rolesByNode = new Map<string, { role: ScriptRole; mark: Decoration }[]>();
  for (const role of roles) {
    const mark = Decoration.mark({ class: role.className });
    for (const name of role.nodes) {
      const entries = rolesByNode.get(name) ?? [];
      entries.push({ role, mark });
      rolesByNode.set(name, entries);
    }
  }
  const tree = syntaxTree(view.state);
  const marks: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (ref) => {
        const entries = rolesByNode.get(ref.name);
        if (!entries) {
          return;
        }
        const start = Math.max(ref.from, from);
        const end = Math.min(ref.to, to);
        if (start >= end) {
          return;
        }
        for (const { role, mark } of entries) {
          if (!role.within || isWithin(ref.node, role.within)) {
            marks.push(mark.range(start, end));
          }
        }
      },
    });
  }
  return Decoration.set(marks, true);
};

const scriptRoleMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildRoleMarks(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state) ||
        update.startState.facet(scriptRole) !== update.state.facet(scriptRole)
      ) {
        this.decorations = buildRoleMarks(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export const scriptRoles = () => [
  scriptRole.of(SPEAKER_ROLE),
  scriptRole.of(DIALOGUE_ROLE),
  Prec.highest(scriptRoleMarks),
];
