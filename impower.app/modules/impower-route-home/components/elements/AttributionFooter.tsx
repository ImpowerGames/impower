import styled from "@emotion/styled";
import Button from "@mui/material/Button";

const attributionButtons = [
  {
    label: "Vectors by Vecteezy",
    link: `https://www.vecteezy.com/free-vector/web-page`,
  },
  { label: "Illustrations by Ouch.pics", link: `https://icons8.com` },
];

const StyledAttributionArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
`;

const StyledAttributionLink = styled(Button)`
  padding: ${(props): string => props.theme.spacing(0.5)};
  opacity: 0.9;
  text-transform: none;
  white-space: nowrap;
`;

const AttributionFooter = (): JSX.Element => {
  return (
    <StyledAttributionArea>
      {attributionButtons.map((button) => (
        <StyledAttributionLink
          key={button.label}
          href={button.link}
          color="secondary"
          size="small"
        >
          {button.label}
        </StyledAttributionLink>
      ))}
    </StyledAttributionArea>
  );
};

export default AttributionFooter;
