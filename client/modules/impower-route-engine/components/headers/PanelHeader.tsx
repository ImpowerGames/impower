import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, { PropsWithChildren, useContext, useMemo } from "react";
import { layout } from "../../../impower-route";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import PanelBreadcrumbs, { BreadcrumbInfo } from "../layouts/PanelBreadcrumbs";
import EngineToolbar from "./EngineToolbar";

const StyledBottomButtonArea = styled.div``;

const StyledBottomButtonContent = styled.div`
  padding-left: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
  margin-top: -${(props): string => props.theme.spacing(1)};
`;

interface PanelHeaderProps {
  scrollParent?: HTMLElement;
  type: "default" | "context" | "search";
  title: string;
  backIcon?: React.ReactNode;
  backLabel?: string;
  moreLabel?: string;
  searchLabel?: string;
  clearLabel?: string;
  search?: string;
  breadcrumbs?: BreadcrumbInfo[];
  rightChildren?: React.ReactNode;
  bottomChildren?: React.ReactNode;
  breadcrumbIndicatorColor?: string;
  nameStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  stickyStyle?: {
    position?: string;
    zIndex?: number;
    boxShadow?: string;
    top?: number;
    left?: number;
    right?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
  onBack?: (e: React.MouseEvent) => void;
  onBreadcrumb?: (e: React.MouseEvent | React.ChangeEvent, id: string) => void;
  onOpenSearch?: (e: React.MouseEvent) => void;
  onCloseSearch?: (e: React.MouseEvent) => void;
  onSearch?: (value: string) => void;
  onMore?: (e: React.MouseEvent) => void;
}

const PanelHeader = (
  props: PropsWithChildren<PanelHeaderProps>
): JSX.Element => {
  const {
    type,
    title,
    backIcon,
    backLabel,
    moreLabel,
    searchLabel,
    clearLabel,
    search,
    breadcrumbs,
    rightChildren,
    bottomChildren,
    scrollParent,
    breadcrumbIndicatorColor,
    style,
    stickyStyle,
    onBack,
    onBreadcrumb,
    onOpenSearch,
    onCloseSearch,
    onSearch,
    onMore,
  } = props;

  const { portrait } = useContext(WindowTransitionContext);

  const theme = useTheme();

  const headerStickyStyle = useMemo(
    () => ({
      position: portrait ? "fixed" : "absolute",
      zIndex: 2,
      boxShadow: theme.shadows[3],
      paddingRight: style?.position !== "absolute" && !portrait ? 8 : undefined,
      ...stickyStyle,
    }),
    [portrait, style?.position, theme, stickyStyle]
  );

  const titleStyle = {
    textShadow: `${theme.colors.darkForeground} 3px 0px 0px, 
    ${theme.colors.darkForeground} 2.83487px 0.981584px 0px, 
    ${theme.colors.darkForeground} 2.35766px 1.85511px 0px, 
    ${theme.colors.darkForeground} 1.62091px 2.52441px 0px, 
    ${theme.colors.darkForeground} 0.705713px 2.91581px 0px, 
    ${theme.colors.darkForeground} -0.287171px 2.98622px 0px, 
    ${theme.colors.darkForeground} -1.24844px 2.72789px 0px, 
    ${theme.colors.darkForeground} -2.07227px 2.16926px 0px, 
    ${theme.colors.darkForeground} -2.66798px 1.37182px 0px, 
    ${theme.colors.darkForeground} -2.96998px 0.42336px 0px, 
    ${theme.colors.darkForeground} -2.94502px -0.571704px 0px, 
    ${theme.colors.darkForeground} -2.59586px -1.50383px 0px, 
    ${theme.colors.darkForeground} -1.96093px -2.27041px 0px, 
    ${theme.colors.darkForeground} -1.11013px -2.78704px 0px, 
    ${theme.colors.darkForeground} -0.137119px -2.99686px 0px, 
    ${theme.colors.darkForeground} 0.850987px -2.87677px 0px, 
    ${theme.colors.darkForeground} 1.74541px -2.43999px 0px, 
    ${theme.colors.darkForeground} 2.44769px -1.73459px 0px, 
    ${theme.colors.darkForeground} 2.88051px -0.838247px 0px`,
  };
  const headerStyle: React.CSSProperties = {
    color: theme.colors.darkHeaderText,
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(1),
  };
  const leftStyle = {
    minWidth: theme.spacing(theme.space.panelLeft),
  };
  const backButtonStyle = {
    minWidth: theme.spacing(theme.space.panelLeft),
    backgroundColor: theme.colors.darkForeground,
  };
  const searchButtonStyle = {
    opacity: 1,
    color: theme.palette.secondary.main,
    backgroundColor: theme.colors.darkForeground,
  };
  const moreButtonStyle = {
    opacity: 1,
    color: theme.palette.secondary.main,
    backgroundColor: theme.colors.darkForeground,
  };

  return (
    <>
      <EngineToolbar
        scrollParent={scrollParent}
        type={type}
        title={title}
        titleStyle={titleStyle}
        minHeight={layout.size.minWidth.headerIcon}
        search={search}
        backIcon={backIcon}
        backLabel={backLabel}
        moreLabel={moreLabel}
        clearLabel={clearLabel}
        searchLabel={searchLabel}
        headerStyle={headerStyle}
        leftStyle={leftStyle}
        backButtonStyle={backButtonStyle}
        searchButtonStyle={searchButtonStyle}
        moreButtonStyle={moreButtonStyle}
        stickyStyle={headerStickyStyle}
        sticky={
          style?.position === "absolute" || style?.position === "fixed"
            ? "never"
            : "always"
        }
        stickyOffset={0}
        rightChildren={rightChildren}
        onBack={onBack}
        onOpenSearch={onOpenSearch}
        onCloseSearch={onCloseSearch}
        onSearch={onSearch}
        onMore={onMore}
        style={{
          position: portrait ? "fixed" : "absolute",
          ...style,
        }}
        belowBreakpoint
      />
      <StyledBottomButtonArea style={{ zIndex: style?.zIndex }}>
        <StyledBottomButtonContent>
          {breadcrumbs?.length > 0 && (
            <PanelBreadcrumbs
              indicatorColor={breadcrumbIndicatorColor}
              breadcrumbs={breadcrumbs}
              onClickBreadcrumb={onBreadcrumb}
            />
          )}
          {bottomChildren}
        </StyledBottomButtonContent>
      </StyledBottomButtonArea>
    </>
  );
};

export default PanelHeader;
