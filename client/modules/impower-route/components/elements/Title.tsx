import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import React, { PropsWithChildren, useCallback, useState } from "react";
import SortSolidIcon from "../../../../resources/icons/solid/sort.svg";
import { FontIcon } from "../../../impower-icon";
import { MenuInfo } from "../../types/info/menus";

const LinkMenu = dynamic(() => import("../menus/LinkMenu"), { ssr: false });

const StyledTitle = styled.div`
  position: relative;
  flex: 1 0 auto;
  margin-left: ${(props): string => props.theme.spacing(2)};
  margin-right: ${(props): string => props.theme.spacing(2)};
  ${(props): string => props.theme.breakpoints.down("md")} {
    margin-left: ${(props): string => props.theme.spacing(1)};
    margin-right: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledTitleContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const StyledButtonArea = styled.div`
  display: flex;
  margin-left: -${(props): string => props.theme.spacing(0.5)};
  margin-right: ${(props): string => props.theme.spacing(0.5)};
`;

const StyledTopTitleText = styled.div`
  display: flex;
  margin: -${(props): string => props.theme.spacing(0.3)} 0;
`;

const StyledTitleButton = styled(Button)`
  min-width: 0;
  text-transform: none;
  margin: 0 -${(props): string => props.theme.spacing(1)};
  padding: 0 ${(props): string => props.theme.spacing(1)};
`;

const StyledMainTitleTypography = styled(Typography)<{ component?: string }>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: none;
  font-size: ${(props): string => props.theme.fontSize.large};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
`;

const StyledSecondaryTitleMark = styled.mark<{
  component?: string;
}>`
  flex: 0 10000000 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  background-color: initial;
  color: inherit;
  font-weight: ${(props): number => props.theme.fontWeight.normal};
`;

const StyledSeparatorMark = styled.mark`
  padding: 0 ${(props): string => props.theme.spacing(0.5)};
  background-color: initial;
  color: inherit;
  font-weight: ${(props): number => props.theme.fontWeight.normal};
`;

const StyledBottomTitleText = styled.div`
  display: flex;
  opacity: 0.6;
`;

const StyledIconButton = styled(IconButton)``;

interface TitleProps {
  title: string;
  secondaryTitle?: string;
  subtitle?: string;
  changeLabel?: string;
  separator?: string;
  titleLinks?: MenuInfo[];
}

const Title = (props: PropsWithChildren<TitleProps>): JSX.Element => {
  const {
    title,
    secondaryTitle,
    subtitle,
    changeLabel,
    separator,
    titleLinks = [],
    children,
  } = props;
  const secondaryTitleRef = React.useRef<HTMLElement>(null);
  const [navmenuOpenKey, setNavmenuOpenKey] = useState<"navmenu">();
  const navmenuOpen = navmenuOpenKey === "navmenu";
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const theme = useTheme();

  const handleClickTitle = useCallback(async (): Promise<void> => {
    if (titleLinks.length > 0) {
      setMenuAnchor(secondaryTitleRef.current);
      setNavmenuOpenKey("navmenu");
    } else {
      const router = (await import("next/router")).default;
      const { route } = router;
      const subPageIndex = route.startsWith("/e/s")
        ? -1
        : route.substring(1).indexOf("/");
      const target =
        subPageIndex >= 0 ? route.substring(0, subPageIndex + 1) : "/";
      router.push(target);
    }
  }, [titleLinks.length]);
  const handleCloseMenu = useCallback((): void => {
    setMenuAnchor(null);
    setNavmenuOpenKey(null);
  }, []);
  return (
    <>
      <StyledTitle className={StyledTitle.displayName}>
        <StyledTitleContent className={StyledTitleContent.displayName}>
          <StyledTopTitleText className={StyledTopTitleText.displayName}>
            {titleLinks.length > 0 && (
              <StyledButtonArea className={StyledButtonArea.displayName}>
                <StyledIconButton
                  style={{ padding: 0 }}
                  onClick={handleClickTitle}
                >
                  <FontIcon
                    aria-label={changeLabel}
                    size={theme.fontSize.headerIcon}
                  >
                    <SortSolidIcon />
                  </FontIcon>
                </StyledIconButton>
              </StyledButtonArea>
            )}
            <StyledTitleButton
              className={StyledTitleButton.displayName}
              onClick={handleClickTitle}
              color="inherit"
            >
              <StyledMainTitleTypography variant="h6" component="h1">
                {title}
                {secondaryTitle && (
                  <>
                    {separator && (
                      <StyledSeparatorMark>{separator}</StyledSeparatorMark>
                    )}
                    <StyledSecondaryTitleMark ref={secondaryTitleRef}>
                      {secondaryTitle}
                    </StyledSecondaryTitleMark>
                  </>
                )}
              </StyledMainTitleTypography>
            </StyledTitleButton>
          </StyledTopTitleText>
          <StyledBottomTitleText
            className={StyledTopTitleText.displayName}
            style={{
              paddingLeft:
                titleLinks.length > 0 ? theme.fontSize.headerIcon : undefined,
            }}
          >
            {subtitle && (
              <Typography variant="subtitle2">{subtitle}</Typography>
            )}
            {children}
          </StyledBottomTitleText>
        </StyledTitleContent>
      </StyledTitle>
      {navmenuOpenKey !== undefined && (
        <LinkMenu
          open={navmenuOpen}
          anchorEl={menuAnchor}
          links={titleLinks}
          onClose={handleCloseMenu}
        />
      )}
    </>
  );
};

export default Title;
