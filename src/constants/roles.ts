import { UserRoles } from './user-roles.js';
import { Permissions } from './permissions.js';

interface Role {
  title: string;
  permissions: Array<String>;
}

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
      Permissions.Dashboard.Administrator.VIEW,
      Permissions.Dashboard.Profile.VIEW,
      Permissions.Dashboard.ScoreReport.VIEW,
      Permissions.Dashboard.ProgressReport.VIEW,
      Permissions.Dashboard.StudentReport.VIEW,
      Permissions.Dashboard.Organizations.LIST,
      Permissions.Dashboard.Users.LIST,
      Permissions.Dashboard.Administrations.LIST,
    ],
  },
  [UserRoles.PLATFORM_ADMIN]: {
    title: 'Platform Admin',
    permissions: [
      Permissions.Dashboard.Administrator.VIEW,
      Permissions.Dashboard.Administrator.CREATE,
      Permissions.Dashboard.Administrator.EDIT,
      Permissions.Dashboard.Profile.ALL,
      Permissions.Dashboard.ScoreReport.VIEW,
      Permissions.Dashboard.ProgressReport.VIEW,
      Permissions.Dashboard.StudentReport.VIEW,
      Permissions.Dashboard.Organizations.ALL,
      Permissions.Dashboard.Administrations.ALL,
      Permissions.Dashboard.Users.ALL,
    ],
  },
  [UserRoles.SUPER_ADMIN]: {
    title: 'Super Admin',
    permissions: [],
  },
} as const satisfies Record<UserRoles, Role>;
