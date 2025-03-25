export enum UserRoles {
  SUPER_ADMIN = 'super_admin',
  PLATFORM_ADMIN = 'platform_admin',
  LAUNCH_ADMIN = 'launch_admin',
  ADMIN = 'admin',
  STUDENT = 'student',
  GUEST = 'guest',
}

export const FallbackRole = UserRoles.GUEST;
