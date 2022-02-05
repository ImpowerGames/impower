import {
  Container,
  ControlCommand,
  DivertTargetValue,
  RuntimeObject,
  Void,
} from "../../../impower-script-engine";
import { IDivert } from "../../types/IDivert";
import { IStory } from "../../types/IStory";
import { ParsedObject } from "./ParsedObject";

export class ParsedTunnelOnwards extends ParsedObject {
  private _divertAfter: IDivert;

  private _overrideDivertTarget: DivertTargetValue;

  get divertAfter(): IDivert {
    return this._divertAfter;
  }

  set divertAfter(value: IDivert) {
    this._divertAfter = value;
    if (this._divertAfter) {
      this.AddContent(this._divertAfter);
    }
  }

  override GenerateRuntimeObject(): RuntimeObject {
    const container = new Container();

    // Set override path for tunnel onwards (or nothing)
    container.AddContent(ControlCommand.EvalStart());

    if (this.divertAfter) {
      // Generate runtime object's generated code and steal the arguments runtime code
      const returnRuntimeObj = this.divertAfter.GenerateRuntimeObject();
      const returnRuntimeContainer = returnRuntimeObj as Container;
      if (returnRuntimeContainer) {
        // Steal all code for generating arguments from the divert
        const args = this.divertAfter.arguments;
        if (args != null && args.length > 0) {
          // Steal everything betwen eval start and eval end
          let evalStart = -1;
          let evalEnd = -1;
          for (let i = 0; i < returnRuntimeContainer.content.length; i += 1) {
            const cmd = returnRuntimeContainer.content[i] as ControlCommand;
            if (cmd) {
              if (evalStart === -1 && cmd.commandType === "EvalStart") {
                evalStart = i;
              } else if (cmd.commandType === "EvalEnd") {
                evalEnd = i;
              }
            }
          }

          for (let i = evalStart + 1; i < evalEnd; i += 1) {
            const obj = returnRuntimeContainer.content[i];
            obj.parent = null; // prevent error of being moved between owners
            container.AddContent(returnRuntimeContainer.content[i]);
          }
        }
      }

      // Finally, divert to the requested target
      this._overrideDivertTarget = new DivertTargetValue();
      container.AddContent(this._overrideDivertTarget);
    }

    // No divert after tunnel onwards
    else {
      container.AddContent(new Void());
    }

    container.AddContent(ControlCommand.EvalEnd());

    container.AddContent(ControlCommand.PopTunnel());

    return container;
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    if (this.divertAfter && this.divertAfter.targetContent)
      this._overrideDivertTarget.targetPath =
        this.divertAfter.targetContent.runtimePath;
  }
}
