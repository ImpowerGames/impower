import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, { useEffect, useRef, useState } from "react";
import SlideAnimation from "../../../impower-route/components/animations/SlideAnimation";

const StyledSection = styled(SlideAnimation)`
  text-align: center;
  position: relative;
`;

interface SectionProps {
  type: string;
  threshold?: number;
  paddingTop?: number;
  children?: (props: { shown: boolean }) => React.ReactNode;
}

const Section = (props: SectionProps): JSX.Element => {
  const theme = useTheme();
  const {
    type,
    threshold = 100,
    paddingTop = theme.spacing(12),
    children,
  } = props;

  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const updateY = (): void => {
      const elem = ref.current;
      if (elem) {
        const rect = elem.getBoundingClientRect();
        const inViewport =
          rect.y + threshold <
          (window.innerHeight || document.documentElement.clientHeight);
        if (inViewport) {
          setShown(true);
        } else {
          setShown(false);
        }
      }
    };

    window.addEventListener("scroll", updateY, {
      passive: true,
    });
    window.addEventListener("resize", updateY, {
      passive: true,
    });
    return (): void => {
      window.removeEventListener("scroll", updateY);
      window.removeEventListener("resize", updateY);
    };
  });

  return (
    <StyledSection
      id={type.toLowerCase()}
      ref={ref}
      className={StyledSection.displayName}
      initial={64}
      animate={shown ? 0 : 64}
      duration={0.25}
      style={{ paddingTop }}
    >
      {children({ shown })}
    </StyledSection>
  );
};

export default Section;
