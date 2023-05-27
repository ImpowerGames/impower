import styled from "@emotion/styled";
import React, { useContext, useEffect } from "react";
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
import Footer from "../modules/impower-route-home/components/elements/Footer";
import Illustration from "../modules/impower-route-home/components/elements/Illustration";
import Login from "../modules/impower-route-login/components/Login";
import NavigationBarSpacer from "../modules/impower-route/components/elements/NavigationBarSpacer";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../modules/impower-route/hooks/useHTMLOverscrollBehavior";
import IllustrationImage from "../resources/illustrations/fogg-5.svg";

const StyledLogin = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background-color: ${(props): string => props.theme.colors.lightForeground};

  ${(props): string => props.theme.breakpoints.down("md")} {
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

const StyledBackgroundArea = styled.div`
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-end;
  overflow: hidden;

  ${(props): string => props.theme.breakpoints.down("md")} {
    display: none;
  }
`;

const StyledContainer = styled.div`
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(60)};
  margin: auto;
`;

const LoginPage = React.memo(() => {
  const [, navigationDispatch] = useContext(NavigationContext);

  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");
  useHTMLOverscrollBehavior("auto");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Login"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation(0));
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  return (
    <>
      <NavigationBarSpacer />
      <StyledLogin>
        <StyledBackgroundArea>
          <Illustration
            imageStyle={{
              position: "absolute",
              bottom: -80,
              right: -96,
              minWidth: "50%",
              minHeight: 600,
            }}
          >
            <IllustrationImage />
          </Illustration>
        </StyledBackgroundArea>
        <StyledContent>
          <StyledContainer style={{ padding: 0 }}>
            <Login />
          </StyledContainer>
        </StyledContent>
        <Footer />
      </StyledLogin>
    </>
  );
});

export default LoginPage;
