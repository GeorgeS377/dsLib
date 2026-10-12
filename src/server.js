// Entrypoint. Applies pending migrations, then starts listening.
//
// Migrating on boot keeps deployment to "pull, install, restart" and makes it
// impossible to run application code against an out-of-date schema.
import process from 'node:process';
import { buildApp } from './app.js';
import { config } from './config.js';
import { closeDatabase, getDatabase } from './db/index.js';
import { migrate } from './db/migrate.js';

async function main() {
  const db = getDatabase();
  const applied = migrate(db);
  if (applied.length > 0) {
    console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
  }

  const app = await buildApp();

  if (config.sessionUsingEphemeralSecret) {
    app.log.warn(
      'SESSION_SECRET is not configured; using an ephemeral development secret. ' +
        'Staff sessions will be invalidated on every restart. Set SESSION_SECRET in .env.',
    );
  }

  const shutdown = async (signal) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      closeDatabase();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error) => {
  // Startup failures print the real reason: this output goes to the operator's
  // terminal or journal, never to a visitor.
  console.error('Failed to start:', error.message);
  if (process.env.NODE_ENV !== 'production') console.error(error);
  process.exit(1);
});
