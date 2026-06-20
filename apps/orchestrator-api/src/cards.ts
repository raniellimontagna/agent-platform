import {
  createCardGatewayRegistry,
  type CardGateway,
  type CardGatewayRegistry,
  type CardProvider,
} from '@agent-platform/cards';
import { createLinearGateway } from '@agent-platform/linear';
import { createPlaneGateway } from '@agent-platform/plane';

export interface RuntimeCardEnv {
  CARD_PRIMARY_PROVIDER: CardProvider;
  CARD_EXTRA_PROVIDERS: string;
  PLANE_BASE_URL: string;
  PLANE_API_KEY?: string;
  PLANE_WORKSPACE_SLUG: string;
  PLANE_PROJECT_ID?: string;
  LINEAR_API_KEY?: string;
  LINEAR_TEAM_ID?: string;
}

function parseProviders(raw: string): CardProvider[] {
  const providers: CardProvider[] = [];
  for (const provider of raw.split(',').map((item) => item.trim())) {
    if (provider === 'plane' || provider === 'linear') {
      providers.push(provider);
    }
  }
  return providers;
}

export function createRuntimeCards(env: RuntimeCardEnv): CardGatewayRegistry {
  const extraProviders = parseProviders(env.CARD_EXTRA_PROVIDERS);
  const enabled = new Set<CardProvider>([env.CARD_PRIMARY_PROVIDER, ...extraProviders]);
  const gateways: CardGateway[] = [];

  if (enabled.has('plane')) {
    if (!env.PLANE_API_KEY || !env.PLANE_PROJECT_ID) {
      throw new Error('Plane card provider requires PLANE_API_KEY and PLANE_PROJECT_ID');
    }

    gateways.push(
      createPlaneGateway({
        baseUrl: env.PLANE_BASE_URL,
        apiKey: env.PLANE_API_KEY,
        workspaceSlug: env.PLANE_WORKSPACE_SLUG,
        projectId: env.PLANE_PROJECT_ID,
      }),
    );
  }

  if (enabled.has('linear')) {
    if (!env.LINEAR_API_KEY) {
      if (env.CARD_PRIMARY_PROVIDER === 'linear') {
        throw new Error('Linear card provider requires LINEAR_API_KEY');
      }
    } else {
      gateways.push(createLinearGateway(env.LINEAR_API_KEY, { teamId: env.LINEAR_TEAM_ID }));
    }
  }

  return createCardGatewayRegistry({
    primaryProvider: env.CARD_PRIMARY_PROVIDER,
    gateways,
  });
}
