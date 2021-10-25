import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Checkbox from "@material-ui/core/Checkbox";
import FilledInput from "@material-ui/core/FilledInput";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useEffect, useState } from "react";
import { capitalize } from "../../../impower-config";
import DynamicLoadingButton from "../inputs/DynamicLoadingButton";
import TextField from "../inputs/TextField";
import PhraseDialog from "./PhraseDialog";

const StyledDialogButton = styled(Button)``;

const StyledLoadingDialogButton = styled(DynamicLoadingButton)``;

const StyledTagsArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
`;

const StyledPersonalizeArea = styled.div`
  display: flex;
  padding-top: ${(props): string => props.theme.spacing(2)};
`;

const StyledTagTypography = styled(Typography)`
  margin: ${(props): string => props.theme.spacing(0, 0.5)};
`;

const StyledTextField = styled(TextField)`
  margin-bottom: ${(props): string => props.theme.spacing(1)};

  & .MuiFilledInput-input {
    padding: ${(props): string => props.theme.spacing(2, 2)};
  }
`;

interface PhraseSuggestionDialogProps {
  open: boolean;
  defaultSuggestion?: string;
  tags?: string[];
  selectedTags?: string[];
  onClose?: () => void;
  onSubmit?: (phrase: string, personalize: boolean) => Promise<string>;
}

const PhraseSuggestionDialog = React.memo(
  (props: PhraseSuggestionDialogProps) => {
    const { open, defaultSuggestion, tags, selectedTags, onClose, onSubmit } =
      props;
    const [submittingSuggestion, setSubmittingSuggestion] = useState(false);
    const [phraseSuggestion, setPhraseSuggestion] = useState("");
    const [personalize, setPersonalize] = useState(true);
    const [inputEl, setInputEl] = useState<HTMLInputElement>();
    const [error, setError] = useState<string>();

    const handlePhraseSuggestionChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { value } = e.target;
        setPhraseSuggestion(value);
      },
      []
    );

    const handleSubmitSuggestion = useCallback(async (): Promise<void> => {
      setSubmittingSuggestion(true);
      const suggestedPhrase = phraseSuggestion;
      const error = onSubmit
        ? await onSubmit(suggestedPhrase, personalize)
        : undefined;
      setError(error);
      setSubmittingSuggestion(false);
    }, [phraseSuggestion, onSubmit, personalize]);

    const handleCancelSuggestion = useCallback(() => {
      if (!submittingSuggestion) {
        if (onClose) {
          onClose();
        }
      }
    }, [onClose, submittingSuggestion]);

    const handleEnter = useCallback(() => {
      setError(undefined);
      setSubmittingSuggestion(false);
      setPhraseSuggestion(defaultSuggestion || "");
    }, [defaultSuggestion]);

    const handleEntered = useCallback(() => {
      if (inputEl) {
        inputEl.focus();
      }
    }, [inputEl]);

    const handleInputRef = useCallback((instance: HTMLInputElement) => {
      setInputEl(instance);
      if (instance) {
        instance.focus();
      }
    }, []);

    useEffect(() => {
      setPhraseSuggestion(defaultSuggestion || "");
    }, [defaultSuggestion]);

    const suggestingNewPhrase = !defaultSuggestion;

    const title = suggestingNewPhrase
      ? `Suggest A New Phrase`
      : `Suggest An Edit`;

    return (
      <PhraseDialog
        open={open}
        onClose={onClose}
        TransitionProps={{
          onEnter: handleEnter,
          onEntered: handleEntered,
        }}
        title={title}
        content={
          <>
            <StyledTextField
              inputRef={handleInputRef}
              disabled={submittingSuggestion}
              variant="filled"
              InputComponent={FilledInput}
              value={phraseSuggestion}
              error={Boolean(error)}
              helperText={error}
              fullWidth
              onChange={handlePhraseSuggestionChange}
            />
            {tags && (
              <StyledTagsArea>
                {tags.map((tag, index) => {
                  const selected = selectedTags?.includes(tag);
                  return (
                    <StyledTagTypography
                      key={tag}
                      style={{ fontWeight: selected ? 700 : undefined }}
                      variant="caption"
                    >
                      {capitalize(tag)}
                      {index < tags.length - 1 && `, `}
                    </StyledTagTypography>
                  );
                })}
              </StyledTagsArea>
            )}
            <StyledPersonalizeArea>
              <FormControlLabel
                control={
                  <Checkbox
                    color="primary"
                    checked={personalize}
                    onChange={(_event, checked): void =>
                      setPersonalize(checked)
                    }
                  />
                }
                label={
                  suggestingNewPhrase
                    ? `Add the phrase to my personalized list for the selected tags`
                    : `Adjust the phrase in my personalized list`
                }
              />
            </StyledPersonalizeArea>
          </>
        }
        actions={
          <>
            <StyledDialogButton
              disabled={submittingSuggestion}
              onClick={handleCancelSuggestion}
              color="primary"
            >
              {`Cancel`}
            </StyledDialogButton>
            <StyledLoadingDialogButton
              loading={submittingSuggestion}
              disabled={!phraseSuggestion}
              onClick={handleSubmitSuggestion}
              color="primary"
            >
              {`Submit`}
            </StyledLoadingDialogButton>
          </>
        }
      />
    );
  }
);

export default PhraseSuggestionDialog;
