import styled from "@emotion/styled";
import { GetStaticProps } from "next";
import React, { useContext, useEffect } from "react";
import getTagConfigParameters from "../lib/getTagConfigParameters";
import { ConfigParameters } from "../modules/impower-config";
import ConfigCache from "../modules/impower-config/classes/configCache";
import DataStoreCache from "../modules/impower-data-store/classes/dataStoreCache";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
  navigationSetType,
} from "../modules/impower-navigation";
import { BetaBanner, PageNotFound } from "../modules/impower-route";
import Footer from "../modules/impower-route-home/components/elements/Footer";
import UserProfile from "../modules/impower-route-user-profile/UserProfile";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";
import { UserContext } from "../modules/impower-user/contexts/userContext";

const StyledUserProfilePage = styled.div`
  padding-top: ${(props): string => props.theme.minHeight.navigationBar};
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: ${(props): string => props.theme.colors.lightForeground};

  ${(props): string => props.theme.breakpoints.down("sm")} {
    background-color: white;
  }
`;

const StyledContent = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
`;

const StyledContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface AccountPageProps {
  config: ConfigParameters;
}

const AccountPage = React.memo((props: AccountPageProps) => {
  const { config } = props;

  const [, navigationDispatch] = useContext(NavigationContext);
  const [userState] = useContext(UserContext);
  const { userDoc } = userState;

  ConfigCache.instance.set(config);

  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Account"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  if (userDoc === null) {
    return (
      <StyledUserProfilePage>
        <BetaBanner />
        <PageNotFound />
      </StyledUserProfilePage>
    );
  }

  return (
    <>
      <StyledUserProfilePage>
        <BetaBanner />
        <StyledContent>
          <StyledContainer>
            <UserProfile
              username={userDoc?.username}
              bio={userDoc?.bio}
              icon={userDoc?.icon?.fileUrl}
              hex={userDoc?.hex}
              canEdit
            />
          </StyledContainer>
        </StyledContent>
        <Footer />
      </StyledUserProfilePage>
    </>
  );
});

export default AccountPage;

export const getStaticProps: GetStaticProps<AccountPageProps> = async () => {
  const getLocalizationConfigParameters = (
    await import("../lib/getLocalizationConfigParameters")
  ).default;
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  return {
    props: { config },
  };
};
