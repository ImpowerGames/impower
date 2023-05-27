import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import Fallback from "./Fallback";

const AnimatedErrorMascotIllustration = dynamic(
  () => import("../illustrations/AnimatedErrorMascotIllustration"),
  { ssr: false, loading: () => <Fallback /> }
);

const StyledPage = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const PageNotFound = (): JSX.Element => {
  return (
    <StyledPage>
      <AnimatedErrorMascotIllustration error={`Page Not Found`} />
    </StyledPage>
  );
};

export default PageNotFound;
