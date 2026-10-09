#!/usr/bin/env node
'use strict';

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, '..', '..', 'data', 'music', 'catalog.json');

function generateReport(catalog) {
  const total = catalog.tracks.length;

  let playable = 0;
  let needsReview = 0;
  let externalOnly = 0;
  let unavailable = 0;

  const providerStats = {};
  const statusStats = {};

  catalog.tracks.forEach(track => {
    if (!track.matches || track.matches.length === 0) {
      unavailable++;
      return;
    }

    const bestMatch = track.bestMatch >= 0 ? track.matches[track.bestMatch] : track.matches[0];
    const status = bestMatch.status;

    statusStats[status] = (statusStats[status] || 0) + 1;
    providerStats[bestMatch.provider] = (providerStats[bestMatch.provider] || 0) + 1;

    if (status === 'playable' && track.bestMatch >= 0) {
      playable++;
    } else if (status === 'needs-review') {
      needsReview++;
    } else if (status === 'external-only') {
      externalOnly++;
    } else {
      unavailable++;
    }
  });

  console.log('\n=== Music Catalog Report ===\n');
  console.log(`Generated: ${new Date(catalog.generatedAt).toLocaleString()}`);
  console.log(`Version: ${catalog.version}`);
  console.log();

  console.log('--- Track Status ---');
  console.log(`Total tracks:          ${total}`);
  console.log(`Playable:              ${playable} (${(playable / total * 100).toFixed(1)}%)`);
  console.log(`Needs review:          ${needsReview} (${(needsReview / total * 100).toFixed(1)}%)`);
  console.log(`External only:         ${externalOnly} (${(externalOnly / total * 100).toFixed(1)}%)`);
  console.log(`Unavailable:           ${unavailable} (${(unavailable / total * 100).toFixed(1)}%)`);
  console.log();

  console.log('--- Provider Distribution ---');
  Object.entries(providerStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([provider, count]) => {
      console.log(`${provider.padEnd(20)} ${count} (${(count / total * 100).toFixed(1)}%)`);
    });
  console.log();

  console.log('--- Status Breakdown ---');
  Object.entries(statusStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      console.log(`${status.padEnd(20)} ${count}`);
    });
  console.log();

  if (needsReview > 0) {
    console.log('--- Tracks Needing Review ---');
    catalog.tracks
      .filter(t => t.matches.length > 0 && t.matches[0].status === 'needs-review')
      .slice(0, 10)
      .forEach(track => {
        const match = track.matches[0];
        console.log(`${track.title} - ${track.artist}`);
        console.log(`  Provider: ${match.provider}, Confidence: ${match.confidence.toFixed(2)}`);
        console.log(`  URL: ${match.sourceUrl}`);
      });
    if (needsReview > 10) {
      console.log(`  ... and ${needsReview - 10} more`);
    }
    console.log();
  }

  if (unavailable > 0) {
    console.log('--- Unavailable Tracks (first 10) ---');
    catalog.tracks
      .filter(t => !t.matches || t.matches.length === 0)
      .slice(0, 10)
      .forEach(track => {
        console.log(`${track.title} - ${track.artist}`);
        if (track.sourceUrl) {
          console.log(`  Original: ${track.sourceUrl}`);
        }
      });
    if (unavailable > 10) {
      console.log(`  ... and ${unavailable - 10} more`);
    }
    console.log();
  }

  console.log('=== Recommendations ===\n');

  if (playable >= total * 0.8) {
    console.log('✓ Good coverage! Most tracks are playable.');
  } else if (playable >= total * 0.5) {
    console.log('○ Moderate coverage. Consider additional providers or manual curation.');
  } else {
    console.log('✗ Low coverage. Many tracks need alternative sources or different matching strategy.');
  }

  if (needsReview > 0) {
    console.log(`\n${needsReview} tracks need manual review due to low confidence.`);
    console.log('Review and adjust matches in data/music/catalog.json if needed.');
  }

  if (unavailable > total * 0.2) {
    console.log(`\n${unavailable} tracks have no matches. Consider:`);
    console.log('  - Adding more providers');
    console.log('  - Improving metadata quality');
    console.log('  - Manually finding alternative sources');
  }
}

async function main() {
  try {
    const content = await readFile(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(content);
    generateReport(catalog);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`\nCatalog not found: ${CATALOG_PATH}`);
      console.error('Run sync first: npm run sync');
      process.exit(1);
    }
    console.error('\nFailed to read catalog:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Report generation failed:', error.message);
  process.exit(1);
});
