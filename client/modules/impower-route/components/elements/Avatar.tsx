import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import React, {
  PropsWithChildren,
  useCallback,
  useMemo,
  useState,
} from "react";
import { getInitials } from "../../../impower-core";
import { FontIcon } from "../../../impower-icon";
import LazyImage from "./LazyImage";

const StyledAvatar = styled.div`
  position: relative;
  border-radius: 50%;
  width: 40px;
  height: 40px;
`;

const StyledDarkOverlay = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
  background-color: ${(props): string => props.theme.colors.black20};
  color: white;
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  font-size: ${(props): string => props.theme.fontSize.initials};
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
`;

const StyledIconButton = styled(Button)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  text-align: center;
  white-space: pre;
  line-height: 1.2rem;
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  color: white;
  padding: 0;
  background-color: transparent;
  min-width: 0;
  width: 100%;
  height: 100%;

  &.MuiButton-containedPrimary:hover {
    background-color: ${(props): string => props.theme.colors.black20};
  }

  border-radius: inherit;
`;

const StyledButtonContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: opacity 0.3s ease;
  border-radius: inherit;
`;

const StyledInitialsTypography = styled(Typography)`
  font-weight: ${(props): number => props.theme.fontWeight.bold};
`;

interface AvatarProps {
  "backgroundColor"?: string;
  "src"?: string;
  "icon"?: React.ReactNode;
  "iconColor"?: string;
  "size"?: string | number;
  "fontSize"?: string | number;
  "href"?: string;
  "objectFit"?: "none" | "contain" | "fill" | "cover" | "scale-down";
  "aria-label"?: string;
  "alt"?: string;
  "style"?: React.CSSProperties;
  "onClick"?: (e: React.MouseEvent) => void;
  "onPointerDown"?: (e: React.MouseEvent) => void;
  "onMouseDown"?: (e: React.MouseEvent) => void;
  "onTouchStart"?: (e: React.TouchEvent) => void;
  "getPlaceholderUrl"?: (fileUrl: string) => string;
}

const Avatar = React.memo(
  (props: PropsWithChildren<AvatarProps>): JSX.Element => {
    const {
      backgroundColor,
      src,
      icon,
      iconColor,
      size,
      fontSize,
      href,
      objectFit = "cover",
      "aria-label": ariaLabel,
      alt,
      style,
      onClick,
      onPointerDown,
      onMouseDown,
      onTouchStart,
      getPlaceholderUrl,
      children,
    } = props;

    const animationClass = backgroundColor ? "" : "MuiSkeleton-pulse";
    const validBackgroundColor = backgroundColor || "white";
    const [imageError, setImageError] = useState(false);

    const handleError = useCallback(() => {
      setImageError(true);
    }, []);

    const backgroundImageExists = src && !imageError;

    const avatarStyle: React.CSSProperties = useMemo(
      () => ({
        backgroundColor: validBackgroundColor,
        width: size,
        height: size,
        ...style,
      }),
      [size, style, validBackgroundColor]
    );

    const lazyImageStyle: React.CSSProperties = useMemo(
      () => ({ width: "100%", height: "100%" }),
      []
    );

    const contentButtonStyle: React.CSSProperties = useMemo(
      () => ({ opacity: backgroundImageExists ? 0 : 1 }),
      [backgroundImageExists]
    );

    const initialsStyle: React.CSSProperties = useMemo(
      () => ({ fontSize }),
      [fontSize]
    );

    return (
      <StyledAvatar className={animationClass} style={avatarStyle}>
        <StyledDarkOverlay className={StyledDarkOverlay.displayName}>
          {src && (
            <LazyImage
              src={src}
              placeholder={
                getPlaceholderUrl ? getPlaceholderUrl(src) : undefined
              }
              aria-label={ariaLabel}
              alt={alt}
              objectFit={objectFit}
              style={lazyImageStyle}
              onError={handleError}
            />
          )}
          <StyledButtonContent style={contentButtonStyle}>
            {alt === "[deleted]" ? null : icon ? (
              <FontIcon aria-label={alt} color={iconColor} size={fontSize}>
                {icon}
              </FontIcon>
            ) : (
              <StyledInitialsTypography style={initialsStyle}>
                {getInitials(alt).toUpperCase()}
              </StyledInitialsTypography>
            )}
            {!children && (onClick || onPointerDown || href) && (
              <StyledIconButton
                variant="contained"
                color="primary"
                disableElevation
                aria-label={ariaLabel}
                onPointerDown={onPointerDown}
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
                onClick={onClick}
                href={href}
              />
            )}
          </StyledButtonContent>
          {children}
        </StyledDarkOverlay>
      </StyledAvatar>
    );
  }
);

export default Avatar;
