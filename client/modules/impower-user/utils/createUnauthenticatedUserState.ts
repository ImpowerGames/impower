import { UserState } from "../types/userState";

const createUnauthenticatedUserState = (): UserState => ({
  uid: null,
  isSignedIn: false,
  claims: {
    username: null,
    icon: null,
    dob: null,
    captcha_time: null,
    storage: null,
  },
  submissions: {
    studios: null,
    games: null,
    resources: null,
    phrases: null,
    contributions: null,
    comments: null,
    suggestions: null,
  },
  customizations: {
    phrase_additions: null,
    phrase_deletions: null,
  },
  settings: {
    account: null,
  },
  studios: {},
  follows: {},
  connects: {},
  my_submissions: {},
  my_connects: {},
  my_follows: {},
  my_likes: {},
  my_dislikes: {},
  my_kudos: {},
  my_studio_memberships: {},
  my_resource_memberships: {},
  my_game_memberships: {},
  my_recent_pages: {},
  my_recent_published_pages: {},
  my_recent_pitched_projects: {},
  my_recent_comments: {},
  my_recent_contributions: {},
});

export default createUnauthenticatedUserState;
