#!/usr/bin/env node
'use strict';

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, '..', '..', 'data', 'music', 'catalog.json');

async function fetchWithTimeout(url, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    });
    clearTimeout(timer);
    return response.ok;
  } catch (error) {
    clearTimeout(timer);
    return false;
  }
}

async function validateSchema(catalog) {
  const errors = [];

  if (!catalog || typeof catalog !== 'object') {
    errors.push('Catalog must be an object');
    return errors;
  }

  if (catalog.version !== 1) {
    errors.push(`Invalid version: ${catalog.version}`);
  }

  if (!catalog.generatedAt || isNaN(Date.parse(catalog.generatedAt))) {
    errors.push('Invalid or missing generatedAt timestamp');
  }

  if (!Array.isArray(catalog.tracks)) {
    errors.push('tracks must be an array');
    return errors;
  }

  catalog.tracks.forEach((track, index) => {
    const prefix = `Track ${index + 1}`;

    if (!track.id) errors.push(`${prefix}: missing id`);
    if (!track.title) errors.push(`${prefix}: missing title`);
    if (!track.artist) errors.push(`${prefix}: missing artist`);
    if (!Array.isArray(track.matches)) {
      errors.push(`${prefix}: matches must be an array`);
    } else {
      track.matches.forEach((match, mIndex) => {
        const mPrefix = `${prefix}, match ${mIndex + 1}`;
        if (!match.provider) errors.push(`${mPrefix}: missing provider`);
        if (!match.providerTrackId) errors.push(`${mPrefix}: missing providerTrackId`);
        if (!match.status) errors.push(`${mPrefix}: missing status`);
        if (typeof match.confidence !== 'number') {
          errors.push(`${mPrefix}: confidence must be a number`);
        }
        if (!match.sourceUrl) errors.push(`${mPrefix}: missing sourceUrl`);
      });
    }
  });

  return errors;
}

async function validateUrls(catalog, sample = 5) {
  console.log(`\nValidating URLs (sampling ${sample} tracks)...`);

  const tracksWithMatches = catalog.tracks.filter(t => t.matches && t.matches.length > 0);
  const sampleTracks = tracksWithMatches.slice(0, sample);

  let checked = 0;
  let failed = 0;

  for (const track of sampleTracks) {
    const match = track.matches[0];
    if (!match.streamUrl && !match.sourceUrl) continue;

    const url = match.streamUrl || match.sourceUrl;
    console.log(`  Checking: ${url.substring(0, 60)}...`);

    checked++;
    const ok = await fetchWithTimeout(url);
    if (!ok) {
      failed++;
      console.log(`    ✗ Failed`);
    } else {
      console.log(`    ✓ OK`);
    }
  }

  return { checked, failed };
}

async function validate() {
  console.log('Reading catalog...');

  let catalog;
  try {
    const content = await readFile(CATALOG_PATH, 'utf8');
    catalog = JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`\nCatalog not found: ${CATALOG_PATH}`);
      console.error('Run sync first: npm run sync');
      process.exit(1);
    }
    console.error('\nFailed to parse catalog JSON:', error.message);
    process.exit(1);
  }

  console.log('Validating schema...');
  const schemaErrors = await validateSchema(catalog);

  if (schemaErrors.length > 0) {
    console.error('\n✗ Schema validation failed:');
    schemaErrors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log('✓ Schema valid');

  const urlResults = await validateUrls(catalog);

  console.log('\n=== Validation Summary ===');
  console.log(`Schema: ✓ Valid`);
  console.log(`URLs checked: ${urlResults.checked}`);
  console.log(`URLs failed: ${urlResults.failed}`);

  if (urlResults.failed > 0) {
    console.warn('\nWarning: Some URLs are not accessible.');
    console.warn('This may be due to rate limiting or temporary failures.');
    console.warn('Re-run validation or check manually.');
  } else {
    console.log('\n✓ All checks passed');
  }
}

validate().catch(error => {
  console.error('Validation failed:', error.message);
  process.exit(1);
});
