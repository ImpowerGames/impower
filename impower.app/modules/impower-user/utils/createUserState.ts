import { UserState } from "../types/userState";

const createUserState = (): UserState => ({
  claims: {
    username: undefined,
    icon: undefined,
    dob: undefined,
    captcha_time: undefined,
    storage: undefined,
  },
  submissions: {
    studios: undefined,
    projects: undefined,
    phrases: undefined,
    contributions: undefined,
    comments: undefined,
    suggestions: undefined,
    notes: undefined,
  },
  customizations: {
    phrase_additions: undefined,
    phrase_deletions: undefined,
  },
  settings: {
    account: undefined,
  },
  my_recent_pages: {},
  my_recent_published_pages: {},
  my_recent_pitched_projects: {},
  my_recent_comments: {},
  my_recent_contributions: {},
});

export default createUserState;
