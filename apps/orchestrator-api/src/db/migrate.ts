import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * Aplica as migrations do diretório ./drizzle usando apenas drizzle-orm
 * (sem drizzle-kit), de forma que funcione na imagem de produção.
 * Uso: `node dist/db/migrate.js`.
 */
async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);
  logger.info('running migrations');
  await migrate(db, { migrationsFolder: './drizzle' });
  logger.info('migrations complete');
  await client.end();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
