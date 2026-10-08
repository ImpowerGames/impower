/** The choice mark's error, which lowering reports for a choice written
 *  outside any `choose` block's code (`lowerChoice.ts`), and the program's
 *  build reports for one the lowering let through (a choice in an `if` of a
 *  choice's body with no `choose` of its own). */
export const CHOICE_OUTSIDE_CHOOSE_MESSAGE =
  "Choice mark (`*` / `+`) must appear inside a `choose ... end` block. Wrap the choices in `choose` or remove the mark.";

/**
 * The error a compile reports at a statement that holds a construct the
 * program has no emit path for, named as the program's build names it
 * (`UnsupportedConstruct.construct`: a parsed class's `typeName`, a builtin's
 * name, or a phrase for a placement). Such a compile makes no program.
 */
export const unsupportedConstructMessage = (construct: string): string => {
  switch (construct) {
    case "Choice":
      return CHOICE_OUTSIDE_CHOOSE_MESSAGE;
    case "external":
    case "ExternalDeclaration":
      return "`external` functions are not supported: write the function in Sparkdown.";
    case "list":
    case "List":
    case "ListDefinition":
    case "ListElementDefinition":
      return "The `LIST` type is not supported: use a table.";
    default:
      return `This statement cannot be compiled: ${construct}.`;
  }
};
