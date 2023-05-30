import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useState } from "react";

const CircularProgress = dynamic(
  () => import("@mui/material/CircularProgress"),
  {
    ssr: false,
  }
);

const StyledCircularProgressArea = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: ${(props): string => props.theme.spacing(12)};
`;

const StyledCircularProgress = styled(CircularProgress)`
  pointer-events: none;
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

const StyledNoMoreArea = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  color: ${(props): string => props.theme.palette.text.secondary};
`;

const StyledLabelTypography = styled(Typography)`
  max-width: 100%;
  font-weight: 600;
`;

const StyledButton = styled(Button)``;

interface PitchLoadingProgressProps {
  loadingMore?: boolean;
  noMoreLabel?: string;
  noMoreSubtitle?: string;
  refreshLabel?: string;
  noMore?: boolean;
  style?: React.CSSProperties;
  onScrolledToEnd?: () => void;
  onRefresh?: () => void;
}

const PitchLoadingProgress = React.memo(
  (props: PitchLoadingProgressProps): JSX.Element => {
    const {
      noMore,
      noMoreLabel,
      noMoreSubtitle,
      refreshLabel,
      loadingMore,
      style,
      onScrolledToEnd,
      onRefresh,
    } = props;

    const [scrollSentinel, setScrollSentinel] = useState<HTMLDivElement>();

    const handleRef = useCallback((instance: HTMLDivElement | null): void => {
      if (instance) {
        setScrollSentinel(instance);
      }
    }, []);

    useEffect(() => {
      if (!scrollSentinel || !onScrolledToEnd) {
        return (): void => null;
      }
      const observer = new IntersectionObserver(([entry]) => {
        if (
          entry &&
          (entry.boundingClientRect.width > 0 ||
            entry.boundingClientRect.height > 0)
        ) {
          const sentinelOnScreen =
            entry.isIntersecting || entry.intersectionRatio > 0;
          if (sentinelOnScreen) {
            if (onScrolledToEnd) {
              onScrolledToEnd();
            }
          }
        }
      });
      observer.observe(scrollSentinel);
      return (): void => {
        observer.disconnect();
      };
    }, [onScrolledToEnd, scrollSentinel]);

    return (
      <StyledCircularProgressArea ref={handleRef} style={style}>
        {loadingMore ? (
          <StyledCircularProgress color="secondary" />
        ) : loadingMore !== undefined &&
          noMore &&
          (noMoreLabel || refreshLabel) ? (
          <StyledNoMoreArea>
            {noMoreLabel && (
              <StyledLabelTypography variant="body1" color="textSecondary">
                {noMoreLabel}
              </StyledLabelTypography>
            )}
            {noMoreSubtitle && (
              <StyledLabelTypography variant="body2" color="textSecondary">
                {noMoreSubtitle}
              </StyledLabelTypography>
            )}
            {onRefresh && refreshLabel && (
              <StyledButton color="inherit" onClick={onRefresh}>
                {refreshLabel}
              </StyledButton>
            )}
          </StyledNoMoreArea>
        ) : null}
      </StyledCircularProgressArea>
    );
  }
);

export default PitchLoadingProgress;
