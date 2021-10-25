import styled from "@emotion/styled";
import { Link } from "@material-ui/core";
import React from "react";
import { escapeURI } from "../../../impower-data-store";
import { useRouter } from "../../../impower-router";

const pageActions = [
  {
    type: "Report",
    label: "Report",
    link: "/report",
  },
];

const StyledPageActionsGrid = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    justify-content: center;
  }
`;

const StyledPageActionsArea = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledPageActionLink = styled(Link)`
  padding: ${(props): string => props.theme.spacing(0.5)};
  font-size: ${(props): string => props.theme.fontSize.small};
`;

const StyledGrid = styled.div``;

interface PageFooterProps {
  color?: string;
}

const PageFooter = (props: PageFooterProps): JSX.Element => {
  const { color } = props;
  const router = useRouter();
  return (
    <StyledPageActionsGrid>
      {pageActions.map((button) => (
        <StyledGrid key={button.label}>
          <StyledPageActionsArea>
            <StyledPageActionLink
              key={button.label}
              href={
                button.type === "Report"
                  ? `${button.link}?url=${escapeURI(
                      router.route.replace(
                        "[slug]",
                        router.query.slug as string
                      )
                    )}`
                  : button.link
              }
              style={{ color }}
            >
              {button.label}
            </StyledPageActionLink>
          </StyledPageActionsArea>
        </StyledGrid>
      ))}
    </StyledPageActionsGrid>
  );
};

export default PageFooter;
