import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function optionalBoolean(value) {
  if (value == null || value === '') {
    return undefined;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function optionalInteger(value) {
  if (value == null || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveFromRoot(value) {
  if (!value) {
    return value;
  }

  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

export function loadConfig(env = process.env) {
  const configFile = firstDefined(
    env.IMAGE_PROXY_CONFIG_FILE,
    fs.existsSync(path.resolve(projectRoot, 'config.json')) ? path.resolve(projectRoot, 'config.json') : undefined,
  );
  const fileConfig = readJsonIfExists(configFile);

  const storageDir = resolveFromRoot(firstDefined(env.IMAGE_PROXY_STORAGE_DIR, fileConfig.storageDir, './storage'));

  return {
    port: optionalInteger(env.PORT) ?? fileConfig.port ?? 3000,
    openaiApiKey: firstDefined(env.OPENAI_API_KEY, fileConfig.openaiApiKey, ''),
    openaiBaseUrl: String(firstDefined(env.OPENAI_BASE_URL, fileConfig.openaiBaseUrl, 'https://api.openai.com')).replace(/\/+$/, ''),
    organization: firstDefined(env.OPENAI_ORG_ID, fileConfig.organization),
    project: firstDefined(env.OPENAI_PROJECT_ID, fileConfig.project),
    requireApproval: optionalBoolean(env.IMAGE_PROXY_REQUIRE_APPROVAL) ?? Boolean(fileConfig.requireApproval),
    approvalHoldMs: optionalInteger(env.IMAGE_PROXY_APPROVAL_HOLD_MS) ?? fileConfig.approvalHoldMs ?? 300000,
    storageDir,
    generatedDir: resolveFromRoot(firstDefined(env.IMAGE_PROXY_GENERATED_DIR, fileConfig.generatedDir, path.join(storageDir, 'generated'))),
    thumbnailDir: resolveFromRoot(firstDefined(env.IMAGE_PROXY_THUMBNAIL_DIR, fileConfig.thumbnailDir, path.join(storageDir, 'thumbnails'))),
    inputDir: resolveFromRoot(firstDefined(env.IMAGE_PROXY_INPUT_DIR, fileConfig.inputDir, path.join(storageDir, 'inputs'))),
    dataFile: resolveFromRoot(firstDefined(env.IMAGE_PROXY_DATA_FILE, fileConfig.dataFile, path.join(storageDir, 'data', 'history.json'))),
    thumbnailWidth: optionalInteger(env.IMAGE_PROXY_THUMBNAIL_WIDTH) ?? fileConfig.thumbnailWidth ?? 384,
    adminToken: firstDefined(env.IMAGE_PROXY_ADMIN_TOKEN, fileConfig.adminToken, ''),
  };
}
