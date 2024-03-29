import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import MobileStepper from "@mui/material/MobileStepper";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import XmarkSolidIcon from "../../../../resources/icons/solid/xmark.svg";
import Logo from "../../../../resources/logos/logo-flat-color.svg";
import {
  DataDocument,
  getValue,
  Inspector,
  isCollection,
} from "../../../impower-core";
import { FontIcon } from "../../../impower-icon";
import PeerTransition from "../animations/PeerTransition";
import AutocompleteInput from "../inputs/AutocompleteInput";
import { RenderPropertyProps } from "../inputs/DataField";
import RadioInput from "../inputs/RadioInput";
import StringInput from "../inputs/StringInput";
import InspectorForm, { InspectorFormProps } from "./InspectorForm";

const unsuccessfulTitle = "Looks like something went wrong";
const unsuccessfulDescription = "Please try again later";

export interface CreationStep {
  title?: string;
  propertyPaths?: string[];
  description?: string;
  preview?: boolean;
  headerChildren?: React.ReactNode;
  footerChildren?: React.ReactNode;
}

const StyledMobileStepper = styled(MobileStepper)`
  position: relative;
  padding: ${(props): string => props.theme.spacing(0, 2)};
  background: none;

  & .MuiPaper-root {
    background-color: transparent;
  }
`;

const StyledLogo = styled(Logo)`
  width: 40px;
  height: 40px;
`;

const StyledDocumentForm = styled(Paper)`
  position: relative;
  flex: 1;
  display: flex;
  ${(props): string => props.theme.breakpoints.down("md")} {
    box-shadow: none;
    border-radius: 0;
  }
`;

const StyledContainer = styled.div<{ bgcolor?: string }>`
  flex: 1;
  display: flex;
  flex-direction: column;

  padding-bottom: ${(props): string => props.theme.spacing(4)};

  padding-top: ${(props): string => props.theme.spacing(9)};
  padding-left: ${(props): string => props.theme.spacing(4)};
  padding-right: ${(props): string => props.theme.spacing(4)};

  ${(props): string => props.theme.breakpoints.down("md")} {
    padding-top: ${(props): string => props.theme.spacing(8)};
    padding-left: ${(props): string => props.theme.spacing(2)};
    padding-right: ${(props): string => props.theme.spacing(2)};
  }
  width: 100%;
  max-width: 100%;
  width: 448px;
  position: relative;

  background-color: ${(props): string => props.bgcolor};
`;

const StyledHeader = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
  display: flex;
  pointer-events: none;
  z-index: 2;
  padding-top: ${(props): string => props.theme.spacing(2.5)};
  padding-bottom: ${(props): string => props.theme.spacing(0.5)};
  min-height: ${(props): string => props.theme.spacing(7)};

  justify-content: flex-end;
  padding-left: ${(props): string => props.theme.spacing(2)};
  padding-right: ${(props): string => props.theme.spacing(2)};

  ${(props): string => props.theme.breakpoints.down("md")} {
    justify-content: flex-start;
    justify-content: flex-start;
    padding-left: ${(props): string => props.theme.spacing(1)};
    padding-right: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledMiddleArea = styled.div`
  padding-top: ${(props): string => props.theme.spacing(2.5)};
  padding-bottom: ${(props): string => props.theme.spacing(0.5)};
  width: 100%;
  display: flex;
  pointer-events: none;
  justify-content: center;
  align-items: center;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

const StyledHeaderTitleArea = styled.div``;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1, 0)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
`;

const StyledDescriptionTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1, 0)};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  font-size: 1.125rem;
`;

const StyledSpacer = styled.div`
  min-height: ${(props): string => props.theme.spacing(1)};
`;

const StyledDivider = styled(Divider)`
  margin: ${(props): string => props.theme.spacing(0.5, 0)};
  width: 100%;
`;

const StyledForegroundArea = styled.div`
  flex: 2;
  display: flex;
  flex-direction: column;
  max-width: 100%;
  min-height: ${(props): string => props.theme.spacing(59)};

  ${(props): string => props.theme.breakpoints.down("md")} {
    min-height: 0;
  }
`;

const StyledContentArea = styled.div`
  flex: 1;
  display: flex;
  position: relative;
`;

const StyledFormArea = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledIconButton = styled(IconButton)`
  pointer-events: auto;
  z-index: 1;
`;

export interface CreateDocumentFormProps<T = DataDocument>
  extends Omit<
    InspectorFormProps,
    "data" | "onChange" | "onSubmit" | "getInspector"
  > {
  step?: number;
  steps: CreationStep[];
  docId: string;
  doc: T;
  skipLabel: string;
  backLabel: string;
  nextLabel: string;
  doneLabel: string;
  showErrors?: boolean;
  errors?: { [propertyPath: string]: string };
  preview?: React.ReactNode;
  finishedSummary?: React.ReactNode;
  renderProperty?: (props: RenderPropertyProps) => React.ReactNode;
  renderPropertyProps?: Record<string, unknown>;
  getInspector: (data: T) => Inspector<T>;
  onClose: (
    e: React.MouseEvent,
    reason: "backdropClick" | "escapeKeyDown" | "closeButtonClick" | "submitted"
  ) => void;
  onChange: (doc: T) => void;
  onStep?: (e: React.MouseEvent, step: number, doc?: T) => Promise<boolean>;
  onSubmit: (
    e: React.FormEvent | React.MouseEvent,
    id: string,
    doc: T
  ) => Promise<boolean>;
  onSubmitted?: (id: string, doc: T, successful: boolean) => void;
  onPropertyChange?: (propertyPath: string, value: unknown) => void;
  onPropertyErrorFound?: (propertyPath: string, value: unknown) => void;
  onPropertyErrorFixed?: (propertyPath: string) => void;
}

const CreateDocumentForm = React.memo(
  (props: PropsWithChildren<CreateDocumentFormProps>): JSX.Element | null => {
    const {
      step = 0,
      steps,
      docId,
      doc,
      skipLabel,
      backLabel,
      nextLabel,
      doneLabel,
      showErrors,
      errors,
      children,
      preview,
      finishedSummary,
      renderProperty,
      renderPropertyProps,
      getInspector,
      onClose,
      onChange,
      onSubmit,
      onSubmitted,
      onPropertyChange,
      onPropertyErrorFound,
      onPropertyErrorFixed,
      onStep,
      ...other
    } = props;

    const [docIdState, setDocIdState] = useState(docId);
    const [stepState, setStepState] = useState(step);
    const [previousStepIndex, setPreviousStepIndex] = useState(-1);
    const [creating, setCreating] = useState(false);
    const [expandedProperties, setExpandedProperties] = useState<string[]>([]);
    const [successful, setSuccessful] = useState(false);
    const [finished, setFinished] = useState(false);

    const contentRef = useRef<HTMLDivElement>();
    const latestDoc = useRef(doc);

    const displayFinishedSummary = finished && finishedSummary;

    const theme = useTheme();

    useEffect(() => {
      setStepState(step);
    }, [step]);

    useEffect(() => {
      setDocIdState(docId);
    }, [docId]);

    useEffect(() => {
      latestDoc.current = { ...doc };
    }, [doc]);

    const handleStep = useCallback(
      async (e: React.MouseEvent, newStep: number) => {
        if (onStep) {
          const shouldContinue = await onStep(e, newStep, latestDoc.current);
          if (!shouldContinue) {
            return;
          }
        }
        setPreviousStepIndex(stepState);
        setStepState(newStep);
        if (contentRef.current?.parentElement) {
          contentRef.current?.parentElement.scrollTo({
            top: 0,
            left: 0,
            behavior: "smooth",
          });
        }
      },
      [onStep, stepState]
    );

    const handleBack = useCallback(
      async (e: React.MouseEvent): Promise<void> => {
        await handleStep(e, stepState - 1);
      },
      [handleStep, stepState]
    );

    const handleNext = useCallback(
      async (e: React.MouseEvent): Promise<void> => {
        await handleStep(e, stepState + 1);
      },
      [handleStep, stepState]
    );

    const handleSubmit = useCallback(
      async (e: React.MouseEvent) => {
        e.preventDefault();
        setCreating(true);
        const newDoc = { ...latestDoc.current };
        let validDocId = docIdState;
        if (!validDocId) {
          const getUuid = (await import("../../../impower-core/utils/getUuid"))
            .default;
          validDocId = getUuid();
          setDocIdState(validDocId);
        }
        const successful = await onSubmit(e, validDocId, newDoc);
        if (successful) {
          if (onClose) {
            onClose(e, "submitted");
          }
        }
        if (onSubmitted) {
          await onSubmitted(validDocId, newDoc, successful);
        }
        setSuccessful(successful);
        setFinished(true);
        setCreating(false);
      },
      [docIdState, onClose, onSubmit, onSubmitted]
    );

    const isLastCreationStep = stepState >= steps.length - 1;
    const currentStep = steps[stepState];

    const currentStepFilledIn = useMemo(() => {
      return currentStep.propertyPaths
        ?.filter((propertyPath) =>
          getInspector?.(doc).isPropertyRequired?.(propertyPath, doc)
        )
        .every((propertyPath) => {
          const value = getValue(doc, propertyPath);
          if (Array.isArray(value)) {
            if (value.length === 0) {
              return false;
            }
          }
          if (isCollection(value)) {
            if (propertyPath === "members") {
              if (Object.keys(value.data).length === 1) {
                return false;
              }
            }
            if (Object.keys(value.data).length === 0) {
              return false;
            }
          }
          if (!value) {
            return false;
          }
          return true;
        });
    }, [currentStep.propertyPaths, doc, getInspector]);

    const handleExpandProperty = useCallback(
      (propertyPath, expanded): void => {
        if (expanded && !expandedProperties.includes(propertyPath)) {
          setExpandedProperties([...expandedProperties, propertyPath]);
        } else if (!expanded && expandedProperties.includes(propertyPath)) {
          setExpandedProperties(
            expandedProperties.filter((p): boolean => p !== propertyPath)
          );
        }
      },
      [expandedProperties]
    );

    const handleChange = useCallback((docs: DataDocument[]) => {
      latestDoc.current = docs?.[0];
    }, []);

    const handleDebouncedChange = useCallback(
      (docs: DataDocument[]) => {
        if (onChange) {
          onChange(docs[0]);
        }
      },
      [onChange]
    );

    const data = useMemo(() => [doc], [doc]);
    const handleGetPropertyDocIds = useCallback(
      () => [docIdState],
      [docIdState]
    );

    const title =
      displayFinishedSummary && !successful
        ? unsuccessfulTitle
        : currentStep?.title;
    const description =
      displayFinishedSummary && !successful
        ? unsuccessfulDescription
        : currentStep?.description;
    const buttonAreaStyle = useMemo(
      () => ({
        marginTop: stepState === 0 ? theme.spacing(5) : theme.spacing(3),
      }),
      [theme, stepState]
    );

    if (!doc) {
      return null;
    }

    return (
      <>
        <StyledDocumentForm ref={contentRef}>
          <StyledForegroundArea>
            <StyledContentArea style={{ overflow: "hidden" }}>
              <PeerTransition
                currentIndex={stepState}
                previousIndex={previousStepIndex}
                style={{ width: "100%", maxWidth: "100%" }}
              >
                <StyledContainer
                  bgcolor={
                    steps?.[stepState]?.preview
                      ? theme.palette.grey[200]
                      : "white"
                  }
                >
                  {!displayFinishedSummary && (
                    <StyledFormArea>
                      <InspectorForm
                        {...other}
                        StringInputComponent={StringInput}
                        AutocompleteInputComponent={AutocompleteInput}
                        RadioInputComponent={RadioInput}
                        data={data}
                        getPropertyDocPaths={handleGetPropertyDocIds}
                        variant="outlined"
                        InputComponent={OutlinedInput}
                        spacing={16}
                        propertyPaths={currentStep?.propertyPaths}
                        expandedProperties={expandedProperties}
                        backButtonLabel={
                          displayFinishedSummary || stepState === 0
                            ? undefined
                            : backLabel
                        }
                        submitButtonLabel={
                          displayFinishedSummary
                            ? undefined
                            : isLastCreationStep
                            ? doneLabel
                            : currentStepFilledIn
                            ? nextLabel
                            : skipLabel
                        }
                        submitButtonProps={{
                          disabled: isLastCreationStep && !currentStepFilledIn,
                          color: currentStepFilledIn ? "primary" : "inherit",
                          alignment: "space-between",
                        }}
                        disabled={creating}
                        submitting={creating}
                        buttonAreaStyle={buttonAreaStyle}
                        showErrors={showErrors}
                        errors={errors}
                        submitOnEnter
                        fullHeight
                        getInspector={getInspector}
                        onExpandProperty={handleExpandProperty}
                        onChange={handleChange}
                        onDebouncedChange={handleDebouncedChange}
                        onPropertyChange={onPropertyChange}
                        onPropertyErrorFound={onPropertyErrorFound}
                        onPropertyErrorFixed={onPropertyErrorFixed}
                        onBack={handleBack}
                        onSubmit={
                          isLastCreationStep ? handleSubmit : handleNext
                        }
                        headerChildren={
                          displayFinishedSummary && successful ? (
                            finishedSummary
                          ) : (
                            <>
                              {(title || description) && (
                                <StyledHeaderTitleArea>
                                  {title && (
                                    <StyledTitleTypography variant="h5">
                                      {title}
                                    </StyledTitleTypography>
                                  )}
                                  {title && description && <StyledDivider />}
                                  {description && (
                                    <StyledDescriptionTypography variant="body1">
                                      {description}
                                    </StyledDescriptionTypography>
                                  )}
                                  <StyledSpacer />
                                </StyledHeaderTitleArea>
                              )}
                              {steps?.[stepState]?.headerChildren}
                            </>
                          )
                        }
                        buttonChildren={steps?.[stepState]?.footerChildren}
                        renderProperty={renderProperty}
                        renderPropertyProps={renderPropertyProps}
                      >
                        {children}
                        {currentStep.preview && preview}
                      </InspectorForm>
                    </StyledFormArea>
                  )}
                </StyledContainer>
              </PeerTransition>
            </StyledContentArea>
            <StyledHeader>
              {onClose && (!displayFinishedSummary || !successful) && (
                <StyledIconButton
                  disabled={creating}
                  onClick={(e): void => {
                    if (onClose) {
                      onClose(e, "closeButtonClick");
                    }
                  }}
                >
                  <FontIcon
                    aria-label="Back"
                    color={theme.palette.primary.light}
                    size={24}
                  >
                    <XmarkSolidIcon />
                  </FontIcon>
                </StyledIconButton>
              )}
              <StyledMiddleArea>
                {steps?.length > 1 ? (
                  <StyledMobileStepper
                    variant="dots"
                    steps={steps?.length}
                    position="static"
                    activeStep={stepState}
                    backButton={null}
                    nextButton={null}
                  />
                ) : (
                  <StyledLogo />
                )}
              </StyledMiddleArea>
            </StyledHeader>
          </StyledForegroundArea>
        </StyledDocumentForm>
      </>
    );
  }
);

export default CreateDocumentForm;
