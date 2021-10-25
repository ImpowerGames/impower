import dynamic from "next/dynamic";
import React, { useCallback, useState } from "react";
import EyeDropperSolidIcon from "../../../../resources/icons/solid/eye-dropper.svg";
import { Color, hslaToHex } from "../../../impower-core";
import { useDialogNavigation } from "../../../impower-dialog";
import PreviewButton from "./PreviewButton";

const ColorPickerDialog = dynamic(() => import("./ColorPickerDialog"), {
  ssr: false,
});

interface ColorMiniPreviewProps {
  value?: Color;
  interactable?: boolean;
  debounceInterval?: number;
  style?: React.CSSProperties;
  onChange?: (e: React.ChangeEvent, value?: Color) => void;
  onDebouncedChange?: (value: Color) => void;
}

const ColorMiniPreview = React.memo(
  (props: ColorMiniPreviewProps): JSX.Element => {
    const {
      value,
      interactable,
      debounceInterval,
      style,
      onChange,
      onDebouncedChange,
    } = props;

    const [pickerDialogOpen, setPickerDialogOpen] = useState<boolean>();

    const tooltip = interactable ? "Open Color Picker" : undefined;
    const icon = interactable ? <EyeDropperSolidIcon /> : undefined;
    const backgroundColor = hslaToHex(value);

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.i !== prevState?.i) {
          setPickerDialogOpen(currState?.i === "picker");
        }
      },
      []
    );
    const [openInfoDialog, closeInfoDialog] = useDialogNavigation(
      "i",
      handleBrowserNavigation
    );

    const handleOpenPicker = useCallback((): void => {
      setPickerDialogOpen(true);
      openInfoDialog("picker");
    }, [openInfoDialog]);

    const handleClosePicker = useCallback((): void => {
      setPickerDialogOpen(false);
      closeInfoDialog();
    }, [closeInfoDialog]);

    return (
      <>
        <PreviewButton
          icon={icon}
          tooltip={tooltip}
          backgroundColor={backgroundColor}
          stroke
          onClick={handleOpenPicker}
          style={style}
        />
        {pickerDialogOpen !== undefined && interactable && (
          <ColorPickerDialog
            open={pickerDialogOpen}
            color={value}
            debounceInterval={debounceInterval}
            onClose={handleClosePicker}
            onChange={onChange}
            onDebouncedChange={onDebouncedChange}
          />
        )}
      </>
    );
  }
);

export default ColorMiniPreview;
