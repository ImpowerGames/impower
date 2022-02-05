import { FlowLevel } from "../../types/FlowLevel";
import { IStory } from "../../types/IStory";
import { ParsedFlowBase } from "./ParsedFlowBase";

export class ParsedKnot extends ParsedFlowBase {
  override get flowLevel(): FlowLevel {
    return FlowLevel.Knot;
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    const parentStory = this.story;

    // Enforce rule that stitches must not have the same
    // name as any knots that exist in the story
    Object.entries(this.subFlowsByName).forEach(([stitchName, stitch]) => {
      const knotWithStitchName = parentStory.ContentWithNameAtLevel(
        stitchName,
        FlowLevel.Knot,
        false
      );
      if (knotWithStitchName) {
        const errorMsg = `Stitch '${stitch.identifier}' has the same name as a knot (on ${knotWithStitchName.debugMetadata})`;
        this.Error(errorMsg, stitch);
      }
    });
  }
}
