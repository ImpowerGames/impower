import styled from "@emotion/styled";
import { ButtonProps } from "@material-ui/core/Button";
import dynamic from "next/dynamic";
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getAllErrors,
  getValue,
  groupBy,
  Inspector,
  orderBy,
} from "../../../impower-core";
import DataField, {
  InheritedProps,
  RenderPropertyProps,
} from "../inputs/DataField";
import DynamicLoadingButton from "../inputs/DynamicLoadingButton";

const InspectorGroupForm = dynamic(() => import("./InspectorGroupForm"));

const defaultBackButtonProps: ButtonProps = {
  variant: "text",
  color: "primary",
  size: "large",
};
const defaultSubmitButtonProps: ButtonProps & { alignment?: string } = {
  variant: "contained",
  color: "primary",
  size: "large",
  alignment: "flex-end",
};

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  flex: 1;
`;

const StyledButtonArea = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
`;

const StyledButton = styled(DynamicLoadingButton)`
  position: relative;
`;

const StyledTopArea = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledFieldArea = styled.div`
  display: flex;
  flex-direction: column;
`;

export interface InspectorFormProps extends InheritedProps {
  data: Record<string, unknown>[];
  propertyPaths?: string[];
  variant?: "filled" | "outlined" | "standard";
  inset?: boolean;
  size?: "small" | "medium";
  backgroundColor?: string;
  spacing?: number;
  disabled?: boolean;
  submitting?: boolean;
  showErrors?: boolean;
  errors?: { [propertyPath: string]: string };
  expandedProperties?: string[];
  backButtonLabel?: string;
  backButtonProps?: Partial<ButtonProps> & {
    alignment?: "center" | "flex-start" | "flex-end" | "space-between";
  };
  submitButtonLabel?: string;
  submitButtonProps?: Partial<ButtonProps> & {
    alignment?: "center" | "flex-start" | "flex-end" | "space-between";
  };
  debounceInterval?: number;
  fullHeight?: boolean;
  buttonAreaStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  headerChildren?: React.ReactNode;
  buttonChildren?: React.ReactNode;
  submitOnEnter?: boolean;
  setValueId?: (value: unknown, id: string) => unknown;
  getInspector?: (data: Record<string, unknown>) => Inspector;
  getPropertyDocPaths?: (
    propertyPath: string,
    data: Record<string, unknown>
  ) => string[];
  getFormattedSummary?: (
    summary: string,
    data: Record<string, unknown>
  ) => string;
  onClickMenuItem?: (
    e: React.MouseEvent,
    type: string,
    propertyPath: string,
    data: Record<string, unknown>
  ) => void;
  onExpandProperty?: (propertyPath: string, expanded: boolean) => void;
  onPropertyInputChange?: (propertyPath: string, value: unknown) => void;
  onPropertyChange?: (propertyPath: string, value: unknown) => void;
  onDebouncedPropertyChange?: (propertyPath: string, value: unknown) => void;
  onChange?: (data: Record<string, unknown>[]) => void;
  onDebouncedChange?: (data: Record<string, unknown>[]) => void;
  onBack?: (e: React.MouseEvent) => void;
  onValidatePropertyChange?: (
    propertyPath: string,
    value: unknown,
    data: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  onSubmit?: (
    e: React.FormEvent | React.MouseEvent,
    data: Record<string, unknown>[]
  ) => Promise<void>;
  onSubmitting?: (submitting: boolean) => void;
  onPropertyErrorFound?: (propertyPath: string, error: string) => void;
  onPropertyErrorFixed?: (propertyPath: string) => void;
  renderProperty?: (props: RenderPropertyProps) => React.ReactNode;
  renderPropertyProps?: Record<string, unknown>;
}

const InspectorForm = React.memo(
  (props: PropsWithChildren<InspectorFormProps>): JSX.Element => {
    const {
      data,
      propertyPaths,
      variant,
      inset,
      InputComponent,
      AutocompleteInputComponent,
      ColorInputComponent,
      FileInputComponent,
      NumberInputComponent,
      RadioInputComponent,
      StringInputComponent,
      BooleanInputComponent,
      ObjectFieldComponent,
      size,
      backgroundColor,
      spacing = 16,
      disabled,
      submitting,
      showErrors,
      expandedProperties,
      backButtonProps = defaultBackButtonProps,
      submitButtonProps = defaultSubmitButtonProps,
      backButtonLabel,
      submitButtonLabel,
      errors,
      debounceInterval,
      fullHeight,
      buttonAreaStyle,
      style,
      headerChildren,
      buttonChildren,
      submitOnEnter,
      setValueId,
      getInspector,
      getPropertyDocPaths,
      getFormattedSummary,
      onClickMenuItem,
      onExpandProperty,
      onPropertyInputChange,
      onPropertyChange,
      onPropertyBlur,
      onDebouncedPropertyChange,
      onValidatePropertyChange,
      onChange,
      onDebouncedChange,
      onBack,
      onSubmit,
      onSubmitting,
      onPropertyErrorFound,
      onPropertyErrorFixed,
      renderProperty,
      renderPropertyProps,
      children,
      ...other
    } = props;

    const inspector = useMemo(
      () => getInspector?.(data[0]),
      [getInspector, data]
    );

    const stateRef = useRef<Record<string, unknown>[]>(
      data.map((d) => ({ ...(inspector?.createData?.() || {}), ...d }))
    );
    const [state, setState] = useState<Record<string, unknown>[]>(
      data.map((d) => ({ ...(inspector?.createData?.() || {}), ...d }))
    );
    const [submittingState, setSubmittingState] = useState(submitting);
    const [showErrorsState, setShowErrorsState] = useState(showErrors);
    const [errorsState, setErrorsState] = useState<{
      [propertyPath: string]: string;
    }>(errors || {});

    useEffect(() => {
      const setup = async (): Promise<void> => {
        const assignValues = (
          await import("../../../impower-core/utils/assignValues")
        ).default;
        if (inspector) {
          const inspectedData = data.map((d) =>
            assignValues(inspector?.createData?.() || {}, d)
          );
          stateRef.current = inspectedData;
          setState(inspectedData);
        }
      };
      setup();
    }, [data, inspector]);

    useEffect(() => {
      setSubmittingState(submitting);
    }, [submitting]);

    useEffect(() => {
      setShowErrorsState(showErrors);
    }, [showErrors]);

    useEffect(() => {
      if (errors) {
        setErrorsState(errors);
      }
    }, [errors]);

    const allSortedPropertyPaths = useMemo(
      () =>
        state?.[0]
          ? orderBy(
              Object.keys(state[0])
                .filter((propertyPath) =>
                  inspector?.isPropertyVisible
                    ? inspector?.isPropertyVisible?.(propertyPath, state[0])
                    : true
                )
                .map((propertyPath) => ({
                  propertyPath,
                  order: inspector?.getPropertyOrder
                    ? inspector?.getPropertyOrder?.(propertyPath, state[0])
                    : 0,
                })),
              (x) => x.order
            ).map(({ propertyPath }) => propertyPath)
          : [],
      [state, inspector]
    );

    const paths = propertyPaths || allSortedPropertyPaths;

    const groups = useMemo(
      () => groupBy(paths, (p) => p.substring(0, p.indexOf("/") + 1) || p),
      [paths]
    );

    const handleBack = useCallback(
      async (e: React.MouseEvent) => {
        e.preventDefault();
        if (onBack) {
          onBack(e);
        }
      },
      [onBack]
    );

    const handleSubmit = useCallback(
      async (e?: React.FormEvent | React.MouseEvent) => {
        const currentData = stateRef.current;
        if (e) {
          e.preventDefault();
        }
        setSubmittingState(true);
        if (onSubmitting) {
          onSubmitting(true);
        }
        const inspector = getInspector?.(currentData[0]);
        if (inspector?.getPropertyError) {
          const errors = await getAllErrors?.(
            propertyPaths,
            currentData[0],
            inspector?.getPropertyError,
            getPropertyDocPaths
          );
          setErrorsState(errors);
          setShowErrorsState(true);
          if (Object.keys(errors).length > 0) {
            setSubmittingState(false);
            if (onSubmitting) {
              onSubmitting(false);
            }
            return;
          }
        }
        if (onSubmit) {
          await onSubmit(e, currentData);
        }
        setSubmittingState(false);
        if (onSubmitting) {
          onSubmitting(false);
        }
      },
      [onSubmitting, getInspector, propertyPaths, getPropertyDocPaths, onSubmit]
    );

    const handleChange = useCallback(
      (newData: Record<string, unknown>[]) => {
        stateRef.current = newData;
        if (onChange) {
          onChange(newData);
        }
      },
      [onChange]
    );

    const handleDebouncedChange = useCallback(
      (newData: Record<string, unknown>[]) => {
        stateRef.current = newData;
        if (onDebouncedChange) {
          onDebouncedChange(newData);
        }
      },
      [onDebouncedChange]
    );

    const handlePropertyChange = useCallback(
      async (propertyPath: string, value: unknown) => {
        const setValue = (await import("../../../impower-core/utils/setValue"))
          .default;
        const currentData = stateRef.current;
        const inspector = getInspector?.(currentData[0]);
        const newData = currentData.map((d) =>
          inspector?.validate
            ? inspector?.validate?.(setValue(d, propertyPath, value))
            : setValue(d, propertyPath, value)
        );
        if (onPropertyChange) {
          onPropertyChange(propertyPath, getValue(newData[0], propertyPath));
        }
        handleChange(newData);
      },
      [getInspector, handleChange, onPropertyChange]
    );

    const handleDebouncedPropertyChange = useCallback(
      async (propertyPath: string, value: unknown) => {
        const setValue = (await import("../../../impower-core/utils/setValue"))
          .default;
        const currentData = stateRef.current;
        const inspector = getInspector?.(currentData[0]);
        let newData = currentData.map((d) =>
          inspector?.validate
            ? inspector?.validate?.(setValue(d, propertyPath, value))
            : setValue(d, propertyPath, value)
        );
        if (onValidatePropertyChange) {
          const promises: Promise<Record<string, unknown>>[] = [];
          newData.forEach((d) => {
            promises.push(onValidatePropertyChange(propertyPath, value, d));
          });
          newData = await Promise.all(promises);
        }
        if (onDebouncedPropertyChange) {
          onDebouncedPropertyChange(
            propertyPath,
            getValue(newData[0], propertyPath)
          );
        }
        handleDebouncedChange(newData);
      },
      [
        getInspector,
        handleDebouncedChange,
        onDebouncedPropertyChange,
        onValidatePropertyChange,
      ]
    );

    const handlePropertyErrorFound = useCallback(
      (propertyPath: string, error: string) => {
        if (!errorsState[propertyPath]) {
          const newErrors = { ...errorsState, [propertyPath]: error };
          setErrorsState(newErrors);
          if (onPropertyErrorFound) {
            onPropertyErrorFound(propertyPath, error);
          }
        }
      },
      [errorsState, onPropertyErrorFound]
    );

    const handlePropertyErrorFixed = useCallback(
      (propertyPath: string) => {
        if (errorsState[propertyPath]) {
          const newErrors = { ...errorsState };
          delete newErrors[propertyPath];
          setErrorsState(newErrors);
          if (onPropertyErrorFixed) {
            onPropertyErrorFixed(propertyPath);
          }
        }
      },
      [errorsState, onPropertyErrorFixed]
    );

    const handlePropertyKeyDown = useCallback(
      (e: React.KeyboardEvent): void => {
        const element = e?.target as HTMLElement;
        const tagName = element?.tagName?.toLowerCase();
        if (
          submitOnEnter &&
          tagName === "input" &&
          propertyPaths?.length === 1 &&
          e.key === "Enter"
        ) {
          const propertyPath = propertyPaths[0];
          const value = getValue(stateRef.current, propertyPath);
          if (value && !Array.isArray(value)) {
            window.setTimeout(() => {
              handleSubmit(e);
            }, 50);
          }
        }
      },
      [handleSubmit, propertyPaths, submitOnEnter]
    );

    if (!state?.[0]) {
      return null;
    }

    return (
      <StyledForm
        noValidate
        method="post"
        autoComplete="off"
        onSubmit={handleSubmit}
        style={style}
      >
        <StyledTopArea
          style={{
            flex: fullHeight ? 1 : undefined,
          }}
        >
          {headerChildren}
          {groups &&
            Object.keys(groups).map((label) => {
              const groupedPropertyPaths = groups[label];
              if (label.endsWith("/")) {
                const objectFieldPropertyPaths = Object.values(
                  groupedPropertyPaths
                ).map((groupedPropertyPath) =>
                  groupedPropertyPath.substring(label.length)
                );
                return (
                  <InspectorGroupForm
                    label={label}
                    propertyPaths={objectFieldPropertyPaths}
                    errors={errorsState}
                    data={state}
                    variant={variant}
                    inset={inset}
                    InputComponent={InputComponent}
                    AutocompleteInputComponent={AutocompleteInputComponent}
                    ColorInputComponent={ColorInputComponent}
                    FileInputComponent={FileInputComponent}
                    NumberInputComponent={NumberInputComponent}
                    RadioInputComponent={RadioInputComponent}
                    StringInputComponent={StringInputComponent}
                    BooleanInputComponent={BooleanInputComponent}
                    ObjectFieldComponent={ObjectFieldComponent}
                    size={size}
                    backgroundColor={backgroundColor}
                    spacing={spacing}
                    disabled={disabled}
                    expandedProperties={expandedProperties}
                    debounceInterval={debounceInterval}
                    submitting={submittingState}
                    showErrors={showErrorsState}
                    setValueId={setValueId}
                    getInspector={getInspector}
                    getPropertyDocPaths={getPropertyDocPaths}
                    getFormattedSummary={getFormattedSummary}
                    onClickMenuItem={onClickMenuItem}
                    onExpandProperty={onExpandProperty}
                    renderProperty={renderProperty}
                    onPropertyInputChange={onPropertyInputChange}
                    onPropertyChange={handlePropertyChange}
                    onPropertyBlur={onPropertyBlur}
                    onDebouncedPropertyChange={handleDebouncedPropertyChange}
                    onPropertyErrorFound={handlePropertyErrorFound}
                    onPropertyErrorFixed={handlePropertyErrorFixed}
                    renderPropertyProps={renderPropertyProps}
                    {...other}
                  />
                );
              }
              return (
                <StyledFieldArea key={label}>
                  {Object.values(groupedPropertyPaths).map((propertyPath) => (
                    <DataField
                      key={propertyPath}
                      propertyPath={propertyPath}
                      data={state}
                      variant={variant}
                      inset={inset}
                      InputComponent={InputComponent}
                      AutocompleteInputComponent={AutocompleteInputComponent}
                      ColorInputComponent={ColorInputComponent}
                      FileInputComponent={FileInputComponent}
                      NumberInputComponent={NumberInputComponent}
                      RadioInputComponent={RadioInputComponent}
                      StringInputComponent={StringInputComponent}
                      BooleanInputComponent={BooleanInputComponent}
                      ObjectFieldComponent={ObjectFieldComponent}
                      size={size}
                      spacing={spacing}
                      backgroundColor={backgroundColor}
                      expandedProperties={expandedProperties}
                      disabled={disabled || submittingState}
                      debounceInterval={debounceInterval}
                      showError={showErrorsState}
                      error={Boolean(errorsState?.[propertyPath])}
                      errorText={errorsState?.[propertyPath]}
                      getInspector={getInspector}
                      getFormattedSummary={getFormattedSummary}
                      getDocPaths={getPropertyDocPaths}
                      onPropertyInputChange={onPropertyInputChange}
                      onPropertyChange={handlePropertyChange}
                      onPropertyBlur={onPropertyBlur}
                      onDebouncedPropertyChange={handleDebouncedPropertyChange}
                      onPropertyKeyDown={handlePropertyKeyDown}
                      onPropertyErrorFound={handlePropertyErrorFound}
                      onPropertyErrorFixed={handlePropertyErrorFixed}
                      onExpandProperty={onExpandProperty}
                      onClickMenuItem={onClickMenuItem}
                      setValueId={setValueId}
                      renderProperty={renderProperty}
                      renderPropertyProps={renderPropertyProps}
                      {...other}
                    />
                  ))}
                </StyledFieldArea>
              );
            })}
          {children}
        </StyledTopArea>
        {(submitButtonLabel || backButtonLabel) && (
          <StyledButtonArea
            style={{
              marginTop: spacing * 0.5,
              marginBottom: spacing * 0.5,
              justifyContent: submitButtonProps.alignment,
              ...buttonAreaStyle,
            }}
          >
            {backButtonLabel && (
              <StyledButton
                {...defaultBackButtonProps}
                {...backButtonProps}
                disabled={
                  backButtonProps.disabled ||
                  Object.keys(errorsState).length > 0 ||
                  submittingState
                }
                onClick={handleBack}
              >
                {backButtonLabel}
              </StyledButton>
            )}
            {buttonChildren}
            {submitButtonLabel && (
              <StyledButton
                {...defaultSubmitButtonProps}
                {...submitButtonProps}
                type="submit"
                loading={submittingState}
                disabled={
                  submitButtonProps.disabled ||
                  Object.keys(errorsState).length > 0
                }
                onClick={handleSubmit}
              >
                {submitButtonLabel}
              </StyledButton>
            )}
          </StyledButtonArea>
        )}
      </StyledForm>
    );
  }
);

export default InspectorForm;
