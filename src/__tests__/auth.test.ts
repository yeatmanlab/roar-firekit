import { roarEmail } from '../auth';

describe('roarEmail', () => {
  it('returns a roar-auth email address', () => {
    const pid = 'test-pid';
    expect(roarEmail(pid)).toBe(`${pid}@roar-auth.com`);
  });
});
