import { MeshPluginOptions, YamlConfig } from '@graphql-mesh/types';
import { Plugin } from '@envelop/core';
import { useResponseCache } from '@envelop/response-cache';

export default function useMeshResponseCache(options: MeshPluginOptions<YamlConfig.ResponseCacheConfig>): Plugin {
  const ttlPerType: Record<string, number> = {};
  const ttlPerSchemaCoordinate: Record<string, number> = {};
  for (const ttlConfig of options.ttlPerCoordinate) {
    if (ttlConfig.coordinate.includes('.')) {
      ttlPerSchemaCoordinate[ttlConfig.coordinate] = ttlConfig.ttl;
    } else {
      ttlPerType[ttlConfig.coordinate] = ttlConfig.ttl;
    }
  }
  return useResponseCache({
    ttl: options.ttl,
    ignoredTypes: options.ignoredTypes,
    idFields: options.idFields,
    invalidateViaMutation: options.invalidateViaMutation,
    includeExtensionMetadata: options.includeExtensionMetadata,
    ttlPerType,
    ttlPerSchemaCoordinate,
    getDocumentStringFromContext: (ctx: any) => ctx.query,
    cache: {
      get(responseId) {
        return options.cache.get(`response-cache:${responseId}`);
      },
      async set(responseId, data, entities, ttl) {
        await Promise.all(
          [...entities].map(async ({ typename, id }) => {
            const entryId = `${typename}.${id}`;
            await options.cache.set(`response-cache:${entryId}:${responseId}`, {}, { ttl: ttl / 1000 });
            await options.cache.set(`response-cache:${responseId}:${entryId}`, {}, { ttl: ttl / 1000 });
          })
        );
        return options.cache.set(`response-cache:${responseId}`, data, { ttl: ttl / 1000 });
      },
      async invalidate(entitiesToRemove) {
        const responseIdsToCheck = new Set<string>();
        await Promise.all(
          [...entitiesToRemove].map(async ({ typename, id }) => {
            const entryId = `${typename}.${id}`;
            const cacheEntriesToDelete = await options.cache.getKeysByPrefix(`response-cache:${entryId}:`);
            await Promise.all(
              cacheEntriesToDelete.map(cacheEntryName => {
                const [, , responseId] = cacheEntryName.split(':');
                responseIdsToCheck.add(responseId);
                return options.cache.delete(entryId);
              })
            );
          })
        );
        await Promise.all(
          [...responseIdsToCheck].map(async responseId => {
            const cacheEntries = await options.cache.getKeysByPrefix(`response-cache:${responseId}:`);
            if (cacheEntries.length === 0) {
              await options.cache.delete(`response-cache:${responseId}`);
            }
          })
        );
      },
    },
  });
}
