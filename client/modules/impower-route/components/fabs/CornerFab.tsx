import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useBodyPaddingCallback } from "../../hooks/useBodyPaddingCallback";
import CornerButton from "./CornerButton";
import StyledButtonChildrenArea from "./StyledButtonChildrenArea";

const StyledShadowArea = styled.div`
  pointer-events: none;
  touch-action: none;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  contain: size layout style;
`;

const StyledShadowContent = styled.div`
  pointer-events: inherit;
  touch-action: inherit;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: 100px;
  display: flex;
  justify-content: flex-end;
`;

const StyledShadowCollapsedContent = styled.div`
  pointer-events: inherit;
  touch-action: inherit;
`;

const StyledShadowExpandedContent = styled.div`
  pointer-events: inherit;
  touch-action: inherit;
  position: absolute;
  bottom: 0;
  right: 0;
  width: 100%;
`;

const StyledShadow = styled.div`
  pointer-events: inherit;
  touch-action: inherit;
  border-radius: 100px;
  box-shadow: ${(props): string => props.theme.shadows[6]};
  display: inline-flex;
  vertical-align: middle;
  justify-content: center;
  align-items: center;
  white-space: nowrap;
  font-size: ${(props): string => props.theme.fontSize.regular};
  font-weight: 600;
  line-height: 1.75;
  text-transform: uppercase;
  position: relative;
`;

const StyledStaticWrapper = styled.div`
  pointer-events: none;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  justify-content: flex-end;
  contain: size layout;
`;

const StyledExpando = styled(StyledStaticWrapper)`
  border-radius: 100px;
  overflow: hidden;
  contain: size layout paint style;
`;

const StyledExpandedArea = styled.div`
  pointer-events: inherit;
  touch-action: inherit;
  border-radius: inherit;
  width: 100%;
`;

interface CornerShadowProps {
  size?: "large" | "medium" | "small";
  color?:
    | "inherit"
    | "primary"
    | "secondary"
    | "success"
    | "error"
    | "info"
    | "warning";
  disabled?: boolean;
  buttonStyle?: React.CSSProperties;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

const CornerShadow = React.memo((props: CornerShadowProps): JSX.Element => {
  const {
    disabled,
    size = "large",
    color = "primary",
    buttonStyle,
    fullWidth,
    children,
  } = props;
  const buttonSize = size === "small" ? 40 : size === "medium" ? 48 : 56;
  const theme = useTheme();
  const shadowStyle: React.CSSProperties = useMemo(
    () => ({
      height: buttonSize,
      width: fullWidth ? "100%" : buttonSize,
      ...buttonStyle,
      opacity: disabled ? 0 : undefined,
      visibility: disabled ? "hidden" : undefined,
      backgroundColor: theme?.palette[color]?.main,
    }),
    [buttonSize, buttonStyle, color, disabled, fullWidth, theme.palette]
  );
  const childrenAreaStyle = useMemo(
    () => ({
      left: fullWidth ? 0 : undefined,
      width: fullWidth ? "100%" : undefined,
      marginBottom: buttonSize,
    }),
    [buttonSize, fullWidth]
  );
  return (
    <StyledShadow aria-hidden style={shadowStyle}>
      {children && (
        <StyledButtonChildrenArea style={childrenAreaStyle}>
          {children}
        </StyledButtonChildrenArea>
      )}
    </StyledShadow>
  );
});

interface CollapsibleButtonProps {
  foregroundRef?: React.Ref<HTMLDivElement>;
  backgroundRef?: React.Ref<HTMLDivElement>;
  scrollSentinel?: HTMLElement;
  scrollParent?: HTMLElement;
  icon?: React.ReactNode;
  label: string;
  size?: "large" | "medium" | "small";
  color?:
    | "inherit"
    | "primary"
    | "secondary"
    | "success"
    | "error"
    | "info"
    | "warning";
  upload?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  buttonStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => void;
  onSecondary?: (e: React.MouseEvent) => void;
  onPointerEnter?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

const CollapsibleButton = React.memo(
  (props: PropsWithChildren<CollapsibleButtonProps>): JSX.Element => {
    const {
      foregroundRef,
      backgroundRef,
      scrollSentinel,
      scrollParent,
      icon,
      label,
      color,
      disabled,
      size = "large",
      fullWidth,
      buttonStyle,
      style,
      upload,
      children,
      onClick,
      onPointerEnter,
      onPointerLeave,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
    } = props;

    const buttonSize = size === "small" ? 40 : size === "medium" ? 48 : 56;

    const [expandedEl, setExpandedEl] = useState<HTMLDivElement>();
    const [contentEl, setContentEl] = useState<HTMLDivElement>();
    const fullWidthRef = useRef<boolean>(fullWidth);
    const buttonSizeRef = useRef<number>();
    const collapsedShadowRef = useRef<HTMLDivElement>();
    const expandedShadowRef = useRef<HTMLDivElement>();
    const expandedRef = useRef<HTMLDivElement>(expandedEl);
    const contentRef = useRef<HTMLDivElement>(contentEl);
    const iconRef = useRef<HTMLDivElement>();
    const labelRef = useRef<HTMLDivElement>();
    const expandedWidthRef = useRef<number>();
    const contentWidthRef = useRef<number>();
    const transformTransitionCallbackRef = useRef<() => void>();

    const setupHints = useCallback((): void => {
      if (expandedRef.current && !expandedRef.current.style.willChange) {
        expandedRef.current.style.willChange = "transform";
      }
      if (contentRef.current && !contentRef.current.style.willChange) {
        contentRef.current.style.willChange = "transform";
      }
      if (iconRef.current && !iconRef.current.style.backfaceVisibility) {
        iconRef.current.style.backfaceVisibility = "hidden";
      }
      if (labelRef.current && !labelRef.current.style.willChange) {
        labelRef.current.style.willChange = "opacity";
      }
      if (
        expandedShadowRef.current &&
        !expandedShadowRef.current.style.willChange
      ) {
        expandedShadowRef.current.style.willChange = "transform, opacity";
      }
      if (
        collapsedShadowRef.current &&
        !collapsedShadowRef.current.style.willChange
      ) {
        collapsedShadowRef.current.style.willChange = "transform, opacity";
      }
    }, []);

    const applyTransitions = useCallback(
      (duration: number, expand: boolean): void => {
        const ease = "ease";
        const transformTransition = `transform ${duration}s ${ease} ${duration}s`;
        const labelTransition = `opacity ${duration}s ${ease} ${duration}s`;
        const hideShadowTransition = `opacity ${duration}s ${ease} ${0}s`;
        const showShadowTransition = `opacity ${duration}s ${ease} ${
          duration * 2
        }s`;
        if (expandedRef.current) {
          expandedRef.current.style.transition = transformTransition;
        }
        if (contentRef.current) {
          contentRef.current.style.transition = transformTransition;
        }
        if (labelRef.current) {
          labelRef.current.style.transition = labelTransition;
        }
        if (expandedShadowRef.current) {
          expandedShadowRef.current.style.transition = expand
            ? showShadowTransition
            : hideShadowTransition;
        }
        if (collapsedShadowRef.current) {
          collapsedShadowRef.current.style.transition = expand
            ? hideShadowTransition
            : showShadowTransition;
        }
      },
      []
    );

    const removeTransitions = useCallback((): void => {
      if (expandedRef.current) {
        expandedRef.current.style.transition = null;
      }
      if (contentRef.current) {
        contentRef.current.style.transition = null;
      }
      if (labelRef.current) {
        labelRef.current.style.transition = null;
      }
      if (expandedShadowRef.current) {
        expandedShadowRef.current.style.transition = null;
      }
      if (collapsedShadowRef.current) {
        collapsedShadowRef.current.style.transition = null;
      }
    }, []);

    const applyEndStyles = useCallback(
      (expand: boolean, buttonSize: number): void => {
        if (expand) {
          if (expandedRef.current) {
            expandedRef.current.style.transform = `translate3d(0, 0, 0)`;
          }
          if (contentRef.current) {
            contentRef.current.style.transform = `translate3d(0, 0, 0)`;
          }
          if (labelRef.current) {
            labelRef.current.style.opacity = "1";
          }
          if (expandedShadowRef.current) {
            expandedShadowRef.current.style.opacity = "1";
          }
          if (collapsedShadowRef.current) {
            collapsedShadowRef.current.style.opacity = "0";
          }
        } else {
          if (expandedRef.current) {
            expandedRef.current.style.transform = `translate3d(calc(100% - ${buttonSize}px), 0, 0)`;
          }
          if (contentRef.current) {
            contentRef.current.style.transform = `translate3d(${
              (expandedWidthRef.current - contentWidthRef.current) * -0.5
            }px, 0, 0)`;
          }
          if (labelRef.current) {
            labelRef.current.style.opacity = "0";
          }
          if (expandedShadowRef.current) {
            expandedShadowRef.current.style.opacity = "0";
          }
          if (collapsedShadowRef.current) {
            collapsedShadowRef.current.style.opacity = "1";
          }
        }
      },
      []
    );

    const doAnimation = useCallback((): void => {
      window.requestAnimationFrame(() => {
        const expand =
          fullWidthRef.current !== undefined ? fullWidthRef.current : true;
        const buttonSize = buttonSizeRef.current;
        const duration = 0.2;
        applyTransitions(duration, expand);
        window.requestAnimationFrame(() => {
          applyEndStyles(expand, buttonSize);
          transformTransitionCallbackRef.current = removeTransitions;
        });
      });
    }, [applyEndStyles, applyTransitions, removeTransitions]);

    useEffect(() => {
      if (!scrollSentinel) {
        return (): void => null;
      }
      const onObserve = (entry: IntersectionObserverEntry): void => {
        if (
          entry &&
          (entry.boundingClientRect.width > 0 ||
            entry.boundingClientRect.height > 0)
        ) {
          const sentinelOnScreen =
            entry.isIntersecting || entry.intersectionRatio > 0;
          if (fullWidth === undefined) {
            const newFullWidth = sentinelOnScreen;
            if (fullWidthRef.current !== newFullWidth) {
              fullWidthRef.current = newFullWidth;
              buttonSizeRef.current = buttonSize;
              doAnimation();
            }
          }
        }
      };
      const observer = new IntersectionObserver(([entry]) => {
        onObserve(entry);
      });
      observer.observe(scrollSentinel);
      return (): void => {
        observer.disconnect();
      };
    }, [buttonSize, doAnimation, fullWidth, scrollSentinel]);

    useEffect(() => {
      if (!expandedEl || !contentEl) {
        return (): void => null;
      }
      const resizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.target === expandedEl) {
            const { width } = entry.contentRect;
            if (width > 0) {
              expandedWidthRef.current = width;
            }
          }
          if (entry.target === contentEl) {
            const { width } = entry.contentRect;
            if (width > 0) {
              contentWidthRef.current = width;
            }
          }
        });
        if (expandedWidthRef.current && contentWidthRef.current) {
          applyEndStyles(fullWidthRef.current, buttonSizeRef.current);
        }
      });
      resizeObserver.observe(expandedEl);
      resizeObserver.observe(contentEl);
      return (): void => {
        resizeObserver.disconnect();
      };
    }, [applyEndStyles, contentEl, expandedEl]);

    useEffect(() => {
      if (scrollSentinel) {
        return (): void => null;
      }
      if (!scrollParent) {
        return (): void => null;
      }
      const onScroll = (): void => {
        const scrollY =
          scrollParent === document.documentElement
            ? window.scrollY
            : scrollParent.scrollTop;
        if (fullWidth === undefined) {
          const newFullWidth = scrollY <= 1;
          if (fullWidthRef.current !== newFullWidth) {
            fullWidthRef.current = newFullWidth;
            buttonSizeRef.current = buttonSize;
            doAnimation();
          }
        }
      };
      if (scrollParent === document.documentElement) {
        window.addEventListener("scroll", onScroll, {
          passive: true,
        });
      } else {
        scrollParent.addEventListener("scroll", onScroll, {
          passive: true,
        });
      }
      return (): void => {
        if (scrollParent === document.documentElement) {
          window.removeEventListener("scroll", onScroll);
        } else {
          scrollParent.removeEventListener("scroll", onScroll);
        }
      };
    }, [buttonSize, doAnimation, fullWidth, scrollParent, scrollSentinel]);

    useEffect(() => {
      if (expandedRef.current) {
        if (
          fullWidthRef.current !== fullWidth ||
          buttonSizeRef.current !== buttonSize
        ) {
          fullWidthRef.current = fullWidth !== undefined ? fullWidth : true;
          if (buttonSizeRef.current === undefined) {
            buttonSizeRef.current = buttonSize;
            setupHints();
            removeTransitions();
            applyEndStyles(fullWidthRef.current, buttonSizeRef.current);
          } else {
            buttonSizeRef.current = buttonSize;
            setupHints();
            doAnimation();
          }
        }
      }
    }, [
      fullWidth,
      buttonSize,
      doAnimation,
      applyEndStyles,
      removeTransitions,
      setupHints,
    ]);

    const handleExpandedRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        expandedRef.current = instance;
        setExpandedEl(instance);
      }
    }, []);

    const handleContentRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        contentRef.current = instance;
        setContentEl(instance);
      }
    }, []);

    const expandoStyle = useMemo(
      () => ({
        height: buttonSize,
        transformOrigin: fullWidth ? "center" : `center right`,
        ...style,
      }),
      [buttonSize, fullWidth, style]
    );

    const expandedContentStyle = useMemo(
      () => ({
        height: buttonSize,
        ...buttonStyle,
      }),
      [buttonSize, buttonStyle]
    );

    const handleTransitionEnd = useCallback(
      (e) => {
        if (e.target === expandedEl && e.propertyName === "transform") {
          transformTransitionCallbackRef.current?.();
        }
      },
      [expandedEl]
    );

    return (
      <>
        <StyledShadowArea ref={backgroundRef} aria-hidden style={expandoStyle}>
          <StyledShadowContent>
            <StyledShadowCollapsedContent ref={collapsedShadowRef}>
              <CornerShadow
                disabled={disabled}
                size={size}
                color={color}
                buttonStyle={buttonStyle}
              >
                {children}
              </CornerShadow>
            </StyledShadowCollapsedContent>
            <StyledShadowExpandedContent
              ref={expandedShadowRef}
              style={expandedContentStyle}
            >
              <CornerShadow
                disabled={disabled}
                size={size}
                color={color}
                buttonStyle={buttonStyle}
                fullWidth
              >
                {children}
              </CornerShadow>
            </StyledShadowExpandedContent>
          </StyledShadowContent>
        </StyledShadowArea>
        <StyledExpando ref={foregroundRef} style={expandoStyle}>
          <StyledExpandedArea
            ref={handleExpandedRef}
            style={expandedContentStyle}
            onTransitionEnd={handleTransitionEnd}
          >
            <CornerButton
              variant="extended"
              disableElevation
              icon={icon}
              label={label}
              color={color}
              contentRef={handleContentRef}
              iconRef={iconRef}
              labelRef={labelRef}
              disabled={disabled}
              size={size}
              buttonStyle={buttonStyle}
              upload={upload}
              fullWidth
              onClick={onClick}
              onPointerEnter={onPointerEnter}
              onPointerLeave={onPointerLeave}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          </StyledExpandedArea>
        </StyledExpando>
      </>
    );
  }
);

export interface CornerFabProps {
  backgroundRef?: React.Ref<HTMLDivElement>;
  foregroundRef?: React.Ref<HTMLDivElement>;
  icon?: React.ReactNode;
  label?: string;
  size?: "large" | "medium" | "small";
  color?:
    | "inherit"
    | "primary"
    | "secondary"
    | "success"
    | "error"
    | "info"
    | "warning";
  upload?: boolean;
  disabled?: boolean;
  buttonStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  scrollSentinel?: HTMLElement;
  scrollParent?: HTMLElement;
  shrink?: boolean;
  onClick?: (e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => void;
  onPointerEnter?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  children?: React.ReactNode;
}

const CornerFab = React.memo((props: CornerFabProps): JSX.Element => {
  const {
    backgroundRef,
    foregroundRef,
    icon,
    label,
    size,
    color,
    upload,
    disabled,
    buttonStyle,
    style,
    scrollSentinel,
    scrollParent,
    shrink,
    children,
    onClick,
    onPointerEnter,
    onPointerLeave,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
  } = props;
  const [fabForgroundEl, setFabForegroundEl] = useState<HTMLDivElement>();
  const [fabBackgroundEl, setFabBackgroundEl] = useState<HTMLDivElement>();

  const handleGetPaddedValue = useCallback(
    (bodyPadding: string) => {
      return `calc(${style.right} + ${bodyPadding})`;
    },
    [style.right]
  );

  const handleGetUnpaddedValue = useCallback(() => {
    return `${style.right}`;
  }, [style.right]);

  useBodyPaddingCallback(
    "right",
    handleGetPaddedValue,
    handleGetUnpaddedValue,
    fabForgroundEl,
    fabBackgroundEl
  );

  const handleForegroundRef = useCallback(
    (instance) => {
      if (instance) {
        setFabForegroundEl(instance);
        if (foregroundRef) {
          if (typeof foregroundRef === "function") {
            foregroundRef(instance);
          } else {
            (foregroundRef as { current: HTMLDivElement }).current = instance;
          }
        }
      }
    },
    [foregroundRef]
  );

  const handleBackgroundRef = useCallback(
    (instance) => {
      if (instance) {
        setFabBackgroundEl(instance);
        if (backgroundRef) {
          if (typeof backgroundRef === "function") {
            backgroundRef(instance);
          } else {
            (backgroundRef as { current: HTMLDivElement }).current = instance;
          }
        }
      }
    },
    [backgroundRef]
  );
  const buttonSize = size === "small" ? 40 : size === "medium" ? 48 : 56;

  const expandoStyle = useMemo(
    () => ({
      height: buttonSize,
      ...style,
    }),
    [buttonSize, style]
  );

  if (shrink) {
    return (
      <StyledStaticWrapper style={expandoStyle}>
        <CornerButton
          variant="regular"
          icon={icon}
          label={label}
          color={color}
          disabled={disabled}
          size={size}
          buttonStyle={buttonStyle}
          upload={upload}
          fullWidth
          onClick={onClick}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {children}
        </CornerButton>
      </StyledStaticWrapper>
    );
  }

  return (
    onClick && (
      <CollapsibleButton
        key={`${icon}-${label}`}
        scrollSentinel={scrollSentinel}
        scrollParent={scrollParent}
        icon={icon}
        label={label}
        color={color}
        upload={upload}
        foregroundRef={handleForegroundRef}
        backgroundRef={handleBackgroundRef}
        disabled={disabled}
        fullWidth={shrink ? false : undefined}
        buttonStyle={buttonStyle}
        style={style}
        onClick={onClick}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {children}
      </CollapsibleButton>
    )
  );
});

export default CornerFab;
