import styled from "@emotion/styled";
import React from "react";

export type LoadEvent = React.SyntheticEvent<HTMLElement> & {
  target?: { offsetWidth?: number; offsetHeight?: number };
};

const StyledVideoPreviewArea = styled.div`
  flex: 1;
  display: flex;
  position: relative;
  transition: opacity 0.3s ease;
`;

const StyledVideoPreview = styled.video`
  flex: 1;
  &:focus {
    outline: none;
  }
`;

interface VideoPreviewProps {
  src: string;
  style?: React.CSSProperties;
  innerStyle?: React.CSSProperties;
  onLoad?: (e: LoadEvent) => void;
}

const VideoPreview = React.memo((props: VideoPreviewProps): JSX.Element => {
  const { src, style, innerStyle, onLoad } = props;
  return (
    <StyledVideoPreviewArea
      className={StyledVideoPreviewArea.displayName}
      key={src}
      style={style}
    >
      <StyledVideoPreview controls onLoad={onLoad} style={innerStyle}>
        <source src={src} />
        Your browser does not support the video element.
      </StyledVideoPreview>
    </StyledVideoPreviewArea>
  );
});

export default VideoPreview;
