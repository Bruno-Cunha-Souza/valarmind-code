import { describe, it, expect } from 'vitest';
import { MockFileSystem } from '../../../src/core/fs.js';
import {
  loadCredentials,
  saveCredentials,
  removeCredentials,
  maskApiKey,
} from '../../../src/auth/credentials.js';

describe('credentials', () => {
  it('returns null when no credentials exist', async () => {
    const fs = new MockFileSystem();
    expect(await loadCredentials(fs)).toBeNull();
  });

  it('saves and loads credentials', async () => {
    const fs = new MockFileSystem();
    await saveCredentials(fs, 'sk-or-v1-test123');
    const key = await loadCredentials(fs);
    expect(key).toBe('sk-or-v1-test123');
  });

  it('removes credentials', async () => {
    const fs = new MockFileSystem();
    await saveCredentials(fs, 'sk-or-v1-test123');
    await removeCredentials(fs);
    expect(await loadCredentials(fs)).toBeNull();
  });
});

describe('maskApiKey', () => {
  it('masks long keys', () => {
    expect(maskApiKey('sk-or-v1-abcdefgh1234')).toBe('sk-or-****1234');
  });

  it('masks short keys', () => {
    expect(maskApiKey('short')).toBe('****');
  });
});
