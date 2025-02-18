export const Permissions = {
  Dashboard: {
    ScoreReport: {
      ALL: 'dashboard.score_report.*',
      VIEW: 'dashboard.score_report.view',
    },
    StudentReport: {
      ALL: 'dashboard.student_report.*',
      VIEW: 'dashboard.student_report.view',
    },
    ProgressReport: {
      ALL: 'dashboard.progress_report.*',
      VIEW: 'dashboard.progress_report.view',
    },
    Organizations: {
      ALL: 'dashboard.organizations.*',
      LIST: 'dashboard.organizations.list',
      CREATE: 'dashboard.organizations.create',
    },
    Administrations: {
      ALL: 'dashboard.administrations.*',
      LIST: 'dashboard.administrations.list',
      CREATE: 'dashboard.administrations.create',
      EDIT: 'dashboard.administrations.edit',
    },
    Administrators: {
      ALL: 'dashboard.administrator.*',
      VIEW: 'dashboard.administrator.view',
      CREATE: 'dashboard.administrator.create',
      EDIT: 'dashboard.administrator.edit',
      CHANGE_PASSWORD: 'dashboard.profile.change_password',
    },
    Profile: {
      ALL: 'dashboard.profile.*',
      VIEW: 'dashboard.profile.view',
    },
    Users: {
      ALL: 'dashboard.users.*',
      LIST: 'dashboard.users.list',
      CREATE: 'dashboard.users.create',
      EDIT: 'dashboard.users.edit',
      CHANGE_PASSWORD: 'dashboard.users.change_password',
    },
    Tasks: {
      ALL: 'dashboard.tasks.*',
      MANAGE: 'dashboard.tasks.manage',
    },
  },
};
