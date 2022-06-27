import { getBuiltMesh } from '../.mesh';
import { createServer } from '@graphql-yoga/common';

getBuiltMesh()
  .then(({ plugins }) =>
    createServer({
      plugins,
    }).start()
  )
  .catch(e => {
    // In case of Mesh error
    console.log(e);
    addEventListener('fetch', (event: any) => {
      event.respondWith(
        new Response('Internal Server Error', {
          status: 500,
        })
      );
    });
  });
