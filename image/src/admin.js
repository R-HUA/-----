import path from 'node:path';
import express from 'express';
import { safeEqual } from './security.js';

const ASSET_KINDS = new Set(['inputs', 'generated', 'thumbnails']);

export function createAdminRouter({ config, store, waiters }) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!config.adminToken) {
      return next();
    }

    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice('Bearer '.length)
      : null;
    const token = req.headers['x-admin-token'] || bearer;
    if (safeEqual(token, config.adminToken)) {
      return next();
    }

    return res.status(401).json({ error: { message: 'Unauthorized admin request.' } });
  });

  router.get('/pending', (req, res) => {
    res.json({ data: store.pending().map(toAdminView) });
  });

  router.get('/summary', (req, res) => {
    const records = store.list();
    const byStatus = {};
    let generatedImages = 0;
    let inputFiles = 0;
    let generatedBytes = 0;
    let inputBytes = 0;

    for (const record of records) {
      byStatus[record.status] = (byStatus[record.status] || 0) + 1;
      for (const file of record.request?.inputFiles ?? []) {
        inputFiles += 1;
        inputBytes += file.bytes || 0;
      }
      for (const image of record.outputs ?? []) {
        generatedImages += 1;
        generatedBytes += image.bytes || 0;
      }
    }

    res.json({
      records: records.length,
      byStatus,
      pendingReview: byStatus.pending_review || 0,
      generatedImages,
      inputFiles,
      generatedBytes,
      inputBytes,
    });
  });

  router.get('/history', (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const limit = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : null;
    let records = store.list();
    if (status) {
      records = records.filter((record) => record.status === status);
    }
    if (Number.isFinite(limit) && limit > 0) {
      records = records.slice(0, limit);
    }
    res.json({ data: records.map(toAdminView) });
  });

  router.get('/history/:id', (req, res) => {
    const record = store.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: { message: 'History record not found.' } });
    }
    return res.json(toAdminView(record));
  });

  router.post('/approvals/:id/approve', async (req, res) => {
    const updated = await store.update(req.params.id, (record) => ({
      ...record,
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approval: {
        decision: 'approved',
        reviewer: req.headers['x-admin-user'] || null,
      },
    }));

    if (!updated) {
      return res.status(404).json({ error: { message: 'Approval record not found.' } });
    }

    waiters.notify(req.params.id, { type: 'approved' });
    return res.json(toAdminView(updated));
  });

  router.post('/approvals/:id/reject', async (req, res) => {
    const updated = await store.update(req.params.id, (record) => ({
      ...record,
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      approval: {
        decision: 'rejected',
        reviewer: req.headers['x-admin-user'] || null,
        reason: req.body?.reason || null,
      },
    }));

    if (!updated) {
      return res.status(404).json({ error: { message: 'Approval record not found.' } });
    }

    waiters.notify(req.params.id, { type: 'rejected' });
    return res.json(toAdminView(updated));
  });

  router.get('/assets/:id/:kind/:filename', (req, res) => {
    const record = store.get(req.params.id);
    if (!record || !ASSET_KINDS.has(req.params.kind)) {
      return res.status(404).end();
    }

    const asset = findAsset(record, req.params.kind, req.params.filename);
    if (!asset) {
      return res.status(404).end();
    }

    return res.sendFile(path.resolve(asset.path));
  });

  return router;
}

export function toAdminView(record) {
  const inputFiles = record.request?.inputFiles ?? [];
  const generatedImages = record.outputs ?? [];
  return {
    id: record.id,
    endpoint: record.endpoint,
    method: record.method,
    status: record.status,
    approvalRequired: record.approvalRequired,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt ?? null,
    approvedAt: record.approvedAt ?? null,
    rejectedAt: record.rejectedAt ?? null,
    prompt: record.request?.prompt ?? null,
    params: record.request?.params ?? null,
    inputFiles,
    referenceImages: inputFiles.filter((file) => file.role === 'reference'),
    structureImages: inputFiles.filter((file) => file.role === 'structure'),
    generatedImages,
    thumbnails: generatedImages.map((image) => image.thumbnail).filter(Boolean),
    upstreamStatus: record.upstream?.status ?? null,
    error: record.error ?? null,
  };
}

function findAsset(record, kind, filename) {
  if (kind === 'inputs') {
    return (record.request?.inputFiles ?? []).find((file) => path.basename(file.path) === filename);
  }

  if (kind === 'generated') {
    return (record.outputs ?? []).find((file) => path.basename(file.path) === filename);
  }

  if (kind === 'thumbnails') {
    return (record.outputs ?? [])
      .map((file) => file.thumbnail)
      .find((file) => file && path.basename(file.path) === filename);
  }

  return null;
}
