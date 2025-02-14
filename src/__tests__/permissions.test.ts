import { canUser } from '../permissions/permissionsManager';

const ADMIN_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTczOTU1ODk1MiwiZXhwIjoxNzcxMDk3ODkyLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlbjEiLCJyb2xlIjoiQURNSU4ifQ.Q32pjnv5RVljsQYMxU7d40N3DOGvp7plkWOLQwlcdJQ';
const STUDENT_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTczOTU1ODk1MiwiZXhwIjoxNzcxMDk3ODkyLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlbjIiLCJyb2xlIjoiU1RVREVOVCJ9.yp4zLv4_nVujW8XPfTvoQjfpmAEVcGhyZL0Hm_ubF6k';
const PLATFORM_ADMIN_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTczOTU1ODk1MiwiZXhwIjoxNzcxMDk3ODkyLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlbjQiLCJyb2xlIjoiUExBVEZPUk1fQURNSU4ifQ.vpW-SUhdScLFUlA5-wP8ZYLd8pDFMGvJQqyef4R7BP0';
const SUPER_ADMIN_TOKEN =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJSUE1fVGVzdF9Ub2tlbiIsImlhdCI6MTczOTU1ODk1MiwiZXhwIjoxNzcxMDk3ODkyLCJhdWQiOiJyb2FyLmVkdWNhdGlvbiIsInN1YiI6InRlc3RUb2tlbjMiLCJyb2xlIjoiU1VQRVJfQURNSU4ifQ.Q6AEfvL2pKi9l4tiSCwwBhL5HgjG8__FTDKbZR-usu4';

describe('canUser', () => {
  it('Students can only take actions in their permissions set', () => {
    const permissions = [
      { action: 'dashboard.score_report.view', expected: false },
      { action: 'dashboard.administrator.view', expected: false },
      { action: 'dashboard.admin_forms.list_orgs', expected: false },
      { action: 'dashboard.admin_forms.list_users', expected: false },
      { action: 'functions.users.create', expected: false },
      { action: 'functions.users.update_record', expected: false },
    ];

    for (const action of permissions) {
      const canTakeAction = canUser(STUDENT_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
  it('Admins can only take actions in their permission set', () => {
    const permissions = [
      { action: 'dashboard.score_report.view', expected: true },
      { action: 'dashboard.admin_forms.list_orgs', expected: true },
      { action: 'dashboard.admin_forms.list_users', expected: true },
      { action: 'dashboard.users.edit', expected: false },
      { action: 'functions.users.create', expected: false },
      { action: 'functions.users.update_record', expected: false },
    ];

    for (const action of permissions) {
      const canTakeAction = canUser(ADMIN_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
  it('Platform admins can take actions in their permission set', () => {
    const permissions = [
      { action: 'dashboard.score_report.view', expected: true },
      { action: 'dashboard.admin_forms.list_orgs', expected: true },
      { action: 'dashboard.admin_forms.list_users', expected: true },
      { action: 'dashboard.users.edit', expected: true },
      { action: 'functions.users.create', expected: true },
      { action: 'functions.users.update_record', expected: true },
    ];

    for (const action of permissions) {
      const canTakeAction = canUser(PLATFORM_ADMIN_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
  it('Super admins can take all actions', () => {
    const permissions = [
      { action: 'dashboard.score_report.view', expected: true },
      { action: 'dashboard.admin_forms.list_orgs', expected: true },
      { action: 'dashboard.admin_forms.list_users', expected: true },
      { action: 'dashboard.users.edit', expected: true },
      { action: 'functions.users.create', expected: true },
      { action: 'functions.users.update_record', expected: true },
    ];

    for (const action of permissions) {
      const canTakeAction = canUser(SUPER_ADMIN_TOKEN, action.action);
      expect(canTakeAction).toBe(action.expected);
    }
  });
});
