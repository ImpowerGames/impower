import { ControlCommand as RuntimeControlCommand } from "../../../runtime/ControlCommand";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Wrap } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Wrap";

export function wrapInScope(body: ParsedObject[]): ParsedObject[] {
  return [
    new Wrap(RuntimeControlCommand.BeginScope()),
    ...body,
    new Wrap(RuntimeControlCommand.EndScope()),
  ];
}
