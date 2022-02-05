import { FlowLevel } from "../../types/FlowLevel";
import { ParsedFlowBase } from "./ParsedFlowBase";

export class ParsedStitch extends ParsedFlowBase {
  override get flowLevel(): FlowLevel {
    return FlowLevel.Stitch;
  }
}
