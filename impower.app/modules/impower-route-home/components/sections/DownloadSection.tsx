import styled from "@emotion/styled";
import Typography from "@mui/material/Typography";
import IllustrationImage from "../../../../resources/illustrations/fogg-no-connection-2.svg";
import { downloadInfo } from "../../types/info/download";
import Illustration from "../elements/Illustration";
import Section from "../elements/Section";
import SectionTitle from "../elements/SectionTitle";

const StyledListItemCaption = styled(Typography)`
  padding: ${(props): string => props.theme.spacing(28, 6, 0, 6)};
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  margin: auto;
  white-space: pre-wrap;
  text-shadow: -1px -1px 1px white, 1px -1px 1px white, -1px 1px 1px white,
    1px 1px 1px white, -2px -2px 1px white, 2px -2px 1px white,
    -2px 2px 1px white, 2px 2px 1px white, 0 0 20px white, 0 0 20px white,
    0 0 20px white, 0 0 20px white;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  color: ${(props): string => props.theme.colors.black70};
  max-width: 600px;
`;

const StyledBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const StyledOverlay = styled.div`
  position: relative;
  z-index: 2;
`;

const DownloadSection = (): JSX.Element => {
  const { title, description } = downloadInfo;

  return (
    <Section type="Download">
      {(): JSX.Element => (
        <>
          <Illustration imageStyle={{ minHeight: 400, maxWidth: 800 }}>
            <StyledBackground>
              <IllustrationImage />
            </StyledBackground>
            <StyledOverlay>
              <SectionTitle>{title}</SectionTitle>
              <StyledListItemCaption variant="h6">
                {description}
              </StyledListItemCaption>
            </StyledOverlay>
          </Illustration>
        </>
      )}
    </Section>
  );
};

export default DownloadSection;
