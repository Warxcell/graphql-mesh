import { KeyValueCache } from '@graphql-mesh/types';
import { KVNamespace } from '@cloudflare/workers-types';
import { makeCloudflareWorkerKVEnv } from 'cloudflare-worker-mock';

export default class CFWorkerKVCache implements KeyValueCache {
  private kvNamespace: KVNamespace;
  constructor(config: { namespace: string }) {
    this.kvNamespace = globalThis[config.namespace] ?? makeCloudflareWorkerKVEnv(config.namespace)[config.namespace];
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.kvNamespace.get(key, 'json');
  }

  async getKeysByPrefix(prefix: string): Promise<string[]> {
    const result = await this.kvNamespace.list({
      prefix,
    });

    return result.keys.map(keyEntry => keyEntry.name);
  }

  set(key: string, value: any, options?: { ttl?: number }): Promise<void> {
    return this.kvNamespace.put(key, JSON.stringify(value), {
      expirationTtl: options?.ttl,
    });
  }

  delete(key: string): Promise<void> {
    return this.kvNamespace.delete(key);
  }
}
