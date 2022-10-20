import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import React, { useCallback, useContext, useEffect, useState } from "react";
import PenToSquareSolidIcon from "../../../../resources/icons/solid/pen-to-square.svg";
import {
  FileExtension,
  getFileContentType,
  StorageFile,
} from "../../../impower-core";
import { Alignment, getAlignmentStyle } from "../../../impower-data-store";
import { FontIcon } from "../../../impower-icon";
import { getFileSizeLimit, StorageError } from "../../../impower-storage";
import { ToastContext, toastTop } from "../../../impower-toast";
import { Breakpoint } from "../../styles/breakpoint";
import FadeAnimation from "../animations/FadeAnimation";
import Cover from "./Cover";

const StyledAlignmentArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  padding: ${(props): string => props.theme.spacing(2)};
  margin-bottom: 8%;
  pointer-events: none;
`;

const StyledLogoArea = styled.div`
  min-height: ${(props): string => props.theme.spacing(8)};
  position: relative;
  border-radius: ${(props): string => props.theme.spacing(4)};
`;

const StyledImage = styled.img`
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0;
`;

const StyledLogoButtonAreaBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
  display: flex;
`;

const StyledLogoButtonArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
  display: flex;

  transition: 0.2s ease;
  &:hover {
    background-color: ${(props): string => props.theme.colors.black30};
  }
`;

const StyledLogoButton = styled(Button)`
  pointer-events: auto;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  text-align: center;
  white-space: pre;
  line-height: 1.2rem;
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  color: white;
  padding: 0;

  border-radius: inherit;
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  display: flex;
  padding: 0;
`;

const StyledLogoButtonContent = styled(FadeAnimation)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
`;

const StyledDarkOverlay = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: ${(props): string => props.theme.colors.black20};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${(props): string => props.theme.spacing(2)}
    ${(props): string => props.theme.spacing(3)};
  border-radius: inherit;
`;

const StyledCoverButtonBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

const StyledCoverButtonForeground = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
`;

const StyledCoverButtonArea = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  border-radius: inherit;

  transition: 0.2s ease;
  &:hover {
    background-color: ${(props): string => props.theme.colors.black30};
  }
`;

const StyledCoverButton = styled(Button)`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
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
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
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

const StyledCoverButtonContent = styled(FadeAnimation)`
  position: absolute;
  top: 0;
  left: 0;
  width: ${(props): string => props.theme.spacing(8)};
  height: ${(props): string => props.theme.spacing(8)};
  padding: ${(props): string => props.theme.spacing(1.5)};
`;

const StyledCoverButtonLabel = styled.div`
  position: absolute;
  top: ${(props): string => props.theme.spacing(4)};
  left: ${(props): string => props.theme.spacing(3)};
  bottom: 0;
  right: 0;
  transform: rotate(-45deg);
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

const StyledProgressBar = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: ${(props): string => props.theme.colors.black50};
  pointer-events: none;
  width: 100%;
  height: 100%;
  transition: transform 0.2 ease;
`;

const StyledFontIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1)};
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
          accept={accept}
          id={id}
          type="file"
          onChange={(e): void => onUploadFile(e.target.files)}
        />
        <StyledLabel
          htmlFor={id}
          style={{
            borderWidth: draggingFile ? "medium" : undefined,
            borderStyle: draggingFile ? "dashed" : undefined,
          }}
        />
      </>
    );
  }
);

interface CoverUploadButtonProps {
  labelVisible: boolean;
  onUploadFile: (files: FileList) => void;
}

const CoverUploadButton = React.memo(
  (props: CoverUploadButtonProps): JSX.Element => {
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
      <StyledCoverButton
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <StyledCoverButtonContent
          initial={labelVisible ? 1 : 0}
          animate={labelVisible ? 1 : 0}
          duration={0.2}
        >
          <FontIcon
            aria-label="Upload Cover"
            size={theme.fontSize.adornmentIcon}
          >
            <PenToSquareSolidIcon />
          </FontIcon>
          <StyledCoverButtonLabel>{`Cover`}</StyledCoverButtonLabel>
        </StyledCoverButtonContent>
        <UploadButtonContent
          id="cover-input"
          accept="image/*"
          draggingFile={draggingFile}
          onUploadFile={onUploadFile}
        />
      </StyledCoverButton>
    );
  }
);

interface LogoUploadButtonProps {
  labelVisible: boolean;
  onUploadFile: (files: FileList) => void;
}

const LogoUploadButton = React.memo(
  (props: LogoUploadButtonProps): JSX.Element => {
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
      <StyledLogoButton
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <StyledLogoButtonContent
          initial={labelVisible ? 1 : 0}
          animate={labelVisible ? 1 : 0}
          duration={0.2}
        >
          <StyledDarkOverlay>
            <StyledFontIconArea>
              <FontIcon
                aria-label="Upload Logo"
                size={theme.fontSize.smallIcon}
              >
                <PenToSquareSolidIcon />
              </FontIcon>
            </StyledFontIconArea>
            {`Upload Logo`}
          </StyledDarkOverlay>
        </StyledLogoButtonContent>
        <UploadButtonContent
          id="logo-input"
          accept="image/*"
          draggingFile={draggingFile}
          onUploadFile={onUploadFile}
        />
      </StyledLogoButton>
    );
  }
);

interface EditableCoverProps {
  color?: string;
  logoSrc?: string;
  coverSrc?: string;
  logoAlignment?: Alignment;
  pattern?: string;
  patternScale?: number;
  name?: string;
  edit?: boolean;
  uid?: string;
  folded?: boolean;
  breakpoint?: Breakpoint;
  scrollY?: number;
  logoWidth?: string | number;
  onFolded?: (folded: boolean) => void;
  onUploadLogo?: (file: StorageFile) => void;
  onUploadCover?: (file: StorageFile) => void;
  onError?: (error: StorageError) => void;
  getPlaceholderUrl?: (fileUrl: string) => string;
}

const EditableCover = (props: EditableCoverProps): JSX.Element => {
  const {
    color,
    logoSrc,
    coverSrc,
    logoAlignment,
    pattern,
    patternScale,
    name,
    edit,
    uid,
    folded,
    breakpoint,
    scrollY,
    logoWidth = "70%",
    onFolded = (): void => null,
    onUploadLogo = (): void => null,
    onUploadCover = (): void => null,
    onError = (): void => null,
    getPlaceholderUrl,
  } = props;
  const [coverUploadProgress, setCoverUploadProgress] = useState<number>();
  const [coverUploadTotal, setCoverUploadTotal] = useState<number>();
  const [coverFileUrl, setCoverFileUrl] = useState(coverSrc);
  const [coverUploadTextVisible, setCoverUploadTextVisible] = useState(
    Boolean(!coverFileUrl)
  );
  const [logoUploadProgress, setLogoUploadProgress] = useState<number>();
  const [logoUploadTotal, setLogoUploadTotal] = useState<number>();
  const [logoFileUrl, setLogoFileUrl] = useState(logoSrc);
  const [logoUploadTextVisible, setLogoUploadTextVisible] = useState(
    Boolean(!logoFileUrl)
  );

  const [, toastDispatch] = useContext(ToastContext);

  const logoUUploadRatio = Math.max(0, logoUploadProgress / logoUploadTotal);
  const logoUploadPercentage = logoUUploadRatio * 100;
  const coverUploadRatio = Math.max(0, coverUploadProgress / coverUploadTotal);
  const coverUploadPercentage = coverUploadRatio * 100;

  useEffect(() => {
    setLogoFileUrl(logoSrc);
    if (logoSrc) {
      setLogoUploadTextVisible(false);
    } else {
      setLogoUploadTextVisible(true);
    }
  }, [logoSrc]);

  useEffect(() => {
    setCoverFileUrl(coverSrc);
    if (coverSrc) {
      setCoverUploadTextVisible(false);
    } else {
      setCoverUploadTextVisible(true);
    }
  }, [coverSrc]);

  const handleUploadLogo = useCallback(
    async (files: FileList) => {
      if (!files || files.length === 0) {
        return;
      }

      const file = files?.[0];
      const lastDot = file.name.lastIndexOf(".");
      const ext = file.name.substring(lastDot + 1) as FileExtension;

      if (file.size > getFileSizeLimit()) {
        const error = "File size must be less than 10mb";
        toastDispatch(toastTop(error, "error"));
        return;
      }

      if (!uid) {
        return;
      }

      const fileUrl = URL.createObjectURL(file);
      setLogoFileUrl(fileUrl);

      setLogoUploadTotal(undefined);
      setLogoUploadProgress(0);

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
            setLogoUploadProgress(snapshot.bytesTransferred);
            setLogoUploadTotal(snapshot.totalBytes);
          }
        );
        setLogoUploadTotal(undefined);
        onUploadLogo({
          ...uploadedFile,
        } as StorageFile);
      } catch (error) {
        setLogoUploadTotal(undefined);
        onError(error);
        const logError = (
          await import("../../../impower-logger/utils/logError")
        ).default;
        logError("Storage", error);
      }
    },
    [uid, toastDispatch, onUploadLogo, onError]
  );

  const handleUploadCover = useCallback(
    async (files: FileList) => {
      if (!files || files.length === 0) {
        return;
      }

      const file = files?.[0];
      const lastDot = file.name.lastIndexOf(".");
      const ext = file.name.substring(lastDot + 1) as FileExtension;

      if (file.size > getFileSizeLimit()) {
        const error = "File size must be less than 10mb";
        toastDispatch(toastTop(error, "error"));
        return;
      }

      if (!uid) {
        return;
      }

      const fileUrl = URL.createObjectURL(file);
      setCoverFileUrl(fileUrl);

      setCoverUploadTotal(undefined);
      setCoverUploadProgress(0);

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
            setCoverUploadProgress(snapshot.bytesTransferred);
            setCoverUploadTotal(snapshot.totalBytes);
          }
        );
        setCoverUploadTotal(undefined);
        onUploadCover({
          ...uploadedFile,
        } as StorageFile);
      } catch (error) {
        setCoverUploadTotal(undefined);
        onError(error);
        const logError = (
          await import("../../../impower-logger/utils/logError")
        ).default;
        logError("Storage", error);
      }
    },
    [uid, toastDispatch, onUploadCover, onError]
  );

  return (
    <Cover
      backgroundColor={color}
      logoSrc={logoFileUrl}
      coverSrc={coverFileUrl}
      logoAlignment={logoAlignment}
      pattern={pattern}
      patternScale={patternScale}
      folded={folded}
      breakpoint={breakpoint}
      scrollY={scrollY}
      name={edit ? undefined : name}
      logoWidth={logoWidth}
      onFolded={onFolded}
      getPlaceholderUrl={getPlaceholderUrl}
    >
      {edit && (
        <>
          <StyledCoverButtonBackground>
            <StyledCoverButtonForeground>
              <StyledCoverButtonArea
                onPointerEnter={(): void => {
                  setCoverUploadTextVisible(true);
                }}
                onPointerLeave={(): void => {
                  if (coverFileUrl) {
                    setCoverUploadTextVisible(false);
                  } else {
                    setCoverUploadTextVisible(true);
                  }
                }}
              >
                <CoverUploadButton
                  labelVisible={coverUploadTextVisible}
                  onUploadFile={handleUploadCover}
                />
              </StyledCoverButtonArea>
            </StyledCoverButtonForeground>
          </StyledCoverButtonBackground>
          {coverUploadTotal && (
            <>
              <StyledProgressBar
                style={{
                  transform: `scaleY(${coverUploadRatio})`,
                }}
              />
              <StyledPercentageTypography variant="caption">{`${Math.round(
                coverUploadPercentage
              )}%`}</StyledPercentageTypography>
            </>
          )}
          <StyledAlignmentArea
            style={{
              ...getAlignmentStyle(logoAlignment),
              marginBottom: breakpoint <= Breakpoint.sm ? 0 : undefined,
            }}
          >
            <StyledLogoArea style={{ width: logoWidth }}>
              {logoFileUrl && <StyledImage src={logoFileUrl} />}
              <StyledLogoButtonAreaBackground
                style={{
                  backgroundColor: logoFileUrl ? undefined : color,
                }}
              >
                <StyledLogoButtonArea
                  onPointerEnter={(): void => {
                    setLogoUploadTextVisible(true);
                  }}
                  onPointerLeave={(): void => {
                    if (logoFileUrl) {
                      setLogoUploadTextVisible(false);
                    } else {
                      setLogoUploadTextVisible(true);
                    }
                  }}
                >
                  <LogoUploadButton
                    labelVisible={logoUploadTextVisible}
                    onUploadFile={handleUploadLogo}
                  />
                </StyledLogoButtonArea>
              </StyledLogoButtonAreaBackground>
              {logoUploadTotal && (
                <>
                  <StyledProgressBar
                    style={{
                      transform: `scaleX(${logoUUploadRatio})`,
                    }}
                  />
                  <StyledPercentageTypography variant="caption">{`${Math.round(
                    logoUploadPercentage
                  )}%`}</StyledPercentageTypography>
                </>
              )}
            </StyledLogoArea>
          </StyledAlignmentArea>
        </>
      )}
    </Cover>
  );
};

export default EditableCover;
