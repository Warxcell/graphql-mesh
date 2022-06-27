/* eslint-disable import/no-extraneous-dependencies */
import { DefaultLogger, PubSub } from '@graphql-mesh/utils';
import InMemoryLRUCache from '@graphql-mesh/cache-localforage';
import useMeshRateLimit from '../src';
import { envelop, useSchema } from '@envelop/core';
import { buildSchema } from 'graphql';

describe('Rate Limit Plugin', () => {
  let pubsub: PubSub;
  let cache: InMemoryLRUCache;

  const schema = buildSchema(/* GraphQL */ `
    type Query {
      foo: String
      bar: String
    }
  `);

  beforeEach(() => {
    pubsub = new PubSub();
    cache = new InMemoryLRUCache();
  });

  afterEach(() => {
    pubsub.publish('destroy', {} as any);
  });

  it('should throw an error if the rate limit is exceeded', async () => {
    const getEnveloped = envelop({
      plugins: [
        useSchema(schema),
        useMeshRateLimit({
          cache,
          pubsub,
          logger: new DefaultLogger(),
          config: [
            {
              type: 'Query',
              field: 'foo',
              max: 5,
              ttl: 5000,
              identifier: '{context.userId}',
            },
          ],
        }),
      ],
    });
    const query = /* GraphQL */ `
      {
        foo
      }
    `;
    const runValidation = () => {
      const { parse, validate } = getEnveloped({
        userId: '1',
      });
      const documentAST = parse(query);
      return validate(schema, documentAST);
    };
    for (let i = 0; i < 5; i++) {
      const errors = runValidation();

      expect(errors).toEqual([]);
    }

    const errors = runValidation();

    const firstError = errors[0];
    expect(firstError.message).toBe('Rate limit of "Query.foo" exceeded for "1"');
    expect(firstError.path).toEqual(['foo']);
  });
  it('should reset tokens when the ttl is expired', async () => {
    const getEnveloped = envelop({
      plugins: [
        useSchema(schema),
        useMeshRateLimit({
          cache,
          pubsub,
          logger: new DefaultLogger(),
          config: [
            {
              type: 'Query',
              field: 'foo',
              max: 5,
              ttl: 1000,
              identifier: '{context.userId}',
            },
          ],
        }),
      ],
    });
    const query = /* GraphQL */ `
      {
        foo
      }
    `;
    const runValidation = () => {
      const { parse, validate } = getEnveloped({
        userId: '1',
      });
      const documentAST = parse(query);
      return validate(schema, documentAST);
    };
    for (let i = 0; i < 5; i++) {
      const errors = runValidation();

      expect(errors).toEqual([]);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    const errors = runValidation();

    expect(errors).toEqual([]);
  });
  it('should provide different tokens for different identifiers', async () => {
    const getEnveloped = envelop({
      plugins: [
        useSchema(schema),
        useMeshRateLimit({
          cache,
          pubsub,
          logger: new DefaultLogger(),
          config: [
            {
              type: 'Query',
              field: 'foo',
              max: 1,
              ttl: 1000,
              identifier: '{context.userId}',
            },
          ],
        }),
      ],
    });
    const query = /* GraphQL */ `
      {
        foo
      }
    `;

    for (let i = 0; i < 2; i++) {
      const runValidation = () => {
        const { parse, validate } = getEnveloped({
          userId: `User${i}`,
        });
        const documentAST = parse(query);
        return validate(schema, documentAST);
      };

      const resultSuccessful = await runValidation();

      expect(resultSuccessful).toEqual([]);

      const resultFails = await runValidation();

      const firstError = resultFails[0];
      expect(firstError.message).toBe(`Rate limit of "Query.foo" exceeded for "User${i}"`);
      expect(firstError.path).toEqual(['foo']);
    }

    expect.assertions(6);
  });
});
