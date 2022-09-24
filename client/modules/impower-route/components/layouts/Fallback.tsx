import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import { CSSProperties } from "react";

const CircularProgress = dynamic(
  () => import("@material-ui/core/CircularProgress"),
  { ssr: false }
);

const StyledFallback = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1;
`;

interface FallbackProps {
  color?: "primary" | "secondary" | "inherit";
  size?: string | number;
  disableShrink?: boolean;
  style?: CSSProperties;
}

const Fallback = (props: FallbackProps): JSX.Element => {
  const { color = "inherit", size, disableShrink, style } = props;
  return (
    <StyledFallback className={StyledFallback.displayName} style={style}>
      <CircularProgress
        disableShrink={disableShrink}
        color={color}
        size={size}
      />
    </StyledFallback>
  );
};

export default Fallback;
