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

const StyledTabs = styled.div<{
  variant?: "standard" | "scrollable" | "fullWidth";
  orientation?: "vertical" | "horizontal";
}>`
  ${(props): string => (props.variant === "fullWidth" ? `width: 100%;` : "")}
  ${(props): string =>
    props.variant === "scrollable" ? `overflow: auto;` : ""}
  & span.MuiTabs-indicator {
    display: none;
    transition: none;
  }

  & .MuiTab-root {
    transition: opacity 0.2s ease;
    will-change: opacity;
  }
  &::-webkit-scrollbar {
    display: none;
  }
  scrollbar-width: none;
`;

const StyledFlexContainer = styled.div<{
  variant?: "standard" | "scrollable" | "fullWidth";
  orientation?: "vertical" | "horizontal";
}>`
  display: flex;
  ${(props): string =>
    props.orientation === "vertical" ? `flex-direction: column;` : ""}
  ${(props): string => (props.variant === "fullWidth" ? `width: 100%;` : "")}
  position: relative;
  ${(props): string =>
    props.variant === "scrollable" && props.orientation === "horizontal"
      ? `
  width: fit-content;`
      : ""}
  ${(props): string =>
    props.variant === "scrollable" && props.orientation === "vertical"
      ? `
      height: fit-content;`
      : ""}
`;

const StyledIndicator = styled.div<{ color?: string }>`
  position: absolute;
  will-change: transform;
  width: 2px;
  height: 2px;
  transition: opacity 0.2s ease, transform 0.2s ease;
  background-color: ${(props): string =>
    props.color || props.theme.palette.secondary.main};
  opacity: 0;
`;

const StyledPlaceholderIndicator = styled.div<{ color?: string }>`
  position: absolute;
  will-change: transform;
  width: 2px;
  height: 2px;
  transition: opacity 0.2s ease, transform 0.2s ease;
  background-color: ${(props): string =>
    props.color || props.theme.palette.secondary.main};
  opacity: 0;
`;

const StyledHorizontalPlaceholderIndicator = styled(StyledPlaceholderIndicator)`
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
`;

const StyledVerticalPlaceholderIndicator = styled(StyledPlaceholderIndicator)`
  right: 0;
  top: 0;
  bottom: 0;
  height: 100%;
`;

const StyledTabArea = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: fit-content;
`;

export interface TabsProps {
  value: number | false;
  disabled?: boolean;
  variant?: "standard" | "scrollable" | "fullWidth";
  orientation?: "vertical" | "horizontal";
  containerRef?:
    | React.MutableRefObject<HTMLElement>
    | React.RefCallback<HTMLElement>;
  indicatorRef?:
    | React.MutableRefObject<HTMLDivElement>
    | React.RefCallback<HTMLDivElement>;
  selectionFollowsFocus?: boolean;
  textColor?: string;
  onChange?: (event: React.ChangeEvent, value: unknown) => void;
  indicatorColor?: string;
  indicatorStyle?: React.CSSProperties;
  style?: React.CSSProperties;
}

const Tabs = React.forwardRef(
  (
    props: PropsWithChildren<TabsProps>,
    ref: React.ForwardedRef<HTMLDivElement>
  ): JSX.Element => {
    const {
      value,
      disabled,
      orientation = "horizontal",
      variant,
      containerRef,
      indicatorStyle,
      indicatorRef,
      selectionFollowsFocus,
      indicatorColor = "primary",
      textColor = "inherit",
      onChange,
      children: childrenProp,
      style,
    } = props;

    const valueRef = useRef(value);
    const orientationRef = useRef(orientation);
    const initialRef = useRef(true);
    const [mounted, setMounted] = useState(false);
    const [animated, setAnimated] = useState(false);
    const [containerEl, setContainerEl] = useState<HTMLElement>();
    const [indicatorEl, setIndicatorEl] = useState<HTMLDivElement>();

    const handleRef = useCallback(
      (instance: HTMLElement) => {
        if (instance) {
          setContainerEl(instance);
          if (containerRef) {
            if (typeof containerRef === "function") {
              containerRef(instance);
              return;
            }
            containerRef.current = instance;
          }
        }
      },
      [containerRef]
    );

    const handleIndicatorRef = useCallback(
      (instance: HTMLDivElement) => {
        if (instance) {
          setIndicatorEl(instance);
          instance.style.transition = "opacity 0.2s ease";
          if (indicatorRef) {
            if (typeof indicatorRef === "function") {
              indicatorRef(instance);
              return;
            }
            indicatorRef.current = instance;
          }
        }
      },
      [indicatorRef]
    );

    const animateIndicator = useCallback(
      (
        containerEl: HTMLElement,
        indicatorEl: HTMLElement,
        tabIndex: number,
        orientation: "horizontal" | "vertical"
      ) => {
        const container = containerEl;
        if (!container) {
          return;
        }
        const containerRect = container.getBoundingClientRect();
        const containerX = containerRect.x;
        const containerY = containerRect.y;
        const tab = container.children[tabIndex];
        if (!tab) {
          return;
        }
        for (let i = 0; i < container.children.length; i += 1) {
          if (tabIndex === i) {
            tab.firstElementChild.classList.add("Mui-selected");
          } else {
            container.children[i].classList.remove("Mui-selected");
          }
        }
        const tabRect = tab?.getBoundingClientRect();
        const tabX = tabRect.x;
        const tabY = tabRect.y;
        const tabWidth = tabRect.width;
        const tabHeight = tabRect.height;
        const indicator = indicatorEl;
        const getCSS = (v: number | string): string =>
          v === undefined || v === null
            ? undefined
            : typeof v === "string"
            ? v
            : `${v}px`;
        const styleTop = getCSS(indicatorStyle?.top);
        const styleBottom = getCSS(indicatorStyle?.bottom);
        const styleLeft = getCSS(indicatorStyle?.left);
        const styleRight = getCSS(indicatorStyle?.right);
        const styleWidth = getCSS(indicatorStyle?.width);
        const styleHeight = getCSS(indicatorStyle?.height);
        if (indicator) {
          if (orientation === "vertical" && tabHeight > 0) {
            indicator.style.opacity = "1";
            indicator.style.transformOrigin = "top left";
            indicator.style.transform = `translate(0, ${tabY - containerY}px)`;
            indicator.style.width =
              styleWidth !== undefined ? styleWidth : null;
            indicator.style.height = `${tabHeight}px`;
            indicator.style.bottom =
              styleBottom !== undefined ? styleBottom : "initial";
            indicator.style.left =
              styleLeft !== undefined ? styleLeft : "initial";
            indicator.style.right = styleRight !== undefined ? styleRight : "0";
            indicator.style.top = styleTop !== undefined ? styleTop : "0";
            setAnimated(true);
          } else if (tabWidth > 0) {
            indicator.style.opacity = "1";
            indicator.style.transformOrigin = "top left";
            indicator.style.transform = `translate(${tabX - containerX}px, 0)`;
            indicator.style.width = `${tabWidth}px`;
            indicator.style.height =
              styleHeight !== undefined ? styleHeight : null;
            indicator.style.top = styleTop !== undefined ? styleTop : "initial";
            indicator.style.right =
              styleRight !== undefined ? styleRight : "initial";
            indicator.style.bottom =
              styleBottom !== undefined ? styleBottom : "0";
            indicator.style.left = styleLeft !== undefined ? styleLeft : "0";
            setAnimated(true);
          }
        }
      },
      [
        indicatorStyle?.bottom,
        indicatorStyle?.height,
        indicatorStyle?.left,
        indicatorStyle?.right,
        indicatorStyle?.top,
        indicatorStyle?.width,
      ]
    );

    const shouldAnimate =
      containerEl && indicatorEl && value !== false && value >= 0;

    useEffect(() => {
      const handleAnimate = (): void => {
        if (value !== false) {
          animateIndicator(containerEl, indicatorEl, value, orientation);
        }
      };

      if (shouldAnimate) {
        const shouldTransition =
          !initialRef.current && orientationRef.current === orientation;
        indicatorEl.style.transition = shouldTransition
          ? null
          : "opacity 0.2s ease";

        handleAnimate();

        window.addEventListener("resize", handleAnimate, {
          passive: true,
        });

        initialRef.current = false;
        valueRef.current = value;
        orientationRef.current = orientation;
      }

      setMounted(true);

      return (): void => {
        window.removeEventListener("resize", handleAnimate);
      };
    }, [
      animateIndicator,
      containerEl,
      indicatorEl,
      orientation,
      shouldAnimate,
      value,
    ]);

    const theme = useTheme();

    const currentIndicatorColor =
      indicatorColor === "primary"
        ? theme.palette.primary.main
        : indicatorColor === "secondary"
        ? theme.palette.secondary.main
        : indicatorColor;

    const indicator = (
      <StyledIndicator
        className={"MuiTabs-indicator"}
        ref={handleIndicatorRef}
        color={currentIndicatorColor}
        style={indicatorStyle}
      />
    );

    const placeholderIndicator = useMemo(
      () =>
        orientation === "vertical" ? (
          <StyledVerticalPlaceholderIndicator
            className={"MuiTabs-indicator"}
            color={currentIndicatorColor}
            style={{ opacity: animated ? 0 : 1, ...indicatorStyle }}
          />
        ) : (
          <StyledHorizontalPlaceholderIndicator
            className={"MuiTabs-indicator"}
            color={currentIndicatorColor}
            style={{ opacity: animated ? 0 : 1, ...indicatorStyle }}
          />
        ),
      [currentIndicatorColor, indicatorStyle, orientation, animated]
    );

    const valueToIndex = new Map();

    let childIndex = 0;
    const children = React.Children.map(childrenProp, (child) => {
      if (!React.isValidElement(child)) {
        return null;
      }

      const childValue =
        child.props.value === undefined ? childIndex : child.props.value;
      valueToIndex.set(childValue, childIndex);
      const selected = childValue === value;

      childIndex += 1;
      return (
        <StyledTabArea>
          {React.cloneElement(child, {
            fullWidth: variant === "fullWidth",
            indicator: selected && !mounted && indicator,
            selected: selected && mounted,
            selectionFollowsFocus,
            onChange,
            textColor,
            value: childValue,
            ...(childIndex === 1 && value === false && !child.props.tabIndex
              ? { tabIndex: 0 }
              : {}),
          })}
          {selected && placeholderIndicator}
        </StyledTabArea>
      );
    });

    return (
      <StyledTabs
        className={["MuiTabs-root", disabled ? "Mui-disabled" : undefined]
          .filter(Boolean)
          .join(" ")}
        variant={variant}
        orientation={orientation}
        ref={ref}
        style={style}
      >
        <StyledFlexContainer
          ref={handleRef}
          className="MuiTabs-flexContainer"
          variant={variant}
          orientation={orientation}
          role="tablist"
        >
          {children}
          {indicator}
        </StyledFlexContainer>
      </StyledTabs>
    );
  }
);

export default Tabs;
