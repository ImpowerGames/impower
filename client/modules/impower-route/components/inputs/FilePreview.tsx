import styled from "@emotion/styled";
import React, { useMemo } from "react";
import { getFileContentType, StorageFile } from "../../../impower-core";
import { getAbsoluteUrl } from "../../../impower-storage";
import FadeAnimation from "../animations/FadeAnimation";
import AudioPreview from "./AudioPreview";
import ImagePreview from "./ImagePreview";
import TextPreview from "./TextPreview";
import VideoPreview from "./VideoPreview";

export type LoadEvent = React.SyntheticEvent<HTMLElement> & {
  target?: { offsetWidth?: number; offsetHeight?: number };
};

const StyledDataPreview = styled.div`
  display: flex;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 100%;
  min-width: 100%;
  background-color: inherit;
  min-height: ${(props): string => props.theme.spacing(8)};
`;

const StyledMotionArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  min-width: 100%;
  background-color: inherit;
`;

interface FilePreviewProps {
  value: StorageFile;
  waveform?: number[];
  absolute?: boolean;
  zoomPan?: boolean; // TODO: allow zooming/panning image
  style?: React.CSSProperties;
  onLoad?: (e: LoadEvent) => void;
  onWaveformReady?: (waveform: number[]) => void;
}

const FilePreview = React.memo(
  (props: FilePreviewProps): JSX.Element | null => {
    const { value, waveform, absolute, style, onLoad, onWaveformReady } = props;

    const { fileUrl, storageKey } = value;
    const fileType = value.fileType || getFileContentType(value.fileExtension);

    const previewUrl = useMemo(
      () =>
        fileUrl || (storageKey ? getAbsoluteUrl(`/${storageKey}`) : fileUrl),
      [fileUrl, storageKey]
    );

    if (!previewUrl) {
      return null;
    }

    return (
      <StyledDataPreview
        className={StyledDataPreview.displayName}
        style={{
          position: absolute ? "absolute" : "relative",
          flex:
            fileType?.toLowerCase().startsWith("image") ||
            fileType?.toLowerCase().startsWith("text")
              ? 1
              : undefined,
        }}
      >
        {fileType?.toLowerCase().startsWith("image") && (
          <FadeAnimation key={previewUrl} duration={0.1}>
            <StyledMotionArea
              style={{ position: absolute ? "absolute" : "relative" }}
            >
              <ImagePreview
                src={previewUrl}
                innerStyle={style}
                onLoad={onLoad}
              />
            </StyledMotionArea>
          </FadeAnimation>
        )}
        {fileType?.toLowerCase().startsWith("audio") && (
          <FadeAnimation key={previewUrl} duration={0.1}>
            <StyledMotionArea
              style={{ position: absolute ? "absolute" : "relative" }}
            >
              <AudioPreview
                src={previewUrl}
                waveform={waveform}
                innerStyle={style}
                onLoad={onLoad}
                onWaveformReady={onWaveformReady}
              />
            </StyledMotionArea>
          </FadeAnimation>
        )}
        {fileType?.toLowerCase().startsWith("video") && (
          <FadeAnimation key={previewUrl} duration={0.1}>
            <StyledMotionArea
              key={previewUrl}
              style={{ position: absolute ? "absolute" : "relative" }}
            >
              <VideoPreview
                src={previewUrl}
                innerStyle={style}
                onLoad={onLoad}
              />
            </StyledMotionArea>
          </FadeAnimation>
        )}
        {fileType?.toLowerCase().startsWith("text") && (
          <FadeAnimation key={previewUrl} duration={0.1}>
            <StyledMotionArea
              key={previewUrl}
              style={{ position: absolute ? "absolute" : "relative" }}
            >
              <TextPreview
                src={previewUrl}
                innerStyle={style}
                onLoad={onLoad}
              />
            </StyledMotionArea>
          </FadeAnimation>
        )}
      </StyledDataPreview>
    );
  }
);

export default FilePreview;
