import { getRuntimeString } from "../../../sparkdown";
import { statusState } from "../state/statusState";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";

/**
 * Approximates length of the screenplay based on the overall length of dialogue and action tokens
 */
export const updateStatus = (
  lengthAction: number,
  lengthDialogue: number
): void => {
  performance.mark("updateStatus-start");
  if (statusState.durationStatus) {
    if (getActiveSparkdownDocument()) {
      statusState.durationStatus.show();
      //lengthDialogue is in syllables, lengthAction is in characters
      const durationDialogue = lengthDialogue;
      const durationAction = lengthAction;
      statusState.durationStatus.tooltip =
        "Dialogue: " +
        getRuntimeString(durationDialogue) +
        "\nAction: " +
        getRuntimeString(durationAction);
      statusState.durationStatus.text = getRuntimeString(
        durationDialogue + durationAction
      );
    } else {
      statusState.durationStatus.hide();
    }
  }
  performance.mark("updateStatus-end");
  performance.measure("updateStatus", "updateStatus-start", "updateStatus-end");
};
