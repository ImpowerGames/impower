import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import IconButton from "@material-ui/core/IconButton";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import dynamic from "next/dynamic";
import React from "react";
import BarsRegularIcon from "../../../../resources/icons/regular/bars.svg";
import LogoFlatBlack from "../../../../resources/logos/logo-flat-black.svg";
import { FontIcon } from "../../../impower-icon";
import { brandingInfo } from "../../types/info/branding";
import { MenuInfo } from "../../types/info/menus";
import FadeAnimation from "../animations/FadeAnimation";
import Logo from "./Logo";
import Searchbar from "./Searchbar";

const PageNavigationLinks = dynamic(() => import("./PageNavigationLinks"), {
  ssr: false,
});

const Title = dynamic(() => import("./Title"));

const StyledFlex = styled.div`
  flex: 1;
  position: relative;
  height: 100%;
  display: flex;
`;

const StyledToolbarContent = styled.div`
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.lg}px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
`;

const StyledLogoArea = styled(FadeAnimation)`
  position: relative;
  max-width: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const StyledIconButton = styled(IconButton)`
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledMotionTitleArea = styled(FadeAnimation)`
  flex: 1;
  display: flex;
  position: relative;
`;

const StyledRightArea = styled.div`
  display: flex;
  align-items: center;
`;

interface LeftLogoAreaProps {
  href: string;
  initial?: number;
  onClickMenuButton: () => void;
}

const LeftLogoArea = React.memo((props: LeftLogoAreaProps): JSX.Element => {
  const { initial, href, onClickMenuButton } = props;

  const theme = useTheme();

  const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <StyledLogoArea initial={initial} animate={1}>
      {belowSmBreakpoint ? (
        <StyledIconButton
          color="inherit"
          aria-label="open drawer"
          onClick={onClickMenuButton}
          size="large"
        >
          <FontIcon aria-label="Menu" size={24}>
            <BarsRegularIcon />
          </FontIcon>
        </StyledIconButton>
      ) : (
        <Logo animate={initial === 0} href={href}>
          <LogoFlatBlack />
        </Logo>
      )}
    </StyledLogoArea>
  );
});

interface RightLogoAreaProps {
  initial?: number;
  href: string;
}

const RightLogoArea = React.memo((props: RightLogoAreaProps): JSX.Element => {
  const { initial, href } = props;

  const theme = useTheme();

  const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <>
      {belowSmBreakpoint && (
        <Logo animate={initial === 0} href={href}>
          <LogoFlatBlack />
        </Logo>
      )}
    </>
  );
});

interface PageNavigationBarContentProps {
  initial: number;
  searchLabel?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  title: string;
  secondaryTitle: string;
  subtitle: string;
  titleLinks: MenuInfo[];
  backgroundOpacity?: number;
  useAccountDialog?: boolean;
  onClickMenuButton: () => void;
}

const PageNavigationBarContent = (
  props: PageNavigationBarContentProps
): JSX.Element => {
  const {
    initial,
    searchLabel,
    searchPlaceholder,
    searchValue,
    title,
    secondaryTitle,
    subtitle,
    titleLinks,
    backgroundOpacity,
    useAccountDialog,
    onClickMenuButton,
  } = props;

  const { product } = brandingInfo;

  const theme = useTheme();

  const aboveSmBreakpoint = useMediaQuery(theme.breakpoints.up("md"));

  return (
    <StyledToolbarContent>
      <LeftLogoArea
        initial={initial}
        href="/"
        onClickMenuButton={onClickMenuButton}
      />
      <StyledFlex
        style={{
          alignItems: "center",
          flex: 1,
          paddingLeft: theme.spacing(1),
          paddingRight: theme.spacing(1),
          maxWidth: theme.breakpoints.values.sm + 16,
        }}
      >
        {searchLabel ? (
          <Searchbar
            initial={initial}
            label={searchLabel}
            placeholder={searchPlaceholder}
            value={searchValue}
            style={{
              backgroundColor: backgroundOpacity > 0 ? undefined : "white",
              color: backgroundOpacity > 0 ? undefined : "black",
            }}
          />
        ) : (
          <StyledMotionTitleArea initial={initial} animate={1}>
            <Title
              title={title === "" ? "" : title || product}
              secondaryTitle={secondaryTitle}
              subtitle={subtitle || ""}
              separator="|"
              titleLinks={titleLinks}
            />
          </StyledMotionTitleArea>
        )}
      </StyledFlex>
      <StyledFlex
        style={{
          justifyContent: "flex-end",
          flex: aboveSmBreakpoint ? 1 : 0,
        }}
      >
        <RightLogoArea initial={initial} href="/" />
        {aboveSmBreakpoint && (
          <StyledRightArea>
            <PageNavigationLinks useAccountDialog={useAccountDialog} />
          </StyledRightArea>
        )}
      </StyledFlex>
    </StyledToolbarContent>
  );
};

export default PageNavigationBarContent;
