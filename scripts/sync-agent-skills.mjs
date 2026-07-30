#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, '..');
const VENDOR_RELATIVE_PATH = 'agent-skills/vendor/agent-toolkit';
const LOCK_RELATIVE_PATH = 'agent-skills/vendor-lock.json';
const TOP_LEVEL_FILES = ['LICENSE', 'README.md'];
const JSON_LINE_WIDTH = 100;

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function assertRelativeFile(path, field) {
  if (!path || path.startsWith('/') || path.split(/[\\/]/).includes('..')) {
    throw new Error(`Invalid ${field}: ${path}`);
  }
}

async function loadSource(sourceDir) {
  const packageJson = JSON.parse(await readFile(join(sourceDir, 'package.json'), 'utf8'));
  const index = JSON.parse(await readFile(join(sourceDir, 'skills.index.json'), 'utf8'));
  if (!Array.isArray(index.skills) || index.skills.length === 0) {
    throw new Error('skills.index.json must contain at least one skill');
  }
  if (typeof packageJson.name !== 'string' || typeof packageJson.version !== 'string') {
    throw new Error('source package.json must contain name and version');
  }

  for (const skill of index.skills) {
    if (typeof skill.name !== 'string' || typeof skill.ref !== 'string') {
      throw new Error('every indexed skill must contain name and ref');
    }
    assertRelativeFile(skill.path, `path for ${skill.ref}`);
    if (skill.brief != null) assertRelativeFile(skill.brief, `brief for ${skill.ref}`);
    await access(join(sourceDir, skill.path), constants.R_OK);
    if (skill.brief) await access(join(sourceDir, skill.brief), constants.R_OK);
  }

  return { packageJson, index };
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, fullPath)));
    else if (entry.isFile()) files.push(relative(root, fullPath).split(sep).join('/'));
  }
  return files;
}

async function hashTree(root) {
  const hash = createHash('sha256');
  for (const file of await listFiles(root)) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(join(root, file)));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function formatJsonValue(value, level = 0, prefixLength = 0) {
  const indent = '  '.repeat(level);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const primitives = value.every((item) => item === null || typeof item !== 'object');
    const inline = primitives ? `[${value.map((item) => JSON.stringify(item)).join(', ')}]` : '';
    if (primitives && prefixLength + inline.length <= JSON_LINE_WIDTH) return inline;
    return `[\n${value
      .map((item) => `${'  '.repeat(level + 1)}${formatJsonValue(item, level + 1)}`)
      .join(',\n')}\n${indent}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  return `{\n${entries
    .map(([key, item]) => {
      const itemIndent = '  '.repeat(level + 1);
      const prefix = `${itemIndent}${JSON.stringify(key)}: `;
      return `${prefix}${formatJsonValue(item, level + 1, prefix.length)}`;
    })
    .join(',\n')}\n${indent}}`;
}

function formatJson(value) {
  return `${formatJsonValue(value)}\n`;
}

async function copySourceProjection(sourceDir, destination, index, packageJson) {
  await mkdir(destination, { recursive: true });
  for (const file of TOP_LEVEL_FILES) {
    const source = join(sourceDir, file);
    if (await exists(source)) await cp(source, join(destination, file));
  }

  for (const skill of index.skills) {
    const skillDirectory = dirname(skill.path);
    await cp(join(sourceDir, skillDirectory), join(destination, skillDirectory), {
      recursive: true,
      force: true,
    });
  }
  await writeFile(join(destination, 'package.json'), formatJson(packageJson), 'utf8');
  await writeFile(join(destination, 'skills.index.json'), formatJson(index), 'utf8');
}

async function createProjection(sourceDir, destination) {
  const { packageJson, index } = await loadSource(sourceDir);
  await copySourceProjection(sourceDir, destination, index, packageJson);
  const contentHash = await hashTree(destination);
  const skills = [];
  for (const skill of index.skills) {
    skills.push({
      name: skill.name,
      ref: skill.ref,
      hash: await hashTree(join(destination, dirname(skill.path))),
    });
  }
  return {
    version: 1,
    source: { package: packageJson.name, version: packageJson.version },
    contentHash,
    skills,
  };
}

export async function syncAgentSkills({ repoRoot = DEFAULT_REPO_ROOT, sourceDir }) {
  if (!sourceDir) throw new Error('A source directory is required for sync');
  const resolvedSource = resolve(sourceDir);
  const vendorPath = resolve(repoRoot, VENDOR_RELATIVE_PATH);
  const lockPath = resolve(repoRoot, LOCK_RELATIVE_PATH);
  const vendorParent = dirname(vendorPath);
  await mkdir(vendorParent, { recursive: true });
  const staging = await mkdtemp(join(vendorParent, '.agent-toolkit-staging-'));
  const lockTemp = `${lockPath}.tmp-${process.pid}-${Date.now()}`;
  const vendorBackup = `${vendorPath}.backup-${process.pid}-${Date.now()}`;
  const hadVendor = await exists(vendorPath);

  try {
    const manifest = await createProjection(resolvedSource, staging);
    await writeFile(lockTemp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    if (hadVendor) await rename(vendorPath, vendorBackup);
    try {
      await rename(staging, vendorPath);
      await rename(lockTemp, lockPath);
      await rm(vendorBackup, { recursive: true, force: true }).catch(() => undefined);
      return manifest;
    } catch (error) {
      await rm(vendorPath, { recursive: true, force: true });
      if (hadVendor && (await exists(vendorBackup))) await rename(vendorBackup, vendorPath);
      throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    await rm(lockTemp, { force: true }).catch(() => undefined);
    await rm(vendorBackup, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function checkAgentSkills({ repoRoot = DEFAULT_REPO_ROOT, sourceDir } = {}) {
  const vendorPath = resolve(repoRoot, VENDOR_RELATIVE_PATH);
  const lockPath = resolve(repoRoot, LOCK_RELATIVE_PATH);
  const errors = [];
  let manifest;
  try {
    manifest = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch (error) {
    return { ok: false, errors: [`cannot read vendor lock: ${error.message}`] };
  }

  if (!(await exists(vendorPath)))
    return { ok: false, errors: ['vendored skills directory is missing'] };
  const vendorHash = await hashTree(vendorPath);
  if (vendorHash !== manifest.contentHash) {
    errors.push(`vendored content hash ${vendorHash} does not match lock ${manifest.contentHash}`);
  }
  try {
    const { packageJson, index } = await loadSource(vendorPath);
    const vendorIdentity = { package: packageJson.name, version: packageJson.version };
    if (JSON.stringify(vendorIdentity) !== JSON.stringify(manifest.source)) {
      errors.push('vendored package identity does not match lock');
    }
    const lockedSkills = new Map(
      Array.isArray(manifest.skills) ? manifest.skills.map((skill) => [skill.ref, skill]) : [],
    );
    const indexedRefs = index.skills.map((skill) => skill.ref);
    const lockedRefs = Array.isArray(manifest.skills)
      ? manifest.skills.map((skill) => skill.ref)
      : [];
    if (JSON.stringify(indexedRefs) !== JSON.stringify(lockedRefs)) {
      errors.push('vendored skill index does not match lock order');
    }
    for (const skill of index.skills) {
      const actualHash = await hashTree(join(vendorPath, dirname(skill.path)));
      const lockedHash = lockedSkills.get(skill.ref)?.hash;
      if (actualHash !== lockedHash) {
        errors.push(`skill hash for ${skill.ref} ${actualHash} does not match lock ${lockedHash}`);
      }
    }
  } catch (error) {
    errors.push(`vendored package is invalid: ${error.message}`);
  }

  if (sourceDir) {
    const comparisonRoot = await mkdtemp(join(dirname(vendorPath), '.agent-toolkit-check-'));
    try {
      const sourceManifest = await createProjection(resolve(sourceDir), comparisonRoot);
      if (sourceManifest.contentHash !== manifest.contentHash) {
        errors.push(
          `source content hash ${sourceManifest.contentHash} does not match lock ${manifest.contentHash}`,
        );
      }
      if (JSON.stringify(sourceManifest.source) !== JSON.stringify(manifest.source)) {
        errors.push('source package identity does not match lock');
      }
    } finally {
      await rm(comparisonRoot, { recursive: true, force: true });
    }
  }

  return { ok: errors.length === 0, errors };
}

function parseArgs(argv) {
  const parsed = { check: false, repoRoot: DEFAULT_REPO_ROOT, sourceDir: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') parsed.check = true;
    else if (arg === '--source') parsed.sourceDir = argv[++index];
    else if (arg === '--repo-root') parsed.repoRoot = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  parsed.sourceDir ??= process.env.AGENT_TOOLKIT_SKILLS_DIR;
  return parsed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.check) {
    const result = await checkAgentSkills(options);
    if (!result.ok) {
      for (const error of result.errors) console.error(`skill sync drift: ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log('agent skills vendor matches lock');
    return;
  }

  if (!options.sourceDir) {
    throw new Error('Pass --source <packages/agent-skills> or set AGENT_TOOLKIT_SKILLS_DIR');
  }
  const manifest = await syncAgentSkills(options);
  console.log(`synced ${manifest.skills.length} skills (${manifest.contentHash})`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
