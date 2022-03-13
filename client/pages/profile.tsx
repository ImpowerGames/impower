import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { Container } from "@material-ui/core";
import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  createUserDocument,
  UserDocument,
} from "../modules/impower-data-store";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
  navigationSetType,
} from "../modules/impower-navigation";
import { BetaBanner } from "../modules/impower-route";
import Footer from "../modules/impower-route-home/components/elements/Footer";
import Illustration from "../modules/impower-route-home/components/elements/Illustration";
import CreateUserForm from "../modules/impower-route/components/forms/CreateUserForm";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../modules/impower-route/hooks/useHTMLOverscrollBehavior";
import { UserContext } from "../modules/impower-user";
import IllustrationImage from "../resources/illustrations/clip-busy-day-at-the-office.svg";

const StyledProfile = styled.div`
  padding-top: ${(props): string => props.theme.minHeight.navigationBar};
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
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

const StyledBackgroundArea = styled.div`
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-end;
  overflow: hidden;

  ${(props): string => props.theme.breakpoints.down("sm")} {
    display: none;
  }
`;

const ProfilePage = React.memo(() => {
  const [, navigationDispatch] = useContext(NavigationContext);
  const [userState] = useContext(UserContext);
  const { uid } = userState;
  const theme = useTheme();
  const { userDoc } = userState;
  const [createDoc, setCreateDoc] = useState<UserDocument>(userDoc);

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);
  useHTMLOverscrollBehavior("auto");

  useEffect(() => {
    if (uid && userDoc) {
      setCreateDoc(
        createUserDocument({
          ...userDoc,
          _createdBy: uid,
        })
      );
    }
  }, [uid, userDoc]);

  useMemo(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText());
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  if (process.env.NEXT_PUBLIC_ENVIRONMENT === "production") {
    return null;
  }

  return (
    <StyledProfile>
      <BetaBanner />
      <StyledBackgroundArea>
        <Illustration
          imageStyle={{
            position: "absolute",
            bottom: -32,
            right: -96,
            minWidth: "50%",
            minHeight: 550,
            backgroundPosition: "bottom right",
            backgroundSize: "contain",
          }}
        >
          <IllustrationImage />
        </Illustration>
      </StyledBackgroundArea>
      <StyledContent>
        <Container component="main" maxWidth="sm" style={{ padding: 0 }}>
          <CreateUserForm docId={uid} doc={createDoc} onChange={setCreateDoc} />
        </Container>
      </StyledContent>
      <Footer />
    </StyledProfile>
  );
});
export default ProfilePage;
