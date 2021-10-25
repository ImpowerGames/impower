import React from "react";
import DataField, { RenderPropertyProps } from "./DataField";
import GameSummaryPreambleSelector from "./GameSummaryPreambleSelector";

export interface GameSummaryFieldProps extends RenderPropertyProps {
  tags: string[];
  onChangeTags?: (tags: string[]) => void;
}

export const GameSummaryField = (
  props: GameSummaryFieldProps
): JSX.Element | null => {
  const { placeholder, tags, onChangeTags } = props;

  return (
    <DataField
      {...props}
      renderProperty={undefined}
      InputProps={{
        startAdornment: (
          <GameSummaryPreambleSelector
            placeholder={placeholder}
            tags={tags}
            onChangeTags={onChangeTags}
          />
        ),
        placeholder: "",
        style: {
          flexDirection: "column",
        },
      }}
      DialogProps={{
        placeholder: "Description",
      }}
      inputProps={{
        autoCapitalize: "none",
      }}
    />
  );
};

export default GameSummaryField;
