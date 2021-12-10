import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FileExtension,
  getFileContentType,
  StorageFile,
} from "../../../impower-core";
import { getFileSizeLimit } from "../../../impower-storage";
import { ToastContext, toastTop } from "../../../impower-toast";
import FileMiniPreview from "./FileMiniPreview";
import StringInput, { StringInputProps } from "./StringInput";

const StyledFileInput = styled.div`
  flex: 1;
  display: flex;
  align-items: stretch;
`;

const StyledUrlArea = styled.div`
  flex: 1;
  position: relative;
`;

const StyledProgressBar = styled.div`
  border-radius: ${(props): string => props.theme.borderRadius.field};
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background-color: ${(props): string => props.theme.palette.secondary.main}66;
  pointer-events: none;
  z-index: 2;
`;

const StyledInput = styled.input`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: none;
`;

const StyledLabel = styled.label`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
  cursor: pointer;
  &:hover {
    background-color: rgba(48, 91, 128, 0.04);
  }
`;

const StyledButton = styled(Button)`
  pointer-events: auto;

  &.MuiButton-root {
    font-weight: ${(props): number => props.theme.fontWeight.bold};
  }
  border-radius: inherit;
`;

const StyledTypography = styled(Typography)`
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  padding: 6px 8px;
`;

const StyledFileInputEndAdornmentArea = styled.div`
  display: flex;
  position: relative;
`;

const StyledFileInputEndAdornmentBlocker = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  margin: ${(props): number => -props.theme.spacing(1)};
  border-radius: inherit;
  pointer-event: auto;
`;

interface UploadButtonProps {
  id?: string;
  value: StorageFile;
  disabled?: boolean;
  label?: React.ReactNode;
  draggingFile: boolean;
  style?: React.CSSProperties;
  onDraggingFile: (draggingFile: boolean) => void;
  onUploadFile: (files: FileList) => void;
  onClick?: (event: React.MouseEvent) => void;
}

const UploadButton = React.memo((props: UploadButtonProps): JSX.Element => {
  const {
    id,
    value,
    disabled,
    label,
    draggingFile,
    style,
    onDraggingFile,
    onUploadFile,
    onClick,
  } = props;
  const handleDragOver = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const handleDragEnter = useCallback(
    (e: React.DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        onDraggingFile(true);
      }
    },
    [onDraggingFile]
  );
  const handleDragLeave = useCallback(
    (e: React.DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        onDraggingFile(false);
      }
    },
    [onDraggingFile]
  );
  const handleDrop = useCallback(
    (e: React.DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      onDraggingFile(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onUploadFile(e.dataTransfer.files);
        e.dataTransfer.clearData();
      }
    },
    [onDraggingFile, onUploadFile]
  );
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      onUploadFile(e.target.files);
    },
    [onUploadFile]
  );
  return (
    <StyledButton
      className={StyledButton.displayName}
      variant="text"
      color="secondary"
      disabled={disabled}
      onClick={onClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        pointerEvents: "auto",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        ...style,
      }}
    >
      {label}
      <StyledInput
        className={StyledInput.displayName}
        accept={value.fileType}
        id={`${id}-input`}
        type="file"
        onChange={handleChange}
      />
      <StyledLabel
        className={StyledLabel.displayName}
        htmlFor={`${id}-input`}
        style={{
          borderWidth: draggingFile ? "medium" : undefined,
          borderStyle: draggingFile ? "dashed" : undefined,
        }}
      />
    </StyledButton>
  );
});

interface DeleteButtonProps {
  label?: string;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent) => void;
}
const DeleteButton = React.memo((props: DeleteButtonProps): JSX.Element => {
  const { disabled, label, onClick } = props;
  return (
    <>
      <StyledButton
        variant="text"
        color="secondary"
        disabled={disabled}
        onClick={onClick}
      >
        {label}
      </StyledButton>
    </>
  );
});

export interface FileInputProps extends StringInputProps {
  value?: StorageFile;
  uploadButtonLabel?: string;
  deleteButtonLabel?: string;
  endAdornmentPosition?: "before" | "after" | "replace";
  disallowExternalFiles?: boolean;
  blob?: globalThis.File;
  onBeforeUpload?: (value: StorageFile) => Promise<void>;
  onBeforeDelete?: (value: StorageFile) => Promise<void>;
  onChange?: (e: React.ChangeEvent, value?: StorageFile) => void;
  onDebouncedChange?: (value: StorageFile) => void;
  onBlur?: (e: React.FocusEvent, value?: StorageFile) => void;
}

const FileInput = React.memo((props: FileInputProps): JSX.Element => {
  const {
    id,
    variant,
    inset,
    InputComponent,
    size,
    backgroundColor,
    value,
    label,
    placeholder,
    uploadButtonLabel = "Upload",
    deleteButtonLabel = "Delete",
    tooltip = "",
    showError,
    disabled,
    required,
    autoFocus,
    mixed,
    characterCountLimit,
    InputProps,
    helperText,
    moreInfoPopup,
    loading,
    endAdornmentPosition = "after",
    disallowExternalFiles,
    blob,
    onBeforeUpload,
    onBeforeDelete,
    onChange,
    onDebouncedChange,
    onBlur,
    onKeyDown,
    getInputError,
    onErrorFound,
    onErrorFixed,
  } = props;

  const [, toastDispatch] = useContext(ToastContext);
  const [loadedAmount, setLoadedAmount] = useState<number>();
  const [totalAmount, setTotalAmount] = useState<number>();
  const [inputError, setInputError] = useState<string>();
  const [draggingFile, setDraggingFile] = useState(false);
  const [state, setState] = useState<StorageFile>(value);
  const [previewUrl, setPreviewUrl] = useState(value?.fileUrl);

  const blobRef = useRef<globalThis.File>();

  const handleUploadFile = useCallback(
    async (file: globalThis.File) => {
      if (file.size > getFileSizeLimit()) {
        const error = "File size must be less than 10mb";
        if (onErrorFound) {
          onErrorFound(error);
        }
        return;
      }
      setPreviewUrl(URL.createObjectURL(file));

      if (!file) {
        return;
      }

      const lastDotIndex = file.name.lastIndexOf(".");
      const ext = file.name.substring(lastDotIndex + 1) as FileExtension;

      try {
        const fileExtension = ext as FileExtension;
        if (onBeforeUpload) {
          await onBeforeUpload({
            ...state,
            fileType: state.fileType || getFileContentType(ext),
            fileExtension,
            fileName: file.name,
          });
        }
        const customMetadata = {
          fileType: state.fileType || getFileContentType(ext),
          fileExtension: ext,
          fileName: file.name,
        };
        const Storage = (
          await import("../../../impower-storage/classes/storage")
        ).default;
        const uploadedFile = await Storage.instance.put(
          file,
          {
            contentType: getFileContentType(ext),
            customMetadata,
          },
          (snapshot) => {
            setLoadedAmount(snapshot.bytesTransferred);
            setTotalAmount(snapshot.totalBytes);
          }
        );
        setLoadedAmount(undefined);
        setTotalAmount(undefined);
        setState(uploadedFile);
        onChange(null, uploadedFile);
        if (getInputError) {
          const error = await getInputError(uploadedFile);
          setInputError(error);
          if (error) {
            if (onErrorFound) {
              onErrorFound(error);
            }
          } else if (onErrorFixed) {
            onErrorFixed();
          }
          if (!error) {
            if (onDebouncedChange) {
              onDebouncedChange(uploadedFile);
            }
            if (onBlur) {
              onBlur(null, uploadedFile);
            }
          }
        } else {
          if (onDebouncedChange) {
            onDebouncedChange(uploadedFile);
          }
          if (onBlur) {
            onBlur(null, uploadedFile);
          }
        }
      } catch (error) {
        setLoadedAmount(undefined);
        setTotalAmount(undefined);
        toastDispatch(toastTop(error.message, "error"));
        const logError = (
          await import("../../../impower-logger/utils/logError")
        ).default;
        logError("Storage", error);
      }
    },
    [
      onErrorFound,
      state,
      onBeforeUpload,
      onChange,
      getInputError,
      onErrorFixed,
      onDebouncedChange,
      onBlur,
      toastDispatch,
    ]
  );

  const handleUpload = useCallback(
    async (files: FileList) => {
      if (!files || files.length === 0) {
        return;
      }
      const file = files?.[0];
      handleUploadFile(file);
    },
    [handleUploadFile]
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const { storageKey } = state;
      const newValue: StorageFile = {
        ...state,
        fileUrl: "",
        storageKey: "",
        fileExtension: null,
        fileName: "",
      };
      try {
        if (onBeforeDelete) {
          await onBeforeDelete(state);
        }
        const Storage = (
          await import("../../../impower-storage/classes/storage")
        ).default;
        await Storage.instance.delete(storageKey).then(() => {
          setState(newValue);
          if (onChange) {
            onChange(e as unknown as React.ChangeEvent, newValue);
          }
          if (onDebouncedChange) {
            onDebouncedChange(newValue);
          }
          if (onBlur) {
            onBlur(e as unknown as React.FocusEvent, newValue);
          }
        });
      } catch (error) {
        toastDispatch(toastTop(error.message, "error"));
        const logError = (
          await import("../../../impower-logger/utils/logError")
        ).default;
        logError("Storage", error);
        setState(newValue);
        if (onChange) {
          onChange(e as unknown as React.ChangeEvent, newValue);
        }
        if (onDebouncedChange) {
          onDebouncedChange(newValue);
        }
        if (onBlur) {
          onBlur(e as unknown as React.FocusEvent, newValue);
        }
      }
    },
    [state, onBeforeDelete, onChange, onDebouncedChange, onBlur, toastDispatch]
  );

  const handleUrlBlur = useCallback(
    async (e: React.FocusEvent, v: string) => {
      const newValue: StorageFile = { ...state, fileUrl: v };
      setState(newValue);
      onChange(e, newValue);
      if (getInputError) {
        const error = await getInputError(newValue);
        setInputError(error);
        if (error) {
          if (onErrorFound) {
            onErrorFound(error);
          }
        } else if (onErrorFixed) {
          onErrorFixed();
        }
        if (!error) {
          if (onDebouncedChange) {
            onDebouncedChange(newValue);
          }
          if (onBlur) {
            onBlur(e, newValue);
          }
        }
      } else {
        if (onDebouncedChange) {
          onDebouncedChange(newValue);
        }
        if (onBlur) {
          onBlur(e, newValue);
        }
      }
    },
    [
      getInputError,
      onBlur,
      onChange,
      onDebouncedChange,
      onErrorFixed,
      onErrorFound,
      state,
    ]
  );

  useEffect(() => {
    setState({ ...state, ...value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (blob !== blobRef.current) {
      blobRef.current = blob;
      if (blobRef.current) {
        handleUploadFile(blobRef.current);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  const canDelete = Boolean(state.storageKey);
  const canUpload = !state.storageKey && !state.fileUrl && !state.fileExtension;
  const isUploading = loadedAmount !== undefined && totalAmount !== undefined;

  const previewValue = useMemo(
    () => ({ ...state, fileUrl: previewUrl || state.fileUrl }),
    [state, previewUrl]
  );

  const FileInputProps = useMemo(
    () => ({
      endAdornment: (
        <>
          {endAdornmentPosition === "before" && InputProps?.endAdornment}
          {endAdornmentPosition === "replace" ? (
            InputProps?.endAdornment
          ) : (
            <>
              {canDelete ? (
                <StyledFileInputEndAdornmentArea style={{ zIndex: 2 }}>
                  <StyledFileInputEndAdornmentBlocker />
                  <DeleteButton
                    label={deleteButtonLabel}
                    disabled={disabled}
                    onClick={handleDelete}
                  />
                  <FileMiniPreview
                    interactable={true}
                    value={previewValue}
                    draggingFile={draggingFile}
                  />
                </StyledFileInputEndAdornmentArea>
              ) : canUpload && !isUploading ? (
                <StyledFileInputEndAdornmentArea>
                  <StyledTypography variant="button" color="secondary">
                    {uploadButtonLabel}
                  </StyledTypography>
                  <FileMiniPreview
                    interactable={true}
                    value={state}
                    draggingFile={draggingFile}
                  />
                  {!disallowExternalFiles && (
                    <UploadButton
                      id={id}
                      value={state}
                      disabled={disabled}
                      draggingFile={draggingFile}
                      style={{
                        position: "absolute",
                        width: "100%",
                        marginTop: -6,
                        marginBottom: -6,
                      }}
                      onDraggingFile={setDraggingFile}
                      onUploadFile={handleUpload}
                    />
                  )}
                </StyledFileInputEndAdornmentArea>
              ) : (
                <FileMiniPreview
                  interactable={true}
                  value={state}
                  draggingFile={draggingFile}
                />
              )}
            </>
          )}
          {endAdornmentPosition === "after" && InputProps?.endAdornment}
        </>
      ),
    }),
    [
      endAdornmentPosition,
      InputProps?.endAdornment,
      canDelete,
      deleteButtonLabel,
      disabled,
      handleDelete,
      previewValue,
      draggingFile,
      canUpload,
      isUploading,
      uploadButtonLabel,
      state,
      disallowExternalFiles,
      id,
      handleUpload,
    ]
  );

  const fileName =
    state.fileName || state.storageKey
      ? state.fileName ||
        `${state.storageKey.substring(state.storageKey.lastIndexOf("/") + 1)}.${
          state.fileExtension
        }`
      : "";

  return (
    <StyledFileInput className={StyledFileInput.displayName}>
      <StyledUrlArea className={StyledUrlArea.displayName}>
        <StringInput
          id={id}
          variant={variant}
          inset={inset}
          InputComponent={InputComponent}
          size={size}
          backgroundColor={backgroundColor}
          defaultValue={
            isUploading
              ? `Uploading...`
              : disallowExternalFiles
              ? fileName
              : state.fileUrl || ""
          }
          label={label}
          placeholder={placeholder}
          tooltip={tooltip}
          error={Boolean(inputError)}
          errorText={inputError}
          showError={showError}
          multiline={false}
          characterCountLimit={characterCountLimit}
          mixed={mixed}
          disabled={isUploading || canDelete || disabled}
          required={required}
          disabledOpacity={!disabled && canDelete ? 1 : undefined}
          autoFocus={autoFocus}
          onBlur={handleUrlBlur}
          onKeyDown={onKeyDown}
          InputProps={FileInputProps}
          helperText={helperText}
          moreInfoPopup={moreInfoPopup}
          loading={loading}
          disableResponsive
          overlay={
            !isUploading && !canDelete && disallowExternalFiles && canUpload ? (
              <UploadButton
                id={id}
                value={state}
                disabled={disabled}
                draggingFile={draggingFile}
                style={{ position: "absolute", width: "100%" }}
                onDraggingFile={setDraggingFile}
                onUploadFile={handleUpload}
              />
            ) : undefined
          }
        />
        {isUploading && (
          <StyledProgressBar
            className={StyledProgressBar.displayName}
            style={{
              width: "100%",
              transformOrigin: "center left",
              transform: `scaleX(${loadedAmount / totalAmount}`,
            }}
          />
        )}
      </StyledUrlArea>
    </StyledFileInput>
  );
});

export default FileInput;
