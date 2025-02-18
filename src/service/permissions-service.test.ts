import { PermissionsService } from './permissions-service';
import { Permissions } from '../constants/permissions';

const MOCK_ADMIN_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTczOTU1ODk1MiwiZXhwIjoxNzcxMDk3ODkyLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlbjEiLCJyb2xlIjoiQURNSU4ifQ.Q32pjnv5RVljsQYMxU7d40N3DOGvp7plkWOLQwlcdJQ';
const MOCK_STUDENT_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTczOTU1ODk1MiwiZXhwIjoxNzcxMDk3ODkyLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlbjIiLCJyb2xlIjoiU1RVREVOVCJ9.yp4zLv4_nVujW8XPfTvoQjfpmAEVcGhyZL0Hm_ubF6k';
const MOCK_PLATFORM_ADMIN_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTczOTU1ODk1MiwiZXhwIjoxNzcxMDk3ODkyLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlbjQiLCJyb2xlIjoiUExBVEZPUk1fQURNSU4ifQ.vpW-SUhdScLFUlA5-wP8ZYLd8pDFMGvJQqyef4R7BP0';
const MOCK_SUPER_ADMIN_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTczOTU1ODk1MiwiZXhwIjoxNzcxMDk3ODkyLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlbjMiLCJyb2xlIjoiU1VQRVJfQURNSU4ifQ.Q6AEfvL2pKi9l4tiSCwwBhL5HgjG8__FTDKbZR-usu4';

describe('canUser', () => {
  it('Students can only take actions in their permissions set', () => {
    const permissions = [
      { action: Permissions.Dashboard.ScoreReport.VIEW, expected: false },
      { action: Permissions.Dashboard.Administrator.VIEW, expected: false },
      { action: Permissions.Dashboard.Organizations.LIST, expected: false },
    ];

    for (const action of permissions) {
      const canTakeAction = PermissionsService.canUser(MOCK_STUDENT_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
  it('Admins can only take actions in their permission set', () => {
    const permissions = [
      { action: Permissions.Dashboard.ScoreReport.VIEW, expected: true },
      { action: Permissions.Dashboard.Organizations.LIST, expected: true },
      { action: Permissions.Dashboard.Users.LIST, expected: true },
      { action: Permissions.Dashboard.Users.EDIT, expected: false },
      { action: Permissions.Dashboard.Users.CREATE, expected: false },
    ];

    for (const action of permissions) {
      const canTakeAction = PermissionsService.canUser(MOCK_ADMIN_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
  it('Platform admins can take actions in their permission set', () => {
    const permissions = [
      { action: Permissions.Dashboard.ScoreReport.VIEW, expected: true },
      { action: Permissions.Dashboard.Organizations.LIST, expected: true },
      { action: Permissions.Dashboard.Users.LIST, expected: true },
      { action: Permissions.Dashboard.Users.EDIT, expected: true },
      { action: Permissions.Dashboard.Users.CREATE, expected: true },
    ];

    for (const action of permissions) {
      const canTakeAction = PermissionsService.canUser(MOCK_PLATFORM_ADMIN_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
  it('Super admins can take all actions', () => {
    const permissions = [
      { action: Permissions.Dashboard.ScoreReport.VIEW, expected: true },
      { action: Permissions.Dashboard.Organizations.LIST, expected: true },
      { action: Permissions.Dashboard.Users.LIST, expected: true },
      { action: Permissions.Dashboard.Users.EDIT, expected: true },
      { action: Permissions.Dashboard.Users.CREATE, expected: true },
    ];

    for (const action of permissions) {
      const canTakeAction = PermissionsService.canUser(MOCK_SUPER_ADMIN_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
});
