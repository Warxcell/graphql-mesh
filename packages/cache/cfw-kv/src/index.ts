import { KeyValueCache } from '@graphql-mesh/types';
import { KVNamespace } from '@cloudflare/workers-types';
import { makeCloudflareWorkerKVEnv } from 'cloudflare-worker-mock';

export default class CFWorkerKVCache implements KeyValueCache {
  private kvNamespace: KVNamespace;
  constructor(config: { name: string }) {
    this.kvNamespace = globalThis[config.name] ?? makeCloudflareWorkerKVEnv(config.name)[config.name];
  }

  get(key: string): Promise<string | undefined> {
    return this.kvNamespace.get(key);
  }

  async getKeysByPrefix(prefix: string): Promise<string[]> {
    const result = await this.kvNamespace.list({
      prefix,
    });

    return result.keys.map(keyEntry => keyEntry.name);
  }

  set(key: string, value: any, options?: { ttl?: number }): Promise<void> {
    return this.kvNamespace.put(key, value, {
      expirationTtl: options?.ttl,
    });
  }

  delete(key: string): Promise<void> {
    return this.kvNamespace.delete(key);
  }
}
