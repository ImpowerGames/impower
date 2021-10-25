import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Checkbox from "@material-ui/core/Checkbox";
import FormControl from "@material-ui/core/FormControl";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import Select, { SelectChangeEvent } from "@material-ui/core/Select";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useMemo, useState } from "react";
import { capitalize } from "../../../impower-config";
import { DislikeReason } from "../../../impower-data-store";
import DynamicLoadingButton from "../inputs/DynamicLoadingButton";
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

const StyledFormControl = styled(FormControl)`
  margin-bottom: ${(props): string => props.theme.spacing(1)};

  & label {
    margin-right: -${(props): string => props.theme.spacing(6)};
  }
`;

const StyledSelect = styled(Select)`
  & .MuiFilledInput-input {
    padding-top: ${(props): string => props.theme.spacing(4)};
  }
`;

const StyledTagTypography = styled(Typography)`
  margin: ${(props): string => props.theme.spacing(0, 0.5)};
`;

interface PhraseReportDialogProps {
  open: boolean;
  phrase: string;
  tags?: string[];
  selectedTags?: string[];
  onClose?: () => void;
  onSubmit?: (
    e: React.MouseEvent,
    reason: string,
    personalize: boolean
  ) => void;
}

const PhraseReportDialog = React.memo((props: PhraseReportDialogProps) => {
  const { open, phrase, tags, selectedTags, onClose, onSubmit } = props;

  const reasons = useMemo(
    (): { [key in DislikeReason]: string } => ({
      unfamiliar: `I've never heard of this expression`,
      irrelevant: `It's not relevant to the selected tags`,
      duplicate: `A similar phrase already exists`,
      inappropriate: `It's offensive or inappropriate`,
      other: "Other",
    }),
    []
  );

  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);
  const [personalize, setPersonalize] = useState(true);
  const [reason, setReason] = useState<string>(Object.keys(reasons)[0]);

  const handleCancelSuggestion = useCallback(() => {
    if (!submittingSuggestion) {
      if (onClose) {
        onClose();
      }
    }
  }, [onClose, submittingSuggestion]);

  const handleEnter = useCallback(() => {
    setSubmittingSuggestion(false);
    setPersonalize(true);
    setReason(Object.keys(reasons)[0]);
  }, [reasons]);

  const handleChange = useCallback((e: SelectChangeEvent<string>) => {
    const { value } = e.target;
    setReason(value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.MouseEvent) => {
      if (onSubmit) {
        onSubmit(e, reason, personalize);
      }
    },
    [onSubmit, personalize, reason]
  );

  return (
    <PhraseDialog
      open={open}
      onClose={onClose}
      TransitionProps={{ onEnter: handleEnter }}
      title={`"${phrase}"`}
      content={
        <>
          <StyledFormControl variant="filled" size="medium">
            <InputLabel
              id="reason-label"
              shrink
            >{`What's wrong with this phrase?`}</InputLabel>
            <StyledSelect
              labelId="reason-label"
              disabled={submittingSuggestion}
              value={reason}
              fullWidth
              onChange={handleChange}
            >
              {Object.entries(reasons).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </StyledSelect>
          </StyledFormControl>
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
                  onChange={(_event, checked): void => setPersonalize(checked)}
                />
              }
              label={
                reason === DislikeReason.Irrelevant
                  ? `Never suggest this phrase to me for the selected tags`
                  : `Never suggest this phrase to me`
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
            onClick={handleSubmit}
            color="primary"
            autoFocus
          >
            {`Submit`}
          </StyledLoadingDialogButton>
        </>
      }
    />
  );
});

export default PhraseReportDialog;
