import styled from "@emotion/styled";
import IconButton from "@material-ui/core/IconButton";
import NextLink from "next/link";
import React, { PropsWithChildren, useCallback, useState } from "react";

const StyledIconButton = styled(IconButton)`
  color: inherit;
`;

const StyledMotionLogoPathArea = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 40px;
  height: 40px;
`;

const StyledMotionLogoIconArea = styled.div`
  width: 40px;
  height: 40px;
  svg {
    width: 100%;
    height: 100%;
  }
`;

const requestTimeout = (call: () => unknown, delay: number): number => {
  const start = new Date().getTime();
  const loop = (): void => {
    const current = new Date().getTime();
    if (current - start >= delay) {
      call();
    } else {
      window.requestAnimationFrame(loop);
    }
  };
  return window.requestAnimationFrame(loop);
};

interface LogoProps {
  animate?: boolean;
  href: string;
  style?: React.CSSProperties;
}

const Logo = React.memo((props: PropsWithChildren<LogoProps>): JSX.Element => {
  const { animate, href, children, style } = props;
  const totalPathLength = 500.586;
  const [pathLength, setPathLength] = useState<number>(
    animate ? totalPathLength : 0
  );
  const [opacity, setOpacity] = useState<number>(animate ? 0 : 1);

  const handleRef = useCallback(
    (el: SVGPathElement) => {
      if (el && animate) {
        const totalLength = el.getTotalLength();
        setPathLength(totalLength);
        requestTimeout(() => {
          setOpacity(1);
          setPathLength(0);
        }, 200);
      }
    },
    [animate]
  );

  if (!animate) {
    return (
      <NextLink href={href} passHref prefetch={false}>
        <StyledIconButton aria-label="Home" style={{ padding: 0, ...style }}>
          <StyledMotionLogoIconArea>{children}</StyledMotionLogoIconArea>
        </StyledIconButton>
      </NextLink>
    );
  }

  return (
    <NextLink href={href} passHref prefetch={false}>
      <StyledIconButton aria-label="Home" style={{ padding: 0 }}>
        <StyledMotionLogoPathArea
          style={{
            opacity: opacity ? 0 : 1,
            transition: `opacity 0.3s ease 0.5s`,
            willChange: "opacity",
            ...style,
          }}
        >
          <svg className="progress-icon" viewBox="0 0 192 192">
            <path
              ref={handleRef}
              style={{
                opacity,
                transition: `opacity 0s, stroke-dashoffset 0.5s linear, opacity 0.3s ease`,
                willChange: "opacity",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 8,
                strokeDasharray: totalPathLength,
                strokeDashoffset: pathLength,
              }}
              d="M 71 32 A 39 39 0 0 0 32 71 A 39 39 0 0 0 32.091797 73.601562 A 46 46 0 0 0 8 114 A 46 46 0 0 0 54 160 A 46 46 0 0 0 54.419922 159.98438 C 54.61381 159.9876 54.805315 160 55 160 L 138 160 L 139.01367 160 C 141.30649 160 143.54376 159.77239 145.70703 159.34375 A 46 46 0 0 0 184 114 A 46 46 0 0 0 151.61328 70.0625 A 35 35 0 0 0 117 40 A 35 35 0 0 0 99.683594 44.634766 A 39 39 0 0 0 71 32 z "
            />
          </svg>
        </StyledMotionLogoPathArea>
        <StyledMotionLogoIconArea
          style={{ opacity, transition: `opacity 0.3s ease 0.5s`, ...style }}
        >
          {children}
        </StyledMotionLogoIconArea>
      </StyledIconButton>
    </NextLink>
  );
});

export default Logo;
