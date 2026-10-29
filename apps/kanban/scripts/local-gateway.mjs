import { randomBytes } from 'node:crypto';
import { AuthChain, GatewayRegistry, apiKeyProvider, createGateway, hashApiKey } from '@embody/gateway';
import { gatewayJwtVerifier } from '@embody/auth';
import { createAppHost } from '@embody/host';

/** One loopback gateway, independent application databases and audience-bound host credentials. */
export async function startLocalGateway({ apps, gatewayPort = 3032 }) {
  const token = randomBytes(32).toString('hex');
  const signingKey = randomBytes(32);
  const issuer = 'embody-local-gateway';
  const credentials = Object.fromEntries(apps.map(({ config }) => [config.appId, randomBytes(32).toString('hex')]));
  const principal = { orgId: 'local', actorId: 'local-owner', actorType: 'human', roles: ['owner'],
    scopes: ['kanban:*', 'tracker:*', 'crm:*', 'relationships:*', 'sales:*', 'success:*', 'workspace:*'] };
  const gateway = createGateway({
    environment: 'development',
    registry: new GatewayRegistry({ credentials, allowPrivateEndpoints: true,
      allowedOrigins: apps.map(({ port }) => `http://127.0.0.1:${port}`) }),
    auth: new AuthChain([apiKeyProvider([{ id: 'local-owner', hash: hashApiKey(token), principal }])]),
    token: { issuer, key: signingKey },
  });
  const runtimes = [];
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    try { for (const runtime of [...runtimes].reverse()) await runtime.stop(); }
    finally { await gateway.close(); }
  }
  try {
    const gatewayUrl = await gateway.listen({ host: '127.0.0.1', port: gatewayPort });
    for (const { config, port, database } of apps) {
      const runtime = await createAppHost(config, {
        host: '127.0.0.1',
        env: { NODE_ENV: 'development', PORT: String(port), DATABASE_FILE: database,
          GATEWAY_URL: gatewayUrl, PUBLIC_URL: `http://127.0.0.1:${port}`,
          GATEWAY_REGISTRATION_SECRET: credentials[config.appId], TRUST_INSECURE_HTTP: 'true' },
        verifier: gatewayJwtVerifier({ issuer, audience: config.appId, key: signingKey, algorithms: ['HS256'] }),
      });
      runtimes.push(runtime);
      await runtime.start();
    }
    return { gatewayUrl, token, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
