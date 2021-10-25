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
import Confirm from "../modules/impower-route-confirm/components/Confirm";
import Footer from "../modules/impower-route-home/components/elements/Footer";
import NavigationBarSpacer from "../modules/impower-route/components/elements/NavigationBarSpacer";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";

const StyledConfirm = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background-color: white;
`;

const StyledConfirmContent = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
`;

const StyledContainer = styled.div`
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(60)};
  margin: auto;
`;

const ConfirmPage = React.memo(() => {
  const [, navigationDispatch] = useContext(NavigationContext);

  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Confirm"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  if (process.env.NEXT_PUBLIC_ENVIRONMENT === "production") {
    return null;
  }

  return (
    <>
      <NavigationBarSpacer />
      <StyledConfirm className={StyledConfirm.displayName}>
        <StyledConfirmContent className={StyledConfirmContent.displayName}>
          <StyledContainer>
            <Confirm />
          </StyledContainer>
        </StyledConfirmContent>
        <Footer />
      </StyledConfirm>
    </>
  );
});

export default ConfirmPage;
