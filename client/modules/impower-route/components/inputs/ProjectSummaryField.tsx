import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import { InputProps } from "@material-ui/core/Input";
import React, { useCallback, useMemo, useRef, useState } from "react";
import DiceFiveSolidIcon from "../../../../resources/icons/solid/dice-five.svg";
import format from "../../../impower-config/utils/format";
import { getRandomizedStorySetup } from "../../../impower-config/utils/getRandomizedStorySetup";
import { FontIcon } from "../../../impower-icon";
import RotateAnimation from "../animations/RotateAnimation";
import DataField, { RenderPropertyProps } from "./DataField";
import ProjectSummaryPreambleTagSelector from "./ProjectSummaryPreambleTagSelector";

const StyledMotionArea = styled.div`
  pointer-events: auto;
`;

const StyledRandomizeButton = styled(Button)`
  color: ${(props): string => props.theme.palette.text.primary};
  min-width: 0;
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledPlaceholderOverlay = styled.div`
  padding: inherit;
  line-height: inherit;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  height: fit-content;
  pointer-events: none;
  color: ${(props): string => props.theme.colors.black40};
  margin-right: 36px;
  white-space: pre-wrap;
`;

const StyledMark = styled.mark`
  background-color: transparent;
  color: inherit;
`;

export interface ProjectGameSummaryFieldProps extends RenderPropertyProps {
  tags: string[];
  onChangeTags?: (tags: string[]) => void;
}

export const ProjectGameSummaryField = (
  props: ProjectSummaryFieldProps
): JSX.Element | null => {
  const { placeholder, tags, onChangeTags } = props;
  const displayTagSelector = placeholder?.includes("{tag}");
  const SummaryInputProps: InputProps = useMemo(
    () =>
      displayTagSelector
        ? {
            startAdornment: (
              <ProjectSummaryPreambleTagSelector
                placeholder={placeholder}
                tags={tags}
                onChangeTags={onChangeTags}
              />
            ),
            placeholder: "",
            style: {
              flexDirection: "column",
            },
          }
        : undefined,
    [displayTagSelector, onChangeTags, placeholder, tags]
  );
  const SummaryDialogProps = useMemo(
    () => ({
      placeholder: "Description",
    }),
    []
  );
  const summaryInputProps = useMemo(
    () =>
      displayTagSelector
        ? {
            autoCapitalize: "none",
          }
        : undefined,
    [displayTagSelector]
  );
  return (
    <DataField
      {...props}
      renderProperty={undefined}
      InputProps={SummaryInputProps}
      DialogProps={SummaryDialogProps}
      inputProps={summaryInputProps}
    />
  );
};

export interface PlaceholderOverlayProps {
  placeholder?: string;
  inputValue?: string;
}

export const PlaceholderOverlay = (
  props: PlaceholderOverlayProps
): JSX.Element | null => {
  const { placeholder, inputValue } = props;
  const inputMarkStyle = useMemo(() => ({ opacity: 0 }), []);
  return (
    <StyledPlaceholderOverlay>
      <StyledMark style={inputMarkStyle}>{inputValue}</StyledMark>
      <StyledMark>{placeholder}</StyledMark>
    </StyledPlaceholderOverlay>
  );
};

export interface ProjectStorySummaryFieldProps extends RenderPropertyProps {
  tags: string[];
  onChangeTags?: (tags: string[]) => void;
}

export const ProjectStorySummaryField = (
  props: ProjectSummaryFieldProps
): JSX.Element | null => {
  const {
    propertyPath,
    data,
    onPropertyInputChange,
    onPropertyChange,
    onDebouncedPropertyChange,
  } = props;

  const summary = data?.[0]?.summary as string;

  const [defaultValue, setDefaultValue] = useState("");
  const [inputValue, setInputValue] = useState(summary);
  const [rotation, setRotation] = useState(0);
  const recentlyRandomizedTags = useRef(new Set<string>());

  const disabled = Boolean(inputValue) && !inputValue?.includes(" must ");
  const showPlaceholder = Boolean(inputValue) && inputValue?.endsWith(" must ");

  const handlePointerDown = useCallback((): void => {
    setRotation(rotation + 180);
  }, [rotation]);
  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const parts = inputValue.split(" must ");
      const currentSuffix = parts[1] || "";
      let newRandomizedTags = await getRandomizedStorySetup(
        [],
        Array.from(recentlyRandomizedTags.current)
      );
      if (!newRandomizedTags) {
        recentlyRandomizedTags.current.clear();
        newRandomizedTags = await getRandomizedStorySetup(
          Array.from(recentlyRandomizedTags.current)
        );
      }
      if (!newRandomizedTags) {
        return;
      }
      newRandomizedTags.forEach((tag) => {
        recentlyRandomizedTags.current.add(tag);
      });
      const tags = [...newRandomizedTags];
      const newPrefix = format(
        `After {catalyst}, {personality:regex:a} {personality} {archetype} must`,
        {
          catalyst: tags[0],
          personality: tags[1],
          archetype: tags[2],
        }
      );
      const newValue = `${newPrefix} ${currentSuffix}`;
      setDefaultValue(newValue);
      setInputValue(newValue);
      if (onPropertyInputChange) {
        onPropertyInputChange(propertyPath, newValue);
      }
      if (onPropertyChange) {
        onPropertyChange(propertyPath, newValue);
      }
      if (onDebouncedPropertyChange) {
        onDebouncedPropertyChange(propertyPath, newValue);
      }
    },
    [
      onDebouncedPropertyChange,
      onPropertyChange,
      onPropertyInputChange,
      propertyPath,
      inputValue,
    ]
  );
  const handlePropertyInputChange = useCallback(
    async (propertyPath: string, value: string) => {
      if (propertyPath === "summary") {
        setInputValue(value);
      }
    },
    []
  );

  const SummaryInputProps: InputProps = useMemo(
    () => ({
      startAdornment: (
        <PlaceholderOverlay
          inputValue={inputValue}
          placeholder={
            showPlaceholder
              ? `(overcome an obstacle) (and achieve a goal) (or else stakes).`
              : undefined
          }
        />
      ),
      endAdornment: (
        <StyledMotionArea
          onPointerDown={handlePointerDown}
          style={{ pointerEvents: disabled ? "none" : undefined }}
        >
          <StyledRandomizeButton
            size="large"
            disabled={disabled}
            onClick={handleClick}
          >
            <RotateAnimation
              initial={0}
              animate={rotation}
              style={{ position: "relative" }}
            >
              <FontIcon
                aria-label={`Randomize`}
                size={20}
                color="rgba(0, 0, 0, 0.5)"
              >
                <DiceFiveSolidIcon />
              </FontIcon>
            </RotateAnimation>
          </StyledRandomizeButton>
        </StyledMotionArea>
      ),
      style: {
        overflow: "hidden",
      },
    }),
    [
      disabled,
      handleClick,
      handlePointerDown,
      inputValue,
      rotation,
      showPlaceholder,
    ]
  );
  const SummaryDialogProps = useMemo(
    () => ({
      placeholder: "Description",
    }),
    []
  );

  return (
    <DataField
      {...props}
      InputProps={SummaryInputProps}
      DialogProps={SummaryDialogProps}
      defaultValue={defaultValue}
      onPropertyInputChange={handlePropertyInputChange}
      renderProperty={undefined}
    />
  );
};

export interface ProjectSummaryFieldProps extends RenderPropertyProps {
  tags: string[];
  onChangeTags?: (tags: string[]) => void;
}

export const ProjectSummaryField = (
  props: ProjectSummaryFieldProps
): JSX.Element | null => {
  const { data } = props;
  const projectType = data?.[0]?.projectType;
  if (projectType === "story") {
    return <ProjectStorySummaryField {...props} />;
  }
  return <ProjectGameSummaryField {...props} />;
};

export default ProjectSummaryField;
