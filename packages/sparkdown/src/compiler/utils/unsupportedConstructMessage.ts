/** The choice mark's error, which lowering reports for a choice written
 *  outside any `choose` block's code (`lowerChoice.ts`), and the program's
 *  build reports for one the lowering let through (a choice in an `if` of a
 *  choice's body with no `choose` of its own). */
export const CHOICE_OUTSIDE_CHOOSE_MESSAGE =
  "Choice mark (`*` / `+`) must appear inside a `choose ... end` block. Wrap the choices in `choose` or remove the mark.";

/** The construct a divert to a function names: a function is called, never
 *  diverted to (`Divert.EmitProgram`). */
export const FUNCTION_DIVERT = "a divert to a function";

/** The one error a divert to the function `name` reports, on its target
 *  (`Divert.ResolveWith`, #1708): the unsupported-construct message for
 *  `FUNCTION_DIVERT`, naming the function. */
export const functionDivertMessage = (name: string): string =>
  `A function can't be diverted to: call \`${name}\` instead, as \`& ${name}()\` on a line of its own or \`{${name}()}\` in a line.`;

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
    case FUNCTION_DIVERT:
      return "A function can't be diverted to: call it instead, as `& name()` on a line of its own or `{name()}` in a line.";
    case "list":
    case "List":
    case "ListDefinition":
    case "ListElementDefinition":
      return "The `LIST` type is not supported: use a table.";
    default:
      return `This statement cannot be compiled: ${construct}.`;
  }
};
