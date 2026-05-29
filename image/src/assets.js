import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const EXTENSION_BY_TYPE = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

function safePart(value, fallback) {
  const normalized = String(value || fallback).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

export function sniffImageType(buffer, fallbackType = 'application/octet-stream') {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.subarray(0, 6).toString('ascii').startsWith('GIF')) {
    return 'image/gif';
  }
  return fallbackType;
}

export function extensionForType(contentType, fallback = '.bin') {
  const mediaType = String(contentType || '').split(';')[0].trim().toLowerCase();
  return EXTENSION_BY_TYPE.get(mediaType) ?? fallback;
}

export function dataUrlToBuffer(value) {
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s.exec(String(value || ''));
  if (!match) {
    return null;
  }

  return {
    contentType: match[1] || 'application/octet-stream',
    buffer: Buffer.from(match[2], 'base64'),
  };
}

export async function ensureStorage(config) {
  await Promise.all([
    fs.mkdir(config.generatedDir, { recursive: true }),
    fs.mkdir(config.thumbnailDir, { recursive: true }),
    fs.mkdir(config.inputDir, { recursive: true }),
  ]);
}

export async function saveInputFile({ config, requestId, fieldName, filename, contentType, buffer }) {
  await fs.mkdir(config.inputDir, { recursive: true });
  const baseName = safePart(path.basename(filename || fieldName || 'input'), 'input');
  const ext = path.extname(baseName) || extensionForType(contentType);
  const fileName = `${requestId}-${crypto.randomUUID()}-${safePart(fieldName, 'file')}${ext}`;
  const filePath = path.join(config.inputDir, fileName);
  await fs.writeFile(filePath, buffer);

  return {
    id: crypto.randomUUID(),
    fieldName,
    originalName: filename || null,
    contentType: contentType || 'application/octet-stream',
    bytes: buffer.length,
    path: filePath,
    url: `/admin/assets/${requestId}/inputs/${fileName}`,
    role: inferInputRole(fieldName),
  };
}

export async function saveGeneratedImage({ config, requestId, index, buffer, contentType }) {
  await Promise.all([
    fs.mkdir(config.generatedDir, { recursive: true }),
    fs.mkdir(config.thumbnailDir, { recursive: true }),
  ]);

  const sniffedType = sniffImageType(buffer, contentType);
  const ext = extensionForType(sniffedType);
  const fileName = `${requestId}-${String(index).padStart(3, '0')}${ext}`;
  const imagePath = path.join(config.generatedDir, fileName);
  await fs.writeFile(imagePath, buffer);

  const thumbFileName = `${requestId}-${String(index).padStart(3, '0')}.webp`;
  const thumbPath = path.join(config.thumbnailDir, thumbFileName);
  await sharp(buffer)
    .rotate()
    .resize({ width: config.thumbnailWidth, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(thumbPath);

  return {
    index,
    contentType: sniffedType,
    bytes: buffer.length,
    path: imagePath,
    url: `/admin/assets/${requestId}/generated/${fileName}`,
    thumbnail: {
      contentType: 'image/webp',
      path: thumbPath,
      url: `/admin/assets/${requestId}/thumbnails/${thumbFileName}`,
    },
  };
}

export async function saveGeneratedImagesFromResponse({ config, requestId, responseJson }) {
  const outputs = [];
  const items = Array.isArray(responseJson?.data) ? responseJson.data : [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    let buffer = null;
    let contentType = 'application/octet-stream';

    if (typeof item?.b64_json === 'string') {
      buffer = Buffer.from(item.b64_json, 'base64');
      contentType = sniffImageType(buffer);
    } else if (typeof item?.url === 'string') {
      const imageResponse = await fetch(item.url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download generated image ${index}: ${imageResponse.status}`);
      }
      buffer = Buffer.from(await imageResponse.arrayBuffer());
      contentType = imageResponse.headers.get('content-type') || sniffImageType(buffer);
    }

    if (buffer?.length) {
      outputs.push(await saveGeneratedImage({ config, requestId, index, buffer, contentType }));
    }
  }

  return outputs;
}

export async function saveGeneratedImagesFromSse({ config, requestId, sseText }) {
  const events = parseSseJsonEvents(sseText);
  const completed = events.filter((event) => (
    event?.b64_json
    && ['image_generation.completed', 'image_edit.completed'].includes(event.type)
  ));
  const fallback = completed.length > 0
    ? completed
    : events.filter((event) => event?.b64_json && !String(event.type || '').includes('partial_image')).slice(-1);
  const outputs = [];

  for (let index = 0; index < fallback.length; index += 1) {
    const event = fallback[index];
    const buffer = Buffer.from(event.b64_json, 'base64');
    if (buffer.length) {
      outputs.push(await saveGeneratedImage({
        config,
        requestId,
        index,
        buffer,
        contentType: event.output_format ? `image/${event.output_format}` : undefined,
      }));
    }
  }

  return outputs;
}

export function inferInputRole(fieldName) {
  const normalized = String(fieldName || '').toLowerCase();
  if (['mask', 'structure', 'structure_image', 'control_image', 'depth_image', 'layout_image'].some((name) => normalized.includes(name))) {
    return 'structure';
  }
  if (['image', 'reference', 'reference_image', 'input_image'].some((name) => normalized.includes(name))) {
    return 'reference';
  }
  return 'file';
}

function parseSseJsonEvents(sseText) {
  const events = [];
  for (const block of String(sseText || '').split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart())
      .join('\n')
      .trim();

    if (!data || data === '[DONE]') {
      continue;
    }

    try {
      events.push(JSON.parse(data));
    } catch {
      // Non-JSON SSE data is not expected for image events, but should not break proxying.
    }
  }

  return events;
}
