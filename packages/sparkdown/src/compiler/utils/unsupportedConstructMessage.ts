export const CHOICE_OUTSIDE_CHOOSE_MESSAGE =
  "Choice mark (`*` / `+`) must appear inside a `choose ... end` block. Wrap the choices in `choose` or remove the mark.";

export const FUNCTION_DIVERT = "a divert to a function";

export const functionDivertMessage = (name: string): string =>
  `A function can't be diverted to: call \`${name}\` instead, as \`& ${name}()\` on a line of its own or \`{${name}()}\` in a line.`;

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
      return "The `LIST` type is not supported: use a table.";
    default:
      return `This statement cannot be compiled: ${construct}.`;
  }
};
