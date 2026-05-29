import express from 'express';
import { ensureStorage } from './assets.js';
import { createAdminRouter, toAdminView } from './admin.js';
import { isImageEndpoint, createImageProxyHandler } from './openaiProxy.js';
import { JsonStore } from './store.js';
import { ApprovalWaiters } from './waiters.js';

export async function createApp(config) {
  await ensureStorage(config);
  const store = new JsonStore(config.dataFile);
  await store.init();
  const waiters = new ApprovalWaiters();
  const app = express();

  app.disable('x-powered-by');
  app.use('/admin', express.json({ limit: '1mb' }));

  const imageProxyHandler = createImageProxyHandler({ config, store, waiters });
  app.post(['/v1/images/generations', '/v1/images/edits', '/v1/images/variations'], imageProxyHandler);

  app.get('/v1/images/requests/:id', (req, res) => {
    const record = store.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: { message: 'Image request not found.' } });
    }

    if (record.status === 'approved' || record.status === 'completed') {
      return res.json({
        id: record.id,
        status: record.status,
        result: record.upstream?.responseBody ?? null,
        history: toAdminView(record),
      });
    }

    if (record.status === 'rejected') {
      return res.status(403).json({
        id: record.id,
        status: record.status,
        error: { message: 'Image generation was rejected by an administrator.' },
      });
    }

    return res.status(202).json({
      id: record.id,
      status: record.status,
      history: toAdminView(record),
    });
  });

  app.use('/admin', createAdminRouter({ config, store, waiters }));

  app.use((req, res, next) => {
    if (req.method === 'POST' && isImageEndpoint(req.path)) {
      return next();
    }
    return res.status(404).json({ error: { message: 'Not found.' } });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    const status = error.statusCode || 500;
    return res.status(status).json({
      error: {
        message: error.message || 'Internal server error.',
      },
    });
  });

  app.locals.imageProxy = { config, store, waiters };
  return app;
}
