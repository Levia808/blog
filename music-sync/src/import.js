#!/usr/bin/env node
'use strict';

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const RAW_DIR = join(PROJECT_ROOT, '..', 'data', 'music', 'raw');

function parseArgs(argv) {
  const args = { file: null, playlistId: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) {
      args.file = argv[++i];
    } else if (argv[i] === '--playlist-id' && argv[i + 1]) {
      args.playlistId = argv[++i];
    } else if (argv[i] === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

function normalizeTrack(raw) {
  const title = String(raw.title || raw.name || '').trim();
  const artist = String(raw.artist || raw.artists || raw.author || '').trim();

  if (!title || !artist) {
    throw new Error(`Track missing required fields: title="${title}" artist="${artist}"`);
  }

  let duration = 0;
  if (raw.duration != null) {
    const d = Number(raw.duration);
    duration = d > 1000 ? Math.floor(d / 1000) : d;
  } else if (raw.durationMs != null) {
    duration = Math.floor(Number(raw.durationMs) / 1000);
  }

  return {
    title,
    artist,
    album: String(raw.album || '').trim() || null,
    duration: duration > 0 ? duration : null,
    cover: String(raw.cover || raw.coverUrl || raw.picUrl || '').trim() || null,
    originalSource: 'netease',
    originalId: String(raw.id || raw.songId || raw.source_id || '').trim() || null,
    sourceUrl: String(raw.source_url || raw.sourceUrl || raw.url || '').trim() || null,
    isrc: String(raw.isrc || '').trim() || null,
    importedAt: new Date().toISOString()
  };
}

async function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error('CSV must have at least header and one data row.');

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const titleIdx = headers.indexOf('title');
  const artistIdx = headers.indexOf('artist');

  if (titleIdx === -1 || artistIdx === -1) {
    throw new Error('CSV must have "title" and "artist" columns.');
  }

  const tracks = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const raw = {};
    headers.forEach((header, idx) => {
      raw[header] = values[idx] || '';
    });
    try {
      tracks.push(normalizeTrack(raw));
    } catch (error) {
      console.warn(`Row ${i + 1}: ${error.message}`);
    }
  }

  return tracks;
}

async function parseJson(text) {
  const data = JSON.parse(text);

  if (Array.isArray(data)) {
    return data.map(normalizeTrack);
  }

  if (data.tracks && Array.isArray(data.tracks)) {
    return data.tracks.map(normalizeTrack);
  }

  throw new Error('JSON must be an array or have a "tracks" array property.');
}

async function importFromFile(filePath) {
  console.log(`Reading file: ${filePath}`);
  const content = await readFile(filePath, 'utf8');
  const ext = extname(filePath).toLowerCase();

  let tracks;
  if (ext === '.csv') {
    tracks = await parseCsv(content);
  } else if (ext === '.json') {
    tracks = await parseJson(content);
  } else {
    throw new Error(`Unsupported file format: ${ext}. Use .csv or .json`);
  }

  console.log(`Parsed ${tracks.length} tracks.`);
  return tracks;
}

async function saveRawPlaylist(tracks, outputId, dryRun) {
  const playlist = {
    id: outputId,
    name: `Imported Playlist ${outputId}`,
    importedAt: new Date().toISOString(),
    trackCount: tracks.length,
    tracks
  };

  const outputPath = join(RAW_DIR, `playlist-${outputId}.json`);

  if (dryRun) {
    console.log('\n[DRY RUN] Would save to:', outputPath);
    console.log('Sample tracks:');
    tracks.slice(0, 3).forEach((track, i) => {
      console.log(`  ${i + 1}. ${track.title} - ${track.artist}`);
    });
    return;
  }

  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(outputPath, JSON.stringify(playlist, null, 2), 'utf8');
  console.log(`\nSaved ${tracks.length} tracks to: ${outputPath}`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.file && !args.playlistId) {
    console.error('Usage: npm run import -- --file <path> [--dry-run]');
    console.error('   or: npm run import -- --playlist-id <id> [--dry-run]');
    console.error('\nExample:');
    console.error('  npm run import -- --file playlist.csv');
    console.error('  npm run import -- --file playlist.json --dry-run');
    process.exit(1);
  }

  let tracks;
  let outputId;

  if (args.file) {
    tracks = await importFromFile(args.file);
    outputId = Date.now().toString();
  } else if (args.playlistId) {
    console.error('Error: --playlist-id not implemented yet.');
    console.error('Please export your NetEase playlist manually and use --file instead.');
    console.error('\nRecommended: Visit your playlist, export as CSV/JSON, then:');
    console.error('  npm run import -- --file your-playlist.csv');
    process.exit(1);
  }

  await saveRawPlaylist(tracks, outputId, args.dryRun);

  if (!args.dryRun) {
    console.log('\nNext step: Run sync to match tracks with free sources:');
    console.log('  npm run sync');
  }
}

main().catch(error => {
  console.error('Import failed:', error.message);
  process.exit(1);
});
