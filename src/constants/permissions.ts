export const Permissions = {
  Reports: {
    Score: {
      ALL: 'reports.score.*',
      READ: 'reports.score.read',
    },
    Progress: {
      ALL: 'reports.progress.*',
      READ: 'reports.progress.read',
    },
    Student: {
      ALL: 'reports.student.*',
      READ: 'reports.student.read',
    },
  },
  Organizations: {
    ALL: 'organizations.*',
    LIST: 'organizations.list',
    CREATE: 'organizations.create',
  },
  Administrations: {
    ALL: 'administrations.*',
    LIST: 'administrations.list',
    CREATE: 'administrations.create',
    UPDATE: 'administrations.update',
  },
  Administrators: {
    ALL: 'administrator.*',
    READ: 'administrator.READ',
    CREATE: 'administrator.create',
    UPDATE: 'administrator.update',
    Credentials: {
      UPDATE: 'administrator.credentials.update',
    },
  },
  Profile: {
    ALL: 'profile.*',
    READ: 'profile.READ',
  },
  Users: {
    ALL: 'users.*',
    LIST: 'users.list',
    CREATE: 'users.create',
    UPDATE: 'users.update',
    Credentials: {
      UPDATE: 'users.credentials.update',
    },
  },
  Tasks: {
    ALL: 'tasks.*',
    CREATE: 'tasks.create',
    UPDATE: 'tasks.update',
  },
};
