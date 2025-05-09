export const Permissions = {
  Reports: {
    Score: {
      ALL: 'reports.score.*',
      READ: 'reports.score.read',
      READ_COMPOSITE: 'reports.score.read_composite',
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
    UPDATE: 'organizations.update',
  },
  Administrations: {
    ALL: 'administrations.*',
    LIST: 'administrations.list',
    CREATE: 'administrations.create',
    UPDATE: 'administrations.update',
  },
  Administrators: {
    ALL: 'administrators.*',
    READ: 'administrators.read',
    CREATE: 'administrators.create',
    UPDATE: 'administrators.update',
    Credentials: {
      UPDATE: 'administrators.credentials.update',
    },
  },
  Profile: {
    ALL: 'profile.*',
    READ: 'profile.read',
  },
  Users: {
    ALL: 'users.*',
    LIST: 'users.list',
    CREATE: 'users.create',
    UPDATE: 'users.update',
    UNENROLL: 'users.unenroll',
    SET_PID: 'users.set_pid',
    Credentials: {
      UPDATE: 'users.credentials.update',
    },
  },
  Tasks: {
    ALL: 'tasks.*',
    CREATE: 'tasks.create',
    UPDATE: 'tasks.update',
    LAUNCH: 'tasks.launch',
  },
  TestData: {
    CREATE: 'data.create',
  },
};
