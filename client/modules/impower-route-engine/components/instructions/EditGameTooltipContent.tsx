import React from "react";
import TrianglePersonDiggingRegularIcon from "../../../../resources/icons/regular/triangle-person-digging.svg";
import { FontIcon } from "../../../impower-icon";
import { instructions, InstructionType } from "../../types/info/instructions";
import InstructionTooltipContent from "./InstructionTooltipContent";

const EditGameTooltipContent = (): JSX.Element => {
  return (
    <InstructionTooltipContent
      instruction={instructions[InstructionType.CannotEdit]}
    >
      <FontIcon aria-label="Edit Game" size={12}>
        <TrianglePersonDiggingRegularIcon />
      </FontIcon>
    </InstructionTooltipContent>
  );
};

export default EditGameTooltipContent;
