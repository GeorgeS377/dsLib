// Health check for monitoring and reverse-proxy probes.
//
// Deliberately reveals nothing useful to an attacker: no version strings of
// dependencies, no file paths, no configuration, no error details. Just
// whether the process is up and whether the database answers.

export default async function healthRoutes(app) {
  app.get('/healthz', async (_request, reply) => {
    const checks = { database: 'skipped' };
    let healthy = true;

    if (app.hasDecorator('db')) {
      try {
        app.db.ping();
        checks.database = 'ok';
      } catch (error) {
        // Log the real reason; return only a status word.
        app.log.error({ err: error }, 'health check: database unreachable');
        checks.database = 'error';
        healthy = false;
      }
    }

    reply.code(healthy ? 200 : 503);
    reply.header('cache-control', 'no-store');
    return {
      status: healthy ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      checks,
    };
  });
}
