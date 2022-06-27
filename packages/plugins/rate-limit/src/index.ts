import { stringInterpolator } from '@graphql-mesh/string-interpolation';
import { MeshPluginOptions, YamlConfig } from '@graphql-mesh/types';
import { Plugin } from '@envelop/core';
import { process } from '@graphql-mesh/cross-helpers';
import { createGraphQLError } from '@graphql-tools/utils';

export default function useMeshRateLimit(options: MeshPluginOptions<YamlConfig.RateLimitPluginConfig>): Plugin {
  const pathRateLimitDef = new Map<string, YamlConfig.RateLimitTransformConfig>();
  const tokenMap = new Map<string, number>();
  const timeouts = new Set<NodeJS.Timeout>();

  if (options.config) {
    options.config.forEach(config => {
      pathRateLimitDef.set(`${config.type}.${config.field}`, config);
    });
  }
  if (options.pubsub) {
    const id = options.pubsub.subscribe('destroy', () => {
      options.pubsub.unsubscribe(id);
      timeouts.forEach(timeout => clearTimeout(timeout));
    });
  }

  return {
    onValidate(onValidateParams) {
      onValidateParams.addValidationRule(validationContext => ({
        Field: () => {
          const parentType = validationContext.getParentType();
          const fieldDef = validationContext.getFieldDef();
          const path = `${parentType.name}.${fieldDef.name}`;
          const rateLimitConfig = pathRateLimitDef.get(path);
          if (rateLimitConfig) {
            const identifier = stringInterpolator.parse(rateLimitConfig.identifier, {
              env: process.env,
              context: onValidateParams.context,
            });
            const mapKey = `${identifier}-${path}`;
            let remainingTokens = tokenMap.get(mapKey);

            if (remainingTokens == null) {
              remainingTokens = rateLimitConfig.max;
              const timeout = setTimeout(() => {
                tokenMap.delete(mapKey);
                timeouts.delete(timeout);
              }, rateLimitConfig.ttl);
              timeouts.add(timeout);
            }

            if (remainingTokens === 0) {
              validationContext.reportError(
                createGraphQLError(`Rate limit of "${path}" exceeded for "${identifier}"`, {
                  path: [fieldDef.name],
                })
              );
              // Remove this field from the selection set
              return null;
            } else {
              tokenMap.set(mapKey, remainingTokens - 1);
            }
          }
          return false;
        },
      }));
    },
  };
}
