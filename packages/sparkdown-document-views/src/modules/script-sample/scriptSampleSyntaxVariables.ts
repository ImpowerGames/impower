import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { highlightTree } from "@lezer/highlight";
import { ROLE_SYNTAX_VARIABLES } from "../../cm-script-appearance/scriptAppearance";
import type { ScriptAppearance } from "../../cm-script-appearance/scriptAppearanceOptions";
import { DIALOGUE_ROLE, isWithin, SPEAKER_ROLE } from "../../cm-script-roles/scriptRoles";
import EDITOR_HIGHLIGHTS from "../script-editor/constants/EDITOR_HIGHLIGHTS";

const VARIABLE_REFERENCE = /^var\((--syntax-[a-z-]+)\)$/;

export const TEXT_SYNTAX_VARIABLE = "--syntax-text";

const classVariables = new Map<string, { variable: string; order: number }>();
EDITOR_HIGHLIGHTS.specs.forEach((spec, order) => {
  const variable = typeof spec["color"] === "string" ? VARIABLE_REFERENCE.exec(spec["color"])?.[1] : undefined;
  const className = EDITOR_HIGHLIGHTS.style(Array.isArray(spec.tag) ? spec.tag : [spec.tag]);
  if (variable && className) {
    classVariables.set(className, { variable, order });
  }
});

export const HIGHLIGHT_SYNTAX_VARIABLES: readonly string[] = [
  ...new Set([...classVariables.values()].map(({ variable }) => variable)),
];

export const ROLE_VARIABLES: readonly string[] = Object.values(ROLE_SYNTAX_VARIABLES);

const variableOfClasses = (classes: string) => {
  let winner: { variable: string; order: number } | undefined;
  for (const className of classes.split(" ")) {
    const candidate = classVariables.get(className);
    if (candidate && (!winner || candidate.order > winner.order)) {
      winner = candidate;
    }
  }
  return winner?.variable;
};

export const scriptSampleSyntaxVariables = (
  state: EditorState,
  appearance: Pick<ScriptAppearance, "tintedDialogue">,
): ReadonlySet<string> => {
  const doc = state.doc;
  const tree = ensureSyntaxTree(state, doc.length, 5000);
  const rendered = new Set<string>();
  if (!tree) {
    return rendered;
  }
  const visible = (from: number, to: number) => /\S/.test(doc.sliceString(from, to));
  const roleRanges: { from: number; to: number }[] = [];
  const dialogueVariable = appearance.tintedDialogue
    ? ROLE_SYNTAX_VARIABLES.tintedDialogue
    : ROLE_SYNTAX_VARIABLES.dialogue;
  tree.iterate({
    enter: (ref) => {
      const variable = SPEAKER_ROLE.nodes.includes(ref.name)
        ? ROLE_SYNTAX_VARIABLES.speaker
        : DIALOGUE_ROLE.nodes.includes(ref.name) && isWithin(ref.node, DIALOGUE_ROLE.within ?? [])
          ? dialogueVariable
          : undefined;
      if (variable) {
        roleRanges.push({ from: ref.from, to: ref.to });
        if (visible(ref.from, ref.to)) {
          rendered.add(variable);
        }
      }
    },
  });
  const insideRole = (from: number, to: number) =>
    roleRanges.some((range) => range.from <= from && to <= range.to);
  let covered = 0;
  const addText = (from: number, to: number) => {
    if (from < to && !insideRole(from, to) && visible(from, to)) {
      rendered.add(TEXT_SYNTAX_VARIABLE);
    }
  };
  highlightTree(tree, EDITOR_HIGHLIGHTS, (from, to, classes) => {
    addText(covered, from);
    covered = to;
    if (insideRole(from, to) || !visible(from, to)) {
      return;
    }
    rendered.add(variableOfClasses(classes) ?? TEXT_SYNTAX_VARIABLE);
  });
  addText(covered, doc.length);
  return rendered;
};
