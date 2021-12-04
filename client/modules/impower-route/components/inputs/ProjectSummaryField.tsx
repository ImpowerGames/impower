import styled from "@emotion/styled";
import { InputProps } from "@material-ui/core/Input";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectDocument } from "../../../impower-data-store";
import DataField, { RenderPropertyProps } from "./DataField";
import ProjectMainTagSelector from "./ProjectMainTagSelector";

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
  white-space: pre-wrap;
`;

const StyledMark = styled.mark`
  background-color: transparent;
  color: inherit;
`;

export interface ProjectGameSummaryFieldProps extends RenderPropertyProps {
  onChangeTags?: (tags: string[]) => void;
}

export const ProjectGameSummaryField = (
  props: ProjectSummaryFieldProps
): JSX.Element | null => {
  const { placeholder, data, onChangeTags } = props;
  const inspectedData = data?.[0] as ProjectDocument;
  const displayTagSelector = placeholder?.includes("{tag}");
  const SummaryInputProps: InputProps = useMemo(
    () =>
      displayTagSelector
        ? {
            startAdornment: (
              <ProjectMainTagSelector
                placeholder={placeholder}
                tags={inspectedData?.tags}
                onChangeTags={onChangeTags}
              />
            ),
            placeholder: "",
            style: {
              flexDirection: "column",
            },
          }
        : undefined,
    [displayTagSelector, onChangeTags, placeholder, inspectedData?.tags]
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
  const showPlaceholder = Boolean(inputValue) && inputValue?.endsWith(" must ");
  return (
    <StyledPlaceholderOverlay>
      <StyledMark style={inputMarkStyle}>{inputValue}</StyledMark>
      {showPlaceholder && <StyledMark>{placeholder}</StyledMark>}
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
  const { data } = props;

  const summary = data?.[0]?.summary as string;

  const [inputValue, setInputValue] = useState(summary);

  useEffect(() => {
    setInputValue(summary);
  }, [summary]);

  const handlePropertyInputChange = useCallback(
    async (propertyPath: string, value: string) => {
      if (propertyPath === "summary") {
        setInputValue(value);
      }
    },
    []
  );

  const placeholder = `(After a catalyst), (a flawed hero) must (overcome an obstacle) (and achieve a goal) (or else stakes).`;

  const SummaryInputProps: InputProps = useMemo(
    () => ({
      startAdornment: (
        <PlaceholderOverlay
          inputValue={inputValue}
          placeholder={`(overcome an obstacle) (and achieve a goal) (or else stakes).`}
        />
      ),
      style: {
        overflow: "hidden",
      },
    }),
    [inputValue]
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
      defaultValue={summary}
      onPropertyInputChange={handlePropertyInputChange}
      renderProperty={undefined}
      placeholder={placeholder}
    />
  );
};

export interface ProjectSummaryFieldProps extends RenderPropertyProps {
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
