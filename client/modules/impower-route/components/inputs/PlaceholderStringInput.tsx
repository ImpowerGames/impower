import React from "react";
import InputHelperText from "./InputHelperText";
import { StringInputProps } from "./StringInput";
import TextField from "./TextField";

const PlaceholderStringInput = (
  props: StringInputProps
): JSX.Element | null => {
  const {
    errorText,
    helperText,
    countText,
    showCharacterCounter,
    characterCountLimit,
  } = props;
  const counterText =
    countText ||
    (showCharacterCounter ? `${0} / ${characterCountLimit}` : undefined);
  props.style = { flex: 1, ...(props.style || {}) };
  props.placeholder = "";
  props.helperText =
    !errorText && !helperText && !counterText ? undefined : (
      <InputHelperText
        errorText={errorText}
        helperText={helperText}
        counterText={counterText}
      />
    );
  return <TextField {...props} />;
};

export default PlaceholderStringInput;
