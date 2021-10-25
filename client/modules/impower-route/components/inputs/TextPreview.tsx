import styled from "@emotion/styled";
import React from "react";

export type LoadEvent = React.SyntheticEvent<HTMLElement> & {
  target?: { offsetWidth?: number; offsetHeight?: number };
};

const StyledTextPreviewArea = styled.div`
  flex: 1;
  display: flex;
  position: relative;
  transition: opacity 0.3s ease;
`;

const StyledTextPreview = styled.object`
  flex: 1;
  background-color: white;
`;

interface TextPreviewProps {
  src: string;
  style?: React.CSSProperties;
  innerStyle?: React.CSSProperties;
  onLoad?: (e: LoadEvent) => void;
}

const TextPreview = React.memo((props: TextPreviewProps): JSX.Element => {
  const { src, style, innerStyle, onLoad } = props;
  return (
    <StyledTextPreviewArea
      className={StyledTextPreviewArea.displayName}
      key={src}
      style={style}
    >
      <StyledTextPreview
        data={src}
        type="text/plain"
        style={innerStyle}
        onLoad={onLoad}
      />
    </StyledTextPreviewArea>
  );
});

export default TextPreview;
