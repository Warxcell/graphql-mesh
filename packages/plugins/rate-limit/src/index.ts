import { stringInterpolator } from '@graphql-mesh/string-interpolation';
import { MeshPluginOptions, YamlConfig } from '@graphql-mesh/types';
import { Plugin } from '@envelop/core';
import { process } from '@graphql-mesh/cross-helpers';
import { createGraphQLError } from '@graphql-tools/utils';
import minimatch from 'minimatch';
import { ValidationContext, ValidationRule } from 'graphql';

export default function useMeshRateLimit(options: MeshPluginOptions<YamlConfig.RateLimitPluginConfig>): Plugin {
  const tokenMap = new Map<string, number>();
  const timeouts = new Set<NodeJS.Timeout>();

  if (options.pubsub) {
    const id = options.pubsub.subscribe('destroy', () => {
      options.pubsub.unsubscribe(id);
      timeouts.forEach(timeout => clearTimeout(timeout));
    });
  }

  const validationRuleFactories: ((context: any) => ValidationRule)[] = options.config.map(config => {
    const typeMatcher = new minimatch.Minimatch(config.type);
    const fieldMatcher = new minimatch.Minimatch(config.field);
    return (context: any) => (validationContext: ValidationContext) => ({
      Field: () => {
        const parentType = validationContext.getParentType();
        if (typeMatcher.match(parentType.name)) {
          const fieldDef = validationContext.getFieldDef();
          if (fieldMatcher.match(fieldDef.name)) {
            const identifier = stringInterpolator.parse(config.identifier, {
              env: process.env,
              context,
            });
            const mapKey = `${identifier}-${parentType.name}.${fieldDef.name}`;
            let remainingTokens = tokenMap.get(mapKey);

            if (remainingTokens == null) {
              remainingTokens = config.max;
              const timeout = setTimeout(() => {
                tokenMap.delete(mapKey);
                timeouts.delete(timeout);
              }, config.ttl);
              timeouts.add(timeout);
            }

            if (remainingTokens === 0) {
              validationContext.reportError(
                createGraphQLError(`Rate limit of "${parentType.name}.${fieldDef.name}" exceeded for "${identifier}"`, {
                  path: [fieldDef.name],
                })
              );
              // Remove this field from the selection set
              return null;
            } else {
              tokenMap.set(mapKey, remainingTokens - 1);
            }
          }
        }
        return false;
      },
    });
  });

  return {
    onValidate(onValidateParams) {
      validationRuleFactories.forEach(validationRuleFactory => {
        const validationRule = validationRuleFactory(onValidateParams.context);
        onValidateParams.addValidationRule(validationRule);
      });
    },
  };
}
