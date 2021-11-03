export enum MenuType {
  Account = "Account",
  Profile = "Profile",
  Logout = "Logout",
}

export interface MenuInfo {
  type?: MenuType;
  label: string;
  link: string;
  icon?: React.ReactNode;
}
