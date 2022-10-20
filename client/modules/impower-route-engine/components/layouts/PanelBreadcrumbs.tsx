import styled from "@emotion/styled";
import Tab from "@mui/material/Tab";
import React, { useCallback } from "react";
import { FadeAnimation, Tabs } from "../../../impower-route";

const StyledBreadcrumbs = styled.div`
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: ${(props): string => props.theme.spacing(2)};
`;

const StyledBreadcrumbsContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  min-width: 0;
  min-height: 100%;
`;

const StyledTabs = styled(Tabs)`
  pointer-events: auto;
  margin-left: -${(props): string => props.theme.spacing(2)};
  min-height: 100%;
  max-width: 100%;

  & .MuiTabs-flexContainer {
    min-height: 100%;
    width: fit-content;
  }
`;

const StyledTab = styled(Tab)`
  overflow: visible;
  margin: ${(props): string => props.theme.spacing(0, 1)};
  min-height: 100%;
  min-width: 0;
  color: ${(props): string => props.theme.palette.grey[400]};
  &.MuiTab-textColorInherit.Mui-disabled {
    opacity: 1;
  }
  & .MuiTouchRipple-root {
    top: ${(props): string => props.theme.spacing(1)};
    bottom: ${(props): string => props.theme.spacing(1)};
    border-radius: ${(props): string => props.theme.spacing(2)};
  }
`;

const StyledMotionContent = styled(FadeAnimation)``;

const StyledLabel = styled.div`
  background-color: ${(props): string => props.theme.colors.darkForeground};
  padding-left: ${(props): string => props.theme.spacing(1)};
  padding-right: ${(props): string => props.theme.spacing(1)};
  padding-top: 1px;
  padding-bottom: 1px;
  border-radius: ${(props): string => props.theme.spacing(2)};
  line-height: 1;
  white-space: nowrap;
`;

const StyledSeparator = styled.div`
  position: absolute;
  left: -${(props): string => props.theme.spacing(1.5)};
  top: 0;
  bottom: 0;
  width: ${(props): string => props.theme.spacing(1)};
  display: flex;
  align-items: center;
  opacity: 0.7;
  font-size: 1rem;
`;

export interface BreadcrumbInfo {
  id: string;
  name: string;
  interactable: boolean;
  separator: string;
}

interface PanelBreadcrumbsProps {
  indicatorColor?: string;
  breadcrumbs: BreadcrumbInfo[];
  onClickBreadcrumb?: (e: React.ChangeEvent, id: string) => void;
}

const PanelBreadcrumbs = React.memo(
  (props: PanelBreadcrumbsProps): JSX.Element => {
    const {
      indicatorColor = "transparent",
      breadcrumbs,
      onClickBreadcrumb,
    } = props;

    const handleClick = useCallback(
      (e: React.ChangeEvent, id: string) => {
        if (onClickBreadcrumb) {
          onClickBreadcrumb(e, id);
        }
      },
      [onClickBreadcrumb]
    );
    return (
      <StyledBreadcrumbs>
        <StyledBreadcrumbsContent>
          <StyledTabs
            indicatorColor={indicatorColor}
            variant="scrollable"
            value={breadcrumbs.length - 1}
            onChange={(e: React.ChangeEvent, value: number): void => {
              handleClick(e, breadcrumbs[value].id);
            }}
          >
            {breadcrumbs.map((breadcrumb, index) => (
              <StyledTab
                key={breadcrumb.id}
                value={index}
                label={
                  <StyledMotionContent initial={0} animate={1} exit={0}>
                    {index > 0 && <StyledSeparator>/</StyledSeparator>}
                    <StyledLabel>{breadcrumb.name}</StyledLabel>
                  </StyledMotionContent>
                }
                disabled={!breadcrumb.interactable}
              />
            ))}
          </StyledTabs>
        </StyledBreadcrumbsContent>
      </StyledBreadcrumbs>
    );
  }
);

export default PanelBreadcrumbs;
