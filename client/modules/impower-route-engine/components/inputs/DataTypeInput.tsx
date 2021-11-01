import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import {
  OutlinedInput,
  Paper,
  Popper,
  Typography,
  useMediaQuery,
} from "@material-ui/core";
import {
  createFilterOptions,
  FilterOptionsState,
} from "@material-ui/core/useAutocomplete";
import match from "autosuggest-highlight/match";
import parse from "autosuggest-highlight/parse";
import React, { useCallback, useContext, useMemo } from "react";
import { orderBy } from "../../../impower-core";
import { DataType } from "../../../impower-game/data";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
import AutocompleteDialog from "../../../impower-route/components/inputs/AutocompleteDialog";
import AutocompleteInput from "../../../impower-route/components/inputs/AutocompleteInput";
import DataStringInput from "../../../impower-route/components/inputs/DataStringInput";
import VirtualizedAutocompleteGroup from "../../../impower-route/components/inputs/VirtualizedAutocompleteGroup";
import { GameInspectorContext } from "../../contexts/gameInspectorContext";

const StyledPopper = styled(Popper)`
  & .MuiPaper-root .MuiAutocomplete-listbox {
    padding-top: 0;
  }
`;

const StyledHiddenTextFieldSpacer = styled.div`
  line-height: ${(props): React.ReactText =>
    props.theme.typography.body1.lineHeight};
  font-weight: ${(props): React.ReactText => props.theme.fontWeight.semiBold};
  font-size: ${(props): React.ReactText =>
    props.theme.typography.body1.fontSize};
  letter-spacing: 0;
  padding: 0;
  white-space: nowrap;
  visibility: hidden;
`;

const StyledAutocompleteInput = styled.div`
  flex: 1 1 auto;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;

  display: flex;
  align-items: center;
`;

const StyledAutocomplete = styled(AutocompleteInput)<{
  adornment?: string;
}>`
  flex: 1;

  &
    .MuiAutocomplete-inputRoot[class*="MuiFilledInput-root"][class*="MuiFilledInput-marginDense"]
    .MuiAutocomplete-input {
    padding: 23.5px ${(props): number => (props.adornment ? 0 : 40)}px 5.5px
      12px;
  }
  &
    .MuiInputBase-root.MuiFilledInput-root.MuiFilledInput-underline.MuiAutocomplete-inputRoot.MuiInputBase-formControl.MuiInputBase-adornedEnd.MuiFilledInput-adornedEnd {
    padding: 0;
  }

  & .MuiInputBase-root {
    padding-top: 5px;
  }
`;

const StyledPlaceholderOption = styled.div`
  opacity: 0.5;
  display: flex;
  align-items: center;
`;

const StyledNoOptionsArea = styled.div`
  text-align: center;
`;

const StyledOption = styled.div`
  flex: 1;
  display: flex;
  justify-content: space-between;
  min-width: 0;
`;

const StyledOptionText = styled.div`
  white-space: pre;
  flex: 1;
  position: relative;
`;

const StyledOptionTextContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  overflow: hidden;
`;

const StyledOptionIconArea = styled.div`
  display: flex;
  align-items: center;
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const StyledTypography = styled(Typography)<{ component?: string }>`
  white-space: pre;
  min-width: 0;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 100%;
`;

const StyledLabelContent = styled.div`
  max-width: 100%;
  display: flex;
  min-width: 0;
`;

const StyledPaper = styled(Paper)`
  &.MuiAutocomplete-paper {
    border-radius: ${(props): string => props.theme.spacing(2)};
    margin-top: ${(props): string => props.theme.spacing(1)};
    margin-bottom: ${(props): string => props.theme.spacing(1)};
    margin-left: -${(props): string => props.theme.spacing(6)};
    margin-right: -${(props): string => props.theme.spacing(2)};
  }

  & .MuiAutocomplete-listbox {
    padding: 0;
  }
`;

interface DataTypeInputProps {
  label?: string;
  refType: DataType;
  refTypeId: string;
  onChange?: (refTypeId: string) => void;
}

const DataTypeInput = React.memo(
  (props: DataTypeInputProps): JSX.Element | null => {
    const { label, refType, refTypeId, onChange = (): void => null } = props;

    const { gameInspector } = useContext(GameInspectorContext);

    const [open, setOpen] = React.useState(true);
    const [state, setState] = React.useState(refTypeId);
    const selectedValue = React.useRef(refTypeId);

    const theme = useTheme();

    const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));
    const showFullscreen = belowSmBreakpoint;

    const inspectors = useMemo(
      () => gameInspector.getInspectors(refType),
      [refType, gameInspector]
    );

    const getOptionName = useCallback(
      (option: unknown) => {
        if (option) {
          const instanceInspector = inspectors[option as string];
          if (instanceInspector) {
            return instanceInspector.getTypeInfo().name;
          }
        }
        return "";
      },
      [inspectors]
    );
    const getOptionLabel = useCallback(
      (option: unknown) => {
        if (option === refTypeId) {
          return "";
        }
        if (option) {
          return getOptionName(option);
        }
        return "";
      },
      [getOptionName, refTypeId]
    );
    const groupBy = useCallback(
      (option: unknown): string => {
        if (option) {
          const instanceInspector = inspectors[option as string];
          if (instanceInspector) {
            return instanceInspector.getTypeInfo().category;
          }
        }
        return "";
      },
      [inspectors]
    );
    const options = useMemo(
      () => orderBy(Object.keys(inspectors), groupBy),
      [groupBy, inspectors]
    );
    const handleBlur = useCallback(
      (value) => {
        const match =
          selectedValue.current ||
          (inspectors[value]
            ? value
            : Object.entries(inspectors).find(
                ([, v]) => v.getTypeInfo().name === value
              )?.[0]);
        if (match) {
          if (onChange) {
            onChange(match);
          }
        }
      },
      [inspectors, onChange]
    );

    const placeholderLabel = getOptionName(refTypeId);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const defaultFilterOptions = useCallback(
      createFilterOptions({
        matchFrom: "start",
      }),
      []
    );
    const filterOptions = useCallback(
      (options: unknown[], state: FilterOptionsState<unknown>): unknown[] => {
        const modifiedState = { ...state, getOptionLabel: getOptionName };
        return defaultFilterOptions(options, modifiedState);
      },
      [defaultFilterOptions, getOptionName]
    );

    const renderOption = useCallback(
      (option, { inputValue, selected }): React.ReactNode => {
        if (option) {
          const instanceInspector = inspectors[option as string];
          if (instanceInspector) {
            const typeInfo = instanceInspector.getTypeInfo();
            const optionLabel = typeInfo.name;
            const matches = match(optionLabel, inputValue);
            const parts = parse(optionLabel, matches);
            return (
              <StyledOption>
                <StyledOptionIconArea>
                  <FontIcon
                    aria-label={typeInfo.name}
                    color={typeInfo.color}
                    size={theme.fontSize.smallIcon}
                  >
                    <DynamicIcon icon={typeInfo.icon} />
                  </FontIcon>
                </StyledOptionIconArea>
                <StyledOptionText>
                  <StyledOptionTextContent>
                    <StyledLabelContent>
                      {parts.map((part, index) => (
                        <StyledTypography
                          key={index} // eslint-disable-line react/no-array-index-key
                          style={{
                            fontSize: "0.938rem",
                            fontWeight:
                              selected ||
                              (part.highlight &&
                                optionLabel
                                  ?.toLowerCase()
                                  .startsWith(inputValue?.toLowerCase()))
                                ? 700
                                : inputValue
                                ? 400
                                : 600,
                          }}
                        >
                          {part.text}
                        </StyledTypography>
                      ))}
                    </StyledLabelContent>
                    {typeInfo.description && (
                      <StyledLabelContent>
                        <StyledTypography variant="caption" component="p">
                          {typeInfo.description}
                        </StyledTypography>
                      </StyledLabelContent>
                    )}
                  </StyledOptionTextContent>
                </StyledOptionText>
              </StyledOption>
            );
          }
        }
        return (
          <StyledPlaceholderOption>{placeholderLabel}</StyledPlaceholderOption>
        );
      },
      [inspectors, placeholderLabel, theme]
    );

    const handleGetOptionHeight = useCallback(() => {
      return 60;
    }, []);

    const handleRenderGroup = useCallback(
      (params): React.ReactNode => {
        return (
          <VirtualizedAutocompleteGroup
            {...params}
            getOptionHeight={handleGetOptionHeight}
          />
        );
      },
      [handleGetOptionHeight]
    );

    const renderInput = useCallback(
      (params): React.ReactNode => {
        return (
          <DataStringInput
            placeholder={placeholderLabel}
            defaultValue={refTypeId}
            onBlur={handleBlur}
            {...params}
            InputLabelProps={{
              shrink: true,
              disableAnimation: true,
            }}
          />
        );
      },
      [handleBlur, placeholderLabel, refTypeId]
    );

    const getMatchingOption = useMemo(
      () =>
        (inputValue: unknown): unknown => {
          const matchingOption = options.find(
            (option) =>
              option === inputValue || getOptionLabel(option) === inputValue
          );
          return matchingOption;
        },
      [options, getOptionLabel]
    );

    const handleChange = useCallback(
      async (_event, newValue, _reason, _details): Promise<boolean> => {
        const safeValue = getMatchingOption(newValue);
        if (safeValue !== undefined && typeof safeValue === "string") {
          selectedValue.current = safeValue;
          if (onChange) {
            onChange(safeValue);
          }
          setState(safeValue);
        }
        return true;
      },
      [onChange, getMatchingOption]
    );

    const handleClose = useCallback(() => {
      setOpen(false);
      if (onChange) {
        onChange(refTypeId);
      }
    }, [onChange, refTypeId]);

    const noOptionsText = useMemo(
      () => <StyledNoOptionsArea>{`No matches found`}</StyledNoOptionsArea>,
      []
    );

    return (
      <>
        <StyledHiddenTextFieldSpacer>
          {getOptionLabel(state)}
        </StyledHiddenTextFieldSpacer>
        <StyledAutocompleteInput>
          {!showFullscreen && (
            <StyledAutocomplete
              defaultValue={refTypeId}
              options={options}
              value={state}
              open
              PaperComponent={StyledPaper}
              getOptionLabel={getOptionLabel}
              renderOption={renderOption}
              renderGroup={handleRenderGroup}
              groupBy={groupBy}
              filterOptions={filterOptions}
              renderInput={renderInput}
              onChange={handleChange}
              PopperComponent={StyledPopper}
              InputComponent={OutlinedInput}
              autoComplete
              autoHighlight
              autoSelect
              handleHomeEndKeys
              selectOnFocus
              fullWidth
              freeSolo
              size="small"
            />
          )}
          {showFullscreen && (
            <>
              <DataStringInput
                placeholder={placeholderLabel}
                defaultValue={refTypeId}
                InputLabelProps={{
                  shrink: true,
                  disableAnimation: true,
                }}
                InputProps={{
                  readOnly: true,
                }}
              />
              <AutocompleteDialog
                defaultValue={refTypeId}
                label={label}
                options={options}
                value={state}
                forcePopupIcon={false}
                noOptionsText={noOptionsText}
                open={open}
                getOptionLabel={getOptionLabel}
                renderOption={renderOption}
                renderGroup={handleRenderGroup}
                groupBy={groupBy}
                filterOptions={filterOptions}
                onClose={handleClose}
                onChange={handleChange}
                handleHomeEndKeys
                freeSolo
              />
            </>
          )}
        </StyledAutocompleteInput>
      </>
    );
  }
);

export default DataTypeInput;
