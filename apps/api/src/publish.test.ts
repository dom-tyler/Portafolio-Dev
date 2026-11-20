import { describe, expect, it, vi } from 'vitest';
import { PUBLISH_COOLDOWN_MS, PublishError, requestPublish, type PublishDeps } from './publish.js';

const admin = { admin: true, email: 'daniel@example.com' };

function makeDeps(overrides: Partial<PublishDeps> = {}) {
  const deps: PublishDeps = {
    githubToken: 'ghp_test',
    lastRequestedAt: vi.fn(async () => null),
    createRecord: vi.fn(async () => 'pub_1'),
    failRecord: vi.fn(async () => undefined),
    dispatch: vi.fn(async () => ({ ok: true, status: 204, text: async () => '' })),
    now: () => 1_000_000,
    ...overrides,
  };
  return deps;
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof PublishError ? e.code : 'other';
  }
};

describe('requestPublish', () => {
  it('registra la publicación y dispara el workflow en main con su id', async () => {
    const deps = makeDeps();
    await expect(requestPublish(admin, deps)).resolves.toEqual({ publishId: 'pub_1' });
    const [url, init] = (deps.dispatch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/dom-tyler/Portafolio-Dev/actions/workflows/deploy.yml/dispatches');
    expect(JSON.parse(init.body)).toEqual({ ref: 'main', inputs: { publish_id: 'pub_1' } });
    expect(init.headers.Authorization).toBe('Bearer ghp_test');
  });

  it('rechaza a quien no es admin o no inició sesión', async () => {
    expect(await code(requestPublish(null, makeDeps()))).toBe('permission-denied');
    expect(await code(requestPublish({ admin: false, email: 'x@y.z' }, makeDeps()))).toBe('permission-denied');
  });

  it('sin token configurado: failed-precondition', async () => {
    expect(await code(requestPublish(admin, makeDeps({ githubToken: '  ' })))).toBe('failed-precondition');
  });

  it('respeta el minuto entre publicaciones', async () => {
    const recent = makeDeps({ lastRequestedAt: async () => 1_000_000 - PUBLISH_COOLDOWN_MS + 1 });
    expect(await code(requestPublish(admin, recent))).toBe('resource-exhausted');
    expect(recent.createRecord).not.toHaveBeenCalled();
    const old = makeDeps({ lastRequestedAt: async () => 1_000_000 - PUBLISH_COOLDOWN_MS });
    expect(await code(requestPublish(admin, old))).toBe('ok');
  });

  it('si GitHub falla, marca la publicación como fallida', async () => {
    const deps = makeDeps({ dispatch: async () => ({ ok: false, status: 404, text: async () => 'Not Found' }) });
    expect(await code(requestPublish(admin, deps))).toBe('internal');
    expect(deps.failRecord).toHaveBeenCalledWith('pub_1', 'GitHub respondió 404: Not Found');
  });
});
