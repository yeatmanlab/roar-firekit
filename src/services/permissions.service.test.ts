import { PermissionsService } from './permissions.service';
import { Permissions } from '../constants/permissions';
import { UserRoles } from '../constants/user-roles';
import { roles } from '../constants/roles';

const MOCK_ADMIN_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTc0MDU5NTg5MywiZXhwIjoxNzcyMTMxOTAzLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlbkFkbWluIiwicm9sZSI6ImFkbWluIn0.x_WFnnQCFD4M-9f77X3QzGSpq_SynUC6yhIKbW1QfBY';
const MOCK_STUDENT_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTc0MDU5NTM2NywiZXhwIjoxNzcyMTMxMzY3LCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlblN0dWRlbnQiLCJyb2xlIjoic3R1ZGVudCJ9.MpD5OOc7ekmPPOWSoWNW2X0MKuiftX8osSdGpgTT00Y';
const MOCK_PLATFORM_ADMIN_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTc0MDU5NTg5MywiZXhwIjoxNzcyMTMxOTAzLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlblBsYXRmb3JtQWRtaW4iLCJyb2xlIjoicGxhdGZvcm1fYWRtaW4ifQ.64xpaXChNVicuDrJzqXqiBrf3Xx03129DJ5S7US7vk0';

const MOCK_SUPER_ADMIN_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTc0MDU5NTg5MywiZXhwIjoxNzcyMTMxOTAzLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlblN1cGVyQWRtaW4iLCJyb2xlIjoic3VwZXJfYWRtaW4ifQ.K0crV-sD5twhTrrsq4HnRgEZRlKMuTftmJmRRvS7SN4';

describe('canUser', () => {
  it('Students can only take actions in their permissions set', () => {
    const permissions = roles[UserRoles.STUDENT].permissions.map((permission) => {
      return { action: permission as string, expected: true };
    });

    permissions.push(
      { action: Permissions.Users.UPDATE, expected: false },
      { action: 'test.fake.permission', expected: false },
    );

    for (const action of permissions) {
      const canTakeAction = PermissionsService.canUser(MOCK_STUDENT_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
  it('Admins can only take actions in their permission set', () => {
    const permissions = roles[UserRoles.ADMIN].permissions.map((permission) => {
      return { action: permission as string, expected: true };
    });

    permissions.push(
      { action: Permissions.Users.CREATE, expected: false },
      { action: 'test.fake.permission', expected: false },
    );

    for (const action of permissions) {
      const canTakeAction = PermissionsService.canUser(MOCK_ADMIN_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
  it('Platform admins can take actions in their permission set', () => {
    const permissions = roles[UserRoles.PLATFORM_ADMIN].permissions.map((permission) => {
      return { action: permission as string, expected: true };
    });

    permissions.push({ action: 'test.fake.permission', expected: false });

    for (const action of permissions) {
      const canTakeAction = PermissionsService.canUser(MOCK_PLATFORM_ADMIN_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
  it('Super admins can take all actions', () => {
    const permissions = roles[UserRoles.SUPER_ADMIN].permissions.map((permission) => {
      return { action: permission as string, expected: true };
    });

    // super_admins are also subject to permissions that do not exist.
    // This ensures that invalid permissions are not introduced.
    permissions.push({ action: 'test.fake.permission', expected: false });

    for (const action of permissions) {
      const canTakeAction = PermissionsService.canUser(MOCK_SUPER_ADMIN_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
  it('Returns false for invalid permissions', () => {
    const permissions = [
      { action: 'test.fake.permission', expected: false },
      { action: 'users.false', expected: false },
    ];

    for (const action of permissions) {
      const canTakeAction = PermissionsService.canUser(MOCK_ADMIN_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
});
