import React, { useCallback, useMemo, useRef } from "react";
import { StringDialogProps } from "../../impower-route/components/inputs/StringDialog";
import CreateKudoForm from "./CreateKudoForm";
import PitchDialog from "./PitchDialog";

export interface CreateKudoDialogProps
  extends Omit<StringDialogProps, "autoSave" | "onFocus"> {
  maxWidth?: number | string;
  defaultValue?: string;
  value?: string;
}

const CreateKudoDialog = React.memo(
  (props: CreateKudoDialogProps): JSX.Element => {
    const {
      open,
      defaultValue,
      value,
      placeholder,
      saveLabel,
      maxWidth,
      TransitionProps,
      onChange,
      onClose,
      ...dialogProps
    } = props;

    const wasEnteredRef = useRef<boolean>();

    const handleDialogClose = useCallback(
      (
        e: React.MouseEvent<Element, MouseEvent> | React.FocusEvent<Element>,
        reason: "backdropClick" | "escapeKeyDown"
      ) => {
        if (wasEnteredRef.current || reason !== "backdropClick") {
          if (onClose) {
            onClose(e);
          }
        }
      },
      [onClose]
    );

    const onEntered = TransitionProps?.onEntered;

    const handleEntered = useCallback(
      (node: HTMLElement, isAppearing: boolean): void => {
        if (onEntered) {
          onEntered(node, isAppearing);
        }
        window.setTimeout(() => {
          wasEnteredRef.current = true;
        }, 1);
      },
      [onEntered]
    );

    const DialogTransitionProps = useMemo(
      () => ({
        ...TransitionProps,
        onEntered: handleEntered,
      }),
      [TransitionProps, handleEntered]
    );

    return (
      <PitchDialog
        open={open}
        onClose={handleDialogClose}
        disableAutoFocus
        disableRestoreFocus
        TransitionProps={DialogTransitionProps}
        {...dialogProps}
      >
        <CreateKudoForm
          defaultValue={defaultValue}
          value={value}
          placeholder={placeholder}
          saveLabel={saveLabel}
          maxWidth={maxWidth}
          onChange={onChange}
          onClose={onClose}
        />
      </PitchDialog>
    );
  }
);

export default CreateKudoDialog;
