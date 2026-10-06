import { isBackendBlocked } from './client';

const PROD = 'https://script.google.com/macros/s/AKfycbzuMsCMlqGhFBBSLpWGBMT0jkfHATvi9WJCKDm_KUdIaocK8N3TdM7hbaXeJjl-uj6F/exec';
const STAGING = 'https://script.google.com/macros/s/AKfycbzRMazYQw1s71gEB7kML6haZ6fKuxcapbclD7ty6UoDkHQaRtrhlwA5c5t8x2KQ4aP1oA/exec';

describe('who may use the production backend', () => {
  it('the live site may', () => {
    expect(isBackendBlocked(PROD, 'abbss-hiring-pipeline.vercel.app')).toBe(false);
  });
  it('a custom domain may (only localhost and other vercel.app addresses are blocked)', () => {
    expect(isBackendBlocked(PROD, 'hiring.ab-businesssupport.com')).toBe(false);
  });
  it('a local dev server may not', () => {
    for (const h of ['localhost', '127.0.0.1', '[::1]']) expect(isBackendBlocked(PROD, h)).toBe(true);
  });
  it('a Vercel preview of any branch may not', () => {
    expect(isBackendBlocked(PROD, 'abbss-hiring-pipeline-git-ab-29-frontend-rebuild-team.vercel.app')).toBe(true);
    expect(isBackendBlocked(PROD, 'abbss-hiring-pipeline-abc123.vercel.app')).toBe(true);
  });
  it('a look-alike host does not get through', () => {
    expect(isBackendBlocked(PROD, 'abbss-hiring-pipeline.vercel.app.evil.com')).toBe(false); // not a vercel.app host: nothing to block, and it is not the live site either
    expect(isBackendBlocked(PROD, 'evil-abbss-hiring-pipeline.vercel.app')).toBe(true);
  });
  it('staging, or no address, is never blocked', () => {
    for (const h of ['localhost', 'abbss-hiring-pipeline-abc123.vercel.app']) {
      expect(isBackendBlocked(STAGING, h)).toBe(false);
      expect(isBackendBlocked('', h)).toBe(false);
    }
  });
});
