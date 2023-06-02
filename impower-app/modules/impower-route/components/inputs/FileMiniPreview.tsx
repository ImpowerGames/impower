import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, { useCallback } from "react";
import ImagePolaroidSolidIcon from "../../../../resources/icons/solid/image-polaroid.svg";
import TextSolidIcon from "../../../../resources/icons/solid/text.svg";
import UploadSolidIcon from "../../../../resources/icons/solid/upload.svg";
import VideoSolidIcon from "../../../../resources/icons/solid/video.svg";
import VolumeHighSolidIcon from "../../../../resources/icons/solid/volume-high.svg";
import { StorageFile } from "../../../impower-core";
import { useDialogNavigation } from "../../../impower-dialog";
import { TransparencyPattern } from "../../../impower-react-color-picker";
import { getPlaceholderUrl } from "../../../impower-storage";
import LazyImage from "../elements/LazyImage";
import PreviewButton from "./PreviewButton";

const StyledFileMiniPreview = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
`;

interface ImagePreviewProps {
  src: string;
  placeholder: string;
}

const ImagePreview = React.memo((props: ImagePreviewProps): JSX.Element => {
  const { src, placeholder } = props;
  const theme = useTheme();
  if (!src) {
    return null;
  }
  return (
    <TransparencyPattern
      style={{
        overflow: "hidden",
        borderRadius: theme.borderRadius.field,
      }}
    >
      <LazyImage
        src={src}
        placeholder={placeholder}
        loadingColor="white"
        objectFit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </TransparencyPattern>
  );
});

const StyledFilePreviewArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

const getFilePreviewIcon = (fileType: string): string => {
  if (fileType.toLowerCase().startsWith("image")) {
    return ImagePolaroidSolidIcon;
  }
  if (fileType.toLowerCase().startsWith("audio")) {
    return VolumeHighSolidIcon;
  }
  if (fileType.toLowerCase().startsWith("video")) {
    return VideoSolidIcon;
  }
  if (fileType.toLowerCase().startsWith("text")) {
    return TextSolidIcon;
  }
  return undefined;
};

interface FileMiniPreviewProps {
  value?: StorageFile;
  interactable?: boolean;
  draggingFile?: boolean;
  style?: React.CSSProperties;
}

const FileMiniPreview = React.memo(
  (props: FileMiniPreviewProps): JSX.Element => {
    const { value, interactable, draggingFile, style } = props;
    const theme = useTheme();

    const { storageKey, fileUrl, fileType, blurUrl } = value;

    const [openInfoDialog] = useDialogNavigation("i");

    const handleOpenDialog = useCallback(() => {
      openInfoDialog("preview");
    }, [openInfoDialog]);

    const tooltip = interactable ? "Open Preview" : undefined;
    const FilePreviewIcon = getFilePreviewIcon(fileType);
    const icon = draggingFile ? (
      <UploadSolidIcon />
    ) : fileUrl || storageKey ? (
      <FilePreviewIcon />
    ) : (
      <UploadSolidIcon />
    );
    const iconColor = interactable
      ? fileUrl
        ? theme.palette.secondary.main
        : `${theme.palette.secondary.main}80`
      : undefined;

    const placeholder =
      fileType !== "image/svg"
        ? blurUrl || getPlaceholderUrl(fileUrl)
        : undefined;

    if (!fileUrl) {
      return (
        <StyledFileMiniPreview style={style}>
          <PreviewButton icon={icon} iconColor={iconColor}>
            <StyledFilePreviewArea>
              {fileType && fileType.toLowerCase().startsWith("image") && (
                <ImagePreview src={fileUrl} placeholder={placeholder} />
              )}
            </StyledFilePreviewArea>
          </PreviewButton>
        </StyledFileMiniPreview>
      );
    }

    return (
      <StyledFileMiniPreview style={style}>
        <PreviewButton
          icon={icon}
          iconColor={iconColor}
          tooltip={tooltip}
          disabled={!interactable}
          onClick={handleOpenDialog}
        >
          <StyledFilePreviewArea>
            {fileType && fileType.toLowerCase().startsWith("image") && (
              <ImagePreview src={fileUrl} placeholder={placeholder} />
            )}
          </StyledFilePreviewArea>
        </PreviewButton>
      </StyledFileMiniPreview>
    );
  }
);

export default FileMiniPreview;
