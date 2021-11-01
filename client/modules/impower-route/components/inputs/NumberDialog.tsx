import styled from "@emotion/styled";
import { Mark, Slider } from "@material-ui/core";
import { TransitionHandlerProps } from "@material-ui/core/transitions";
import React, { useCallback, useEffect, useState } from "react";
import StringDialog, { StringDialogProps } from "./StringDialog";

const StyledSlider = styled(Slider)`
  flex: 1;
  margin: ${(props): string => props.theme.spacing(0, 1)};
`;

interface NumberDialogProps extends StringDialogProps {
  label?: string;
  value?: number;
  valueLabelDisplay?: "on" | "off" | "auto";
  max?: number;
  min?: number;
  step?: number | null;
  marks?: boolean | Mark[];
  onChange?: (event: React.ChangeEvent) => Promise<boolean>;
  renderHelperText?: (props: {
    errorText?: string;
    helperText?: React.ReactNode;
    counterText?: string;
  }) => React.ReactNode;
  onEnter?: TransitionHandlerProps["onEnter"];
}

const NumberDialog = React.memo((props: NumberDialogProps): JSX.Element => {
  const {
    label,
    value,
    valueLabelDisplay,
    max,
    min,
    step,
    marks,
    renderHelperText,
    onEnter,
  } = props;

  const [state, setState] = useState(Number(value));
  const [inputValue, setInputValue] = useState(value?.toString() || "");
  const [autoSaveEvent, setAutoSaveEvent] = useState<Event>();

  useEffect(() => {
    setState(Number(value));
    setInputValue(value?.toString() || "");
  }, [value]);

  const handleSliderChange = useCallback(
    (e: Event, newValue: number | number[]) => {
      setState(newValue as number);
      setInputValue(newValue.toString());
      setAutoSaveEvent(e);
    },
    []
  );

  const handleEnter = useCallback(
    (node: HTMLElement, isAppearing: boolean): void => {
      setState(Number(value));
      setInputValue(value?.toString() || "");
      setAutoSaveEvent(undefined);
      if (onEnter) {
        onEnter(node, isAppearing);
      }
    },
    [onEnter, value]
  );

  const handleRenderHelperText = useCallback(
    (props: {
      errorText: string;
      helperText: string;
      counterText: string;
    }): React.ReactNode => {
      return (
        <>
          {renderHelperText && renderHelperText(props)}
          <StyledSlider
            value={state}
            onChange={handleSliderChange}
            valueLabelDisplay={valueLabelDisplay}
            max={max}
            min={min}
            step={step}
            marks={marks}
            aria-label={label}
          />
        </>
      );
    },
    [
      handleSliderChange,
      label,
      marks,
      max,
      min,
      renderHelperText,
      state,
      step,
      valueLabelDisplay,
    ]
  );

  return (
    <StringDialog
      {...props}
      value={inputValue}
      autoSaveEvent={autoSaveEvent as unknown as React.ChangeEvent}
      autoSave
      renderHelperText={handleRenderHelperText}
      TransitionProps={{
        onEnter: handleEnter,
      }}
    />
  );
});

export default NumberDialog;
