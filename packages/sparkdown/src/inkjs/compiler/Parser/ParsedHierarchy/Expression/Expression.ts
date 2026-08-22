import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../engine/ControlCommand";
import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../engine/Object";

export abstract class Expression extends ParsedObject {
  public abstract GenerateIntoContainer: (container: RuntimeContainer) => void;

  public outputWhenComplete: boolean = false;

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    const container = new RuntimeContainer();

    // Tell Runtime to start evaluating the following content as an expression
    container.AddContent(RuntimeControlCommand.EvalStart());

    this.GenerateIntoContainer(container);

    // Tell Runtime to output the result of the expression evaluation to the output stream
    if (this.outputWhenComplete) {
      container.AddContent(RuntimeControlCommand.EvalOutput());
    }

    // Tell Runtime to stop evaluating the content as an expression
    container.AddContent(RuntimeControlCommand.EvalEnd());

    return container;
  };

  // (Constants used to be materialized here, once per reference site, by
  // copying a prototype of their runtime objects — each runtime object can
  // only have one parent, so the copy was unavoidable. That approach threw
  // outright for any initializer containing an operator, because
  // `NativeFunctionCall` implements no `Copy()`. Constants are now
  // initialized once as ordinary globals, so nothing needs copying.)

  get typeName(): string {
    return "Expression";
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public Equals(obj: ParsedObject): boolean {
    return false;
  }

  public readonly toString = () => "No string value in JavaScript.";

}
