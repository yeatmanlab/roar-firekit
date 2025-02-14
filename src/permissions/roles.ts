export default {
  GUEST: {
    title: 'Guest',
    permissions: [],
  },
  STUDENT: {
    title: 'Student',
    permissions: [],
  },
  ADMIN: {
    title: 'Admin',
    permissions: [
      'dashboard.administrator.view',
      'dashboard.profile.view',
      'dashboard.score_report.*',
      'dashboard.progress_report.*',
      'dashboard.student_report.*',
      'dashboard.admin_forms.list_orgs',
      'dashboard.admin_forms.list_users',
      'functions.admin.get_administrations',
    ],
  },
  PLATFORM_ADMIN: {
    title: 'Platform Admin',
    permissions: [
      'dashboard.administrator.view',
      'dashboard.profile.view',
      'dashboard.score_report.view',
      'dashboard.student_report.view',
      'dashboard.progress_report.view',
      'dashboard.admin_forms.*',
      'dashboard.users.edit',
      'dashboard.users.change_password',
      'functions.users.create',
      'functions.users.update_record',
      'functions.users.create_administrator',
    ],
  },
  SUPER_ADMIN: {
    title: 'Super Admin',
    permissions: [], // Super Admins skip the permission check.
  },
};

/**
 * DASHBOARD:
 * - dashboard.score_report.view                  x
 * - dashboard.student_report.view                x
 * - dashboard.progress_report.view               x
 * - dashboard.admin_forms.create_orgs            x
 * - dashbaord.admin_forms.list_orgs              x
 * - dashboard.admin_forms.create_administration  x
 * - dashboard.admin_forms.edit_administration    x
 * - dashboard.admin_forms.list_users             x
 * - dashboard.admin_forms.create_administrator   x
 * - dashboard.admin_forms.tasks_variants         x
 * - dashboard.admin_forms.create_students        x
 * - dashboard.profile.view                       x
 * - dashboard.administrator.view                 x
 * - dashboard.users.edit                         x
 * - dashboard.users.change_password              x
 * - dashboard.users.edit_administrator           x
 *
 * CLOUD FUNCTIONS:
 * - functions.admin.get_administrations
 * - functions.users.create
 * - functions.users.update_record
 * - functions.users.create_administrator
 *
 *
 */
