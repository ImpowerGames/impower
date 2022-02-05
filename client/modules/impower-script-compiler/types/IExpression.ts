import { Container } from "../../impower-script-engine";
import { IObject } from "./IObject";

export interface IExpression extends IObject {
  outputWhenComplete: boolean;
  GenerateConstantIntoContainer: (container: Container) => void;
  GenerateIntoContainer: (container: Container) => void;
  Equals: (obj: unknown) => boolean;
}
