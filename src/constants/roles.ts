import { UserRoles } from './user-roles.js';
import { Permissions } from './permissions.js';

export const roles = {
  [UserRoles.GUEST]: {
    title: 'Guest',
    permissions: [],
  },
  [UserRoles.STUDENT]: {
    title: 'Student',
    permissions: [],
  },
  [UserRoles.ADMIN]: {
    title: 'Admin',
    permissions: [
      Permissions.Administrators.READ,
      Permissions.Profile.READ,
      Permissions.Reports.Score.READ,
      Permissions.Reports.Progress.READ,
      Permissions.Reports.Student.READ,
      Permissions.Organizations.LIST,
      Permissions.Users.LIST,
      Permissions.Administrations.LIST,
    ],
  },
  [UserRoles.PLATFORM_ADMIN]: {
    title: 'Platform Admin',
    permissions: [
      Permissions.Administrators.READ,
      Permissions.Administrators.CREATE,
      Permissions.Administrators.UPDATE,
      Permissions.Profile.ALL,
      Permissions.Reports.Score.READ,
      Permissions.Reports.Progress.READ,
      Permissions.Reports.Student.READ,
      Permissions.Organizations.ALL,
      Permissions.Administrations.ALL,
      Permissions.Users.ALL,
    ],
  },
  [UserRoles.LAUNCH_ADMIN]: {
    title: 'Launch Admin',
    permissions: [
      Permissions.Administrators.READ,
      Permissions.Profile.READ,
      Permissions.Reports.Score.READ,
      Permissions.Reports.Progress.READ,
      Permissions.Reports.Student.READ,
      Permissions.Organizations.LIST,
      Permissions.Users.LIST,
      Permissions.Administrations.LIST,
      Permissions.Tasks.LAUNCH,
    ],
  },
  [UserRoles.CI_TEST_ADMIN]: {
    title: 'CI/Test Admin',
    permissions: [
      Permissions.Administrators.READ,
      Permissions.Administrators.CREATE,
      Permissions.Administrators.UPDATE,
      Permissions.Profile.ALL,
      Permissions.Reports.Score.READ,
      Permissions.Reports.Progress.READ,
      Permissions.Reports.Student.READ,
      Permissions.Organizations.ALL,
      Permissions.Users.ALL,
      Permissions.Tasks.LAUNCH,
      Permissions.Administrations.ALL,
    ],
  },
  [UserRoles.SUPER_ADMIN]: {
    title: 'Super Admin',
    permissions: [],
  },
};
