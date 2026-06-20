import { pathToFileURL } from 'node:url';
import { env } from './env.js';
import { ensurePlaneProjectAndLabels } from './planeBootstrap.js';

export async function main() {
  if (!env.PLANE_API_KEY) {
    throw new Error('PLANE_API_KEY is required for plane:bootstrap');
  }

  return ensurePlaneProjectAndLabels({
    baseUrl: env.PLANE_BASE_URL,
    apiKey: env.PLANE_API_KEY,
    workspaceSlug: env.PLANE_WORKSPACE_SLUG,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2),
      );
      process.exitCode = 1;
    });
}
