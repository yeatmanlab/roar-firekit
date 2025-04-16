export enum UserRoles {
  SUPER_ADMIN = 'super_admin',
  PLATFORM_ADMIN = 'platform_admin',
  LAUNCH_ADMIN = 'launch_admin',
  CI_TEST_ADMIN = 'ci_test_admin_do_not_use',
  ADMIN = 'admin',
  STUDENT = 'student',
  GUEST = 'guest',
}

export const FallbackRole = UserRoles.GUEST;
