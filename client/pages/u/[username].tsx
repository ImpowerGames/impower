import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import CircularProgress from "@material-ui/core/CircularProgress";
import Container from "@material-ui/core/Container";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import { GetStaticPaths, GetStaticProps } from "next";
import React, { useContext, useEffect } from "react";
import { initAdminApp } from "../../lib/initAdminApp";
import {
  getSerializableDocument,
  UserDocument,
} from "../../modules/impower-data-store";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
  navigationSetType,
} from "../../modules/impower-navigation";
import { BetaBanner } from "../../modules/impower-route";
import Footer from "../../modules/impower-route-home/components/elements/Footer";
import UserProfile from "../../modules/impower-route-user-profile/UserProfile";
import useBodyBackgroundColor from "../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../modules/impower-route/hooks/useHTMLBackgroundColor";
import { UserContext } from "../../modules/impower-user";

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

const StyledPaper = styled(Paper)`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${(props): string => props.theme.spacing(3, 4)};

  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(2, 2)};
    box-shadow: none;
  }
`;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  margin-bottom: ${(props): string => props.theme.spacing(1)};
`;

interface UserProfilePageProps {
  doc: UserDocument;
}

const UserProfilePage = React.memo((props: UserProfilePageProps) => {
  const { doc } = props;
  const [userState] = useContext(UserContext);

  const [, navigationDispatch] = useContext(NavigationContext);
  const theme = useTheme();

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText());
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  if (doc === null || doc === undefined) {
    const usernameQuery =
      typeof window !== "undefined"
        ? decodeURI(window.location.pathname.split("/").pop())
        : "";
    // If the doc is not ready, display a spinner
    return (
      <StyledUserProfilePage>
        <BetaBanner />
        <StyledContent>
          <StyledPaper>
            <CircularProgress />
            <StyledTitleTypography variant="h5">
              {usernameQuery}
            </StyledTitleTypography>
          </StyledPaper>
        </StyledContent>
      </StyledUserProfilePage>
    );
  }

  const { username, icon, hex, bio } = doc;
  const canEdit = username === userState?.userDoc?.username;
  return (
    <StyledUserProfilePage>
      <BetaBanner />
      <StyledContent>
        <Container component="main" maxWidth="sm" style={{ padding: 0 }}>
          <UserProfile
            username={username}
            bio={bio}
            icon={icon?.fileUrl}
            hex={hex}
            canEdit={canEdit}
          />
        </Container>
      </StyledContent>
      <Footer />
    </StyledUserProfilePage>
  );
});

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [],
    fallback: true,
  };
};

export const getStaticProps: GetStaticProps = async (context) => {
  const { username } = context.params;
  const docUsername = Array.isArray(username) ? username[0] : username;
  const adminApp = await initAdminApp();
  const postsSnapshot = await adminApp
    .firestore()
    .collection(`users`)
    .where("username", "==", docUsername)
    .limit(1)
    .get();
  const postDoc = postsSnapshot.docs[0]?.data();
  const serializableData = getSerializableDocument<UserDocument>(postDoc);

  return {
    props: {
      doc: serializableData != null ? serializableData : null,
    },
    // Regenerate the page:
    // - When a request comes in
    // - At most once every 60 seconds
    revalidate: 60,
  };
};

export default UserProfilePage;
