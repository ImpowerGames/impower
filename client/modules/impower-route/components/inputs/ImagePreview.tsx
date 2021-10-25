import styled from "@emotion/styled";
import React, {
  PropsWithChildren,
  useCallback,
  useMemo,
  useState,
} from "react";

export type LoadEvent = React.SyntheticEvent<HTMLElement> & {
  target?: { offsetWidth?: number; offsetHeight?: number };
};

const StyledImagePreviewArea = styled.div`
  flex: 1;
  display: flex;
  position: relative;
  justify-content: center;
  align-items: flex-start;
  transition: opacity 0.3s ease;
`;

const StyledImagePreview = styled.img`
  backface-visibility: hidden;
  user-select: none;
  user-drag: none;
  -webkit-user-drag: none;
  width: 100%;
  object-fit: contain;
  object-position: 50% 50%;
  max-width: 100%;
`;

interface ImagePreviewProps {
  src: string;
  style?: React.CSSProperties;
  innerStyle?: React.CSSProperties;
  onLoad?: (e: LoadEvent) => void;
}

const ImagePreview = React.memo(
  (props: PropsWithChildren<ImagePreviewProps>): JSX.Element => {
    const { src, style, innerStyle, onLoad, children } = props;
    const [visible, setVisible] = useState(false);

    const handleLoad = useCallback(
      (e) => {
        const imageProps = e as LoadEvent;
        setVisible(true);
        if (imageProps?.target?.offsetHeight) {
          if (onLoad) {
            onLoad(e);
          }
        }
      },
      [onLoad]
    );

    const imagePreviewAreaStyle = useMemo(
      () => ({ opacity: visible ? 1 : 0, ...style }),
      [style, visible]
    );

    return (
      <StyledImagePreviewArea style={imagePreviewAreaStyle}>
        <StyledImagePreview src={src} onLoad={handleLoad} style={innerStyle} />
        {children}
      </StyledImagePreviewArea>
    );
  }
);

export default ImagePreview;
