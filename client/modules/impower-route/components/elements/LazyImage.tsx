import styled from "@emotion/styled";
import React, {
  CSSProperties,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

const getCenter = (v1: number, v2: number): number => {
  return (v1 + v2) / 2;
};

const getTouchClientCenter = (
  event: React.TouchEvent
): { x: number; y: number } => {
  return {
    x: getCenter(event.touches[0].clientX, event.touches[1].clientX),
    y: getCenter(event.touches[0].clientY, event.touches[1].clientY),
  };
};

const getTouchPageCenter = (
  event: React.TouchEvent
): { x: number; y: number } => {
  return {
    x: getCenter(event.touches[0].pageX, event.touches[1].pageX),
    y: getCenter(event.touches[0].pageY, event.touches[1].pageY),
  };
};

const getTouchPageDistance = (event: React.TouchEvent): number => {
  return Math.hypot(
    event.touches[0].pageX - event.touches[1].pageX,
    event.touches[0].pageY - event.touches[1].pageY
  );
};

const StyledLazyImage = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: inherit;
  overflow: hidden;
`;

const StyledImage = styled.img`
  position: relative;
  width: 100%;
  height: 100%;
  opacity: 0;
  border-radius: inherit;
  transition: opacity 0.3s ease;
`;

const StyledPlaceholder = styled(StyledImage)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  transition: opacity 0.3s ease;
`;

interface LazyImageProps {
  "src": string;
  "placeholder"?: string;
  "loadingColor"?: string;
  "transitionDuration"?: number;
  "objectFit"?: "contain" | "cover" | "fill" | "none" | "scale-down";
  "placeholderObjectFit"?: "contain" | "cover" | "fill" | "none" | "scale-down";
  "aria-label"?: string;
  "alt"?: string;
  "pinchAndZoom"?: boolean;
  "style"?: CSSProperties;
  "innerStyle"?: CSSProperties;
  "onError"?: React.ReactEventHandler<HTMLImageElement>;
}

export const LazyImage = (props: LazyImageProps): JSX.Element => {
  const {
    src,
    placeholder,
    loadingColor,
    objectFit = "contain",
    placeholderObjectFit = "cover",
    "aria-label": ariaLabel,
    alt,
    pinchAndZoom,
    style,
    innerStyle,
    onError,
  } = props;

  const [placeholderVisible, setPlaceholderVisible] = useState(false);
  const [imageVisible, setImageVisible] = useState(false);
  const startTouchCenter = useRef<{ x: number; y: number }>();
  const startTouchDistance = useRef<number>();
  const imageElementScale = useRef<number>();

  const handleLoadPlaceholder = useCallback(() => {
    setPlaceholderVisible(true);
  }, []);

  const handleLoadImage = useCallback(() => {
    setImageVisible(true);
  }, []);

  const currentStyle = useMemo(
    () => ({
      backgroundColor: imageVisible ? undefined : loadingColor,
      ...style,
    }),
    [imageVisible, loadingColor, style]
  );

  const currentPlaceholderStyle = useMemo(
    () => ({
      objectFit: placeholderObjectFit,
      opacity:
        (placeholder && !src) || (placeholderVisible && !imageVisible)
          ? 1
          : undefined,
    }),
    [imageVisible, placeholder, placeholderObjectFit, placeholderVisible, src]
  );

  const currentImageStyle = useMemo(
    () => ({
      objectFit,
      opacity: imageVisible ? 1 : undefined,
      ...innerStyle,
    }),
    [imageVisible, innerStyle, objectFit]
  );

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    const imageElement = event.target as HTMLImageElement;
    if (imageElement && event.touches.length === 2) {
      event.preventDefault(); // Prevent page scroll

      imageElement.style.transition = "none";
      imageElement.style.willChange = "transform";

      // Calculate transform origin
      const rect = imageElement.getBoundingClientRect();
      const touchClientCenter = getTouchClientCenter(event);
      const originX = touchClientCenter.x - rect.x;
      const originY = touchClientCenter.y - rect.y;
      imageElement.style.transformOrigin = `${originX}px ${originY}px`;

      // Calculate where the fingers have started on the X and Y axis
      startTouchCenter.current = getTouchPageCenter(event);
      startTouchDistance.current = getTouchPageDistance(event);
    }
  }, []);

  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    const imageElement = event.target as HTMLImageElement;
    if (imageElement && event.touches.length === 2) {
      event.preventDefault(); // Prevent page scroll

      const deltaDistance = getTouchPageDistance(event);
      const scale = deltaDistance / startTouchDistance.current;

      imageElementScale.current = Math.min(Math.max(1, scale), 4);

      // Calculate how much the fingers have moved on the X and Y axis
      const currentTouchCenter = getTouchPageCenter(event);
      const deltaX = currentTouchCenter.x - startTouchCenter.current.x;
      const deltaY = currentTouchCenter.y - startTouchCenter.current.y;

      // Transform the image to make it grow and move with fingers
      const transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${imageElementScale.current})`;
      imageElement.style.transform = transform;
    }
  }, []);

  const handleTouchEnd = useCallback((event: React.TouchEvent) => {
    const imageElement = event.target as HTMLImageElement;
    if (imageElement) {
      imageElement.style.transition = `transform 0.2s ease`;
      imageElement.style.transform = null;
    }
  }, []);

  return (
    <StyledLazyImage style={currentStyle}>
      {placeholder && (
        <StyledPlaceholder
          src={placeholder}
          onLoad={handleLoadPlaceholder}
          aria-label="hidden"
          style={currentPlaceholderStyle}
        />
      )}
      {src && (
        <StyledImage
          onTouchStart={pinchAndZoom ? handleTouchStart : undefined}
          onTouchMove={pinchAndZoom ? handleTouchMove : undefined}
          onTouchEnd={pinchAndZoom ? handleTouchEnd : undefined}
          src={src}
          onLoad={handleLoadImage}
          onError={onError}
          aria-label={ariaLabel}
          alt={alt}
          style={currentImageStyle}
        />
      )}
    </StyledLazyImage>
  );
};

export default LazyImage;
