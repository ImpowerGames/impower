import styled from "@emotion/styled";
import React, { useContext, useEffect, useMemo } from "react";
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
import SignUp from "../modules/impower-route-signup/components/SignUp";
import NavigationBarSpacer from "../modules/impower-route/components/elements/NavigationBarSpacer";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";
import IllustrationImage from "../resources/illustrations/fogg-5.svg";

const StyledSignUp = styled.div`
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

const SignupPage = React.memo(() => {
  const [, navigationDispatch] = useContext(NavigationContext);

  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useMemo(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Sign Up"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  return (
    <>
      <NavigationBarSpacer />
      <StyledSignUp>
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
            <SignUp />
          </StyledContainer>
        </StyledContent>
        <Footer />
      </StyledSignUp>
    </>
  );
});

export default SignupPage;
