import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import React, { useCallback, useContext, useEffect, useState } from "react";
import PenToSquareSolidIcon from "../../../../resources/icons/solid/pen-to-square.svg";
import { getFileContentType, StorageFile } from "../../../impower-core";
import { FontIcon } from "../../../impower-icon";
import { getFileSizeLimit, StorageError } from "../../../impower-storage";
import { ToastContext, toastTop } from "../../../impower-toast";
import FadeAnimation from "../animations/FadeAnimation";
import Avatar from "./Avatar";

const CircularProgress = dynamic(
  () => import("@mui/material/CircularProgress"),
  {
    ssr: false,
  }
);

const StyledIconButtonArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;

  transition: 0.2s ease;
  &:hover {
    background-color: ${(props): string => props.theme.colors.black20};
  }
`;

const StyledIconButton = styled(Button)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
  width: 100%;
  height: 100%;
  text-align: center;
  white-space: pre;
  line-height: 1.2rem;
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  color: white;
  padding: 0;

  position: relative;
  width: 100%;
  height: 100%;
  border-radius: inherit;
`;

const StyledButtonContent = styled(FadeAnimation)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
`;

const StyledIconButtonAreaBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: 50%;
`;

const StyledDarkOverlay = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: ${(props): string => props.theme.colors.black20};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
`;

const StyledFontIconArea = styled.div`
  padding-bottom: ${(props): string => props.theme.spacing(1)};
  position: relative;
`;

const StyledPercentageTypography = styled(Typography)`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledCircularProgress = styled(CircularProgress)`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  color: ${(props): string => props.theme.colors.black50};
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
`;

interface UploadButtonContentProps {
  id: string;
  accept: string;
  draggingFile: boolean;
  onUploadFile: (files: FileList) => void;
}

const UploadButtonContent = React.memo(
  (props: UploadButtonContentProps): JSX.Element => {
    const { id, accept, draggingFile, onUploadFile } = props;
    return (
      <>
        <StyledInput
          className={StyledInput.displayName}
          accept={accept}
          id={id}
          type="file"
          onChange={(e): void => onUploadFile(e.target.files)}
        />
        <StyledLabel
          htmlFor={id}
          className={StyledLabel.displayName}
          style={{
            borderWidth: draggingFile ? "medium" : undefined,
            borderStyle: draggingFile ? "dashed" : undefined,
          }}
        />
      </>
    );
  }
);

interface AvatarUploadButtonProps {
  labelVisible: boolean;
  onUploadFile: (files: FileList) => void;
}

const AvatarUploadButton = React.memo(
  (props: AvatarUploadButtonProps): JSX.Element => {
    const { labelVisible, onUploadFile } = props;

    const [draggingFile, setDraggingFile] = useState(false);

    const theme = useTheme();

    const handleDragOver = useCallback((e: React.DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();
    }, []);
    const handleDragEnter = useCallback((e: React.DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setDraggingFile(true);
      }
    }, []);
    const handleDragLeave = useCallback((e: React.DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setDraggingFile(false);
      }
    }, []);
    const handleDrop = useCallback(
      (e: React.DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        setDraggingFile(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onUploadFile(e.dataTransfer.files);
          e.dataTransfer.clearData();
        }
      },
      [onUploadFile]
    );

    return (
      <StyledIconButton
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <StyledButtonContent
          initial={labelVisible ? 1 : 0}
          animate={labelVisible ? 1 : 0}
          duration={0.2}
        >
          <StyledDarkOverlay className={StyledDarkOverlay.displayName}>
            <StyledFontIconArea className={StyledFontIconArea.displayName}>
              <FontIcon
                aria-label="Upload Icon"
                size={theme.fontSize.smallIcon}
              >
                <PenToSquareSolidIcon />
              </FontIcon>
            </StyledFontIconArea>
            {`Upload\nIcon`}
          </StyledDarkOverlay>
        </StyledButtonContent>
        <UploadButtonContent
          id="icon-input"
          accept="image/*"
          draggingFile={draggingFile}
          onUploadFile={onUploadFile}
        />
      </StyledIconButton>
    );
  }
);

interface EditableAvatarProps {
  color?: string;
  iconSrc?: string;
  defaultIcon?: React.ReactNode;
  name?: string;
  edit?: boolean;
  preview?: boolean;
  onUpload?: (file: StorageFile) => void;
  onError?: (error: StorageError) => void;
  getPlaceholderUrl?: (fileUrl: string) => string;
}

const EditableAvatar = (props: EditableAvatarProps): JSX.Element => {
  const {
    color,
    iconSrc,
    defaultIcon,
    name,
    edit,
    preview,
    onUpload = (): void => null,
    onError = (): void => null,
    getPlaceholderUrl,
  } = props;
  const [iconUploadProgress, setIconUploadProgress] = useState<number>();
  const [iconUploadTotal, setIconUploadTotal] = useState<number>();
  const [iconFileUrl, setIconFileUrl] = useState(iconSrc);
  const [iconUploadTextVisible, setIconUploadTextVisible] = useState(
    Boolean(!iconFileUrl)
  );

  const [, toastDispatch] = useContext(ToastContext);

  const iconUploadPercentage = Math.max(
    0,
    (iconUploadProgress / iconUploadTotal) * 100
  );

  useEffect(() => {
    setIconFileUrl(iconSrc);
    if (iconSrc) {
      setIconUploadTextVisible(false);
    } else {
      setIconUploadTextVisible(true);
    }
  }, [iconSrc]);

  const handleUpload = useCallback(
    async (files: FileList) => {
      const file = files?.[0];
      const lastDot = file.name.lastIndexOf(".");
      const ext = file.name.substring(lastDot + 1);

      if (file.size > getFileSizeLimit()) {
        const error = "File size must be less than 10mb";
        toastDispatch(toastTop(error, "error"));
        return;
      }

      const fileUrl = URL.createObjectURL(file);
      setIconFileUrl(fileUrl);

      setIconUploadTotal(undefined);
      setIconUploadProgress(0);

      try {
        const customMetadata = {
          fileType: "image/*",
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
            setIconUploadProgress(snapshot.bytesTransferred);
            setIconUploadTotal(snapshot.totalBytes);
          }
        );
        setIconUploadTotal(undefined);
        onUpload({
          ...uploadedFile,
        } as StorageFile);
      } catch (error) {
        setIconUploadTotal(undefined);
        onError(error);
        const logError = (
          await import("../../../impower-logger/utils/logError")
        ).default;
        logError("Storage", error);
      }
    },
    [onError, onUpload, toastDispatch]
  );

  return (
    <Avatar
      backgroundColor={color}
      alt={name}
      icon={defaultIcon}
      fontSize={28}
      src={iconUploadTotal ? undefined : iconFileUrl}
      placeholder={getPlaceholderUrl}
      style={{
        borderRadius: "inherit",
        width: "100%",
        height: "100%",
      }}
    >
      {edit && (
        <StyledIconButtonAreaBackground
          style={{
            backgroundColor:
              !iconUploadTotal && (preview || iconFileUrl) ? undefined : color,
          }}
        >
          <StyledIconButtonArea
            onPointerEnter={(): void => {
              setIconUploadTextVisible(true);
            }}
            onPointerLeave={(): void => {
              if (iconFileUrl) {
                setIconUploadTextVisible(false);
              } else {
                setIconUploadTextVisible(true);
              }
            }}
          >
            <AvatarUploadButton
              labelVisible={!preview && iconUploadTextVisible}
              onUploadFile={handleUpload}
            />
            {iconUploadTotal && (
              <>
                <StyledCircularProgress
                  color="inherit"
                  value={iconUploadPercentage}
                  variant="determinate"
                  size="100%"
                  style={{ pointerEvents: "none" }}
                />
                <StyledPercentageTypography variant="caption">{`${Math.round(
                  iconUploadPercentage
                )}%`}</StyledPercentageTypography>
              </>
            )}
          </StyledIconButtonArea>
        </StyledIconButtonAreaBackground>
      )}
    </Avatar>
  );
};

export default EditableAvatar;
