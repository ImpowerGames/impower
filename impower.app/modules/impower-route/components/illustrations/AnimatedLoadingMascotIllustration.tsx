import styled from "@emotion/styled";
import React, { useMemo } from "react";
import MascotThinking00 from "../../../../resources/mascot/professor-thinking-00.svg";
import AnimatedLoadingText from "./AnimatedLoadingText";
import MascotIllustration from "./MascotIllustration";

const StyledAnimation = styled(MascotThinking00)`
  backface-visibility: hidden;

  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;

  @keyframes move-arm {
    0% {
      transform: rotate(0deg);
    }
    12.5% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(0deg);
    }
    37.5% {
      transform: rotate(0deg);
    }
    50% {
      transform: rotate(0deg);
    }
    62.5% {
      transform: rotate(-5deg);
    }
    75% {
      transform: rotate(0deg);
    }
    87.5% {
      transform: rotate(-5deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes move-glasses {
    0% {
      transform: rotate(0deg);
    }
    12.5% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(0deg);
    }
    37.5% {
      transform: rotate(0deg);
    }
    50% {
      transform: rotate(0deg);
    }
    62.5% {
      transform: rotate(-5deg);
    }
    75% {
      transform: rotate(0deg);
    }
    87.5% {
      transform: rotate(-5deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  .animate & .professor-thinking-00_svg__arm {
    animation: move-arm 1.5s infinite;
    transform-origin: 50% 60%;
    will-change: transform;
  }

  .animate & .professor-thinking-00_svg__glasses {
    animation: move-glasses 1.5s infinite;
    transform-origin: 50% 50%;
    will-change: transform;
  }
`;

interface AnimatedLoadingMascotIllustrationProps {
  size?: number;
  loading?: boolean;
  loadedImage?: React.ReactNode;
  loadedMessage?: React.ReactNode;
  loadingMessage?: string;
}

const AnimatedLoadingMascotIllustration = React.memo(
  (props: AnimatedLoadingMascotIllustrationProps): JSX.Element => {
    const { size, loadingMessage, loadedMessage, loading, loadedImage } = props;
    const mascotStyle = useMemo(() => ({ flex: 1 }), []);
    return (
      <MascotIllustration
        size={size}
        image={loading ? <StyledAnimation /> : loadedImage}
        style={mascotStyle}
      >
        {loading ? (
          <AnimatedLoadingText message={loadingMessage} />
        ) : (
          loadedMessage
        )}
      </MascotIllustration>
    );
  }
);

export default AnimatedLoadingMascotIllustration;
