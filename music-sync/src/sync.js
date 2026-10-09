#!/usr/bin/env node
'use strict';

import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_ROOT = join(PROJECT_ROOT, '..', 'data', 'music');
const RAW_DIR = join(DATA_ROOT, 'raw');
const CATALOG_PATH = join(DATA_ROOT, 'catalog.json');

config({ path: join(PROJECT_ROOT, '..', '.env') });

const PROVIDERS = {
  audius: {
    name: 'Audius',
    enabled: true,
    needsAuth: false,
    search: searchAudius,
    rateLimit: 100
  },
  archive: {
    name: 'Internet Archive',
    enabled: true,
    needsAuth: false,
    search: searchArchive,
    rateLimit: 100
  },
  jamendo: {
    name: 'Jamendo',
    enabled: !!process.env.JAMENDO_CLIENT_ID,
    needsAuth: true,
    search: searchJamendo,
    rateLimit: 50
  }
};

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a, b) {
  const aLower = String(a || '').toLowerCase().trim();
  const bLower = String(b || '').toLowerCase().trim();
  if (!aLower || !bLower) return 0;
  if (aLower === bLower) return 1;
  const maxLen = Math.max(aLower.length, bLower.length);
  const dist = levenshtein(aLower, bLower);
  return Math.max(0, 1 - dist / maxLen);
}

function detectVersion(title) {
  const lower = String(title).toLowerCase();
  const patterns = [
    /\blive\b/i,
    /\bremix\b/i,
    /\bcover\b/i,
    /\bacoustic\b/i,
    /\binstrumental\b/i,
    /伴奏|翻唱|现场|演唱会/,
    /sped\s*up|slowed/i
  ];
  return patterns.some(p => p.test(lower));
}

function calculateConfidence(original, match) {
  const titleSim = similarity(original.title, match.title);
  const artistSim = similarity(original.artist, match.artist);
  const albumSim = original.album && match.album ? similarity(original.album, match.album) : 0.5;

  let durationMatch = 0.5;
  if (original.duration && match.duration) {
    const diff = Math.abs(original.duration - match.duration);
    durationMatch = diff < 5 ? 1 : Math.max(0, 1 - diff / 60);
  }

  let versionPenalty = 1;
  if (detectVersion(match.title) && !detectVersion(original.title)) {
    versionPenalty = 0.7;
  }

  const confidence = (
    titleSim * 0.4 +
    artistSim * 0.3 +
    albumSim * 0.2 +
    durationMatch * 0.1
  ) * versionPenalty;

  return Math.max(0, Math.min(1, confidence));
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

async function searchAudius(track) {
  const query = encodeURIComponent(`${track.title} ${track.artist}`);
  const url = `https://discoveryprovider.audius.co/v1/tracks/search?query=${query}&limit=5`;

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return [];

    const data = await response.json();
    const tracks = data?.data || [];

    return tracks.map(item => ({
      provider: 'audius',
      providerTrackId: String(item.id),
      title: item.title,
      artist: item.user?.name || 'Unknown',
      album: null,
      duration: item.duration || null,
      cover: item.artwork?.['480x480'] || item.artwork?.['150x150'] || null,
      playbackMode: 'direct',
      streamUrl: `https://discoveryprovider.audius.co/v1/tracks/${item.id}/stream`,
      sourceUrl: `https://audius.co/tracks/${item.id}`,
      attribution: `Licensed by ${item.user?.name || 'artist'} on Audius`,
      licenseInfo: null,
      status: 'playable'
    }));
  } catch (error) {
    console.warn(`Audius search failed for "${track.title}":`, error.message);
    return [];
  }
}

async function searchArchive(track) {
  const query = encodeURIComponent(`${track.title} ${track.artist}`);
  const searchParams = new URLSearchParams({
    q: `${track.title} ${track.artist} AND mediatype:audio AND licenseurl:*creative*`,
    fl: 'identifier,title,creator,date,format',
    rows: '5',
    output: 'json'
  });

  const url = `https://archive.org/advancedsearch.php?${searchParams}`;

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return [];

    const data = await response.json();
    const docs = data?.response?.docs || [];

    const results = [];
    for (const doc of docs) {
      const formats = Array.isArray(doc.format) ? doc.format : [];
      const hasAudio = formats.some(f => /mp3|ogg|flac/i.test(f));
      if (!hasAudio) continue;

      results.push({
        provider: 'archive',
        providerTrackId: doc.identifier,
        title: doc.title || 'Unknown',
        artist: doc.creator || 'Unknown',
        album: null,
        duration: null,
        cover: `https://archive.org/services/img/${doc.identifier}`,
        playbackMode: 'direct',
        streamUrl: null, // Will be set during validation
        sourceUrl: `https://archive.org/details/${doc.identifier}`,
        attribution: `From Internet Archive: ${doc.identifier}`,
        licenseInfo: 'Creative Commons (verify per item)',
        status: 'needs-review'
      });
    }

    return results;
  } catch (error) {
    console.warn(`Archive search failed for "${track.title}":`, error.message);
    return [];
  }
}

async function searchJamendo(track) {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) return [];

  const query = encodeURIComponent(`${track.title} ${track.artist}`);
  const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=5&namesearch=${query}`;

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return [];

    const data = await response.json();
    const tracks = data?.results || [];

    return tracks.map(item => ({
      provider: 'jamendo',
      providerTrackId: String(item.id),
      title: item.name,
      artist: item.artist_name || 'Unknown',
      album: item.album_name || null,
      duration: item.duration ? Math.floor(item.duration) : null,
      cover: item.album_image || item.image || null,
      playbackMode: 'direct',
      streamUrl: item.audio || null,
      sourceUrl: item.shareurl || `https://www.jamendo.com/track/${item.id}`,
      attribution: `${item.artist_name} on Jamendo - Non-commercial use only`,
      licenseInfo: item.license_ccurl || 'Creative Commons',
      status: 'playable'
    }));
  } catch (error) {
    console.warn(`Jamendo search failed for "${track.title}":`, error.message);
    return [];
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function matchTrack(track, enabledProviders) {
  const allMatches = [];

  for (const [key, provider] of Object.entries(PROVIDERS)) {
    if (!provider.enabled || (enabledProviders && !enabledProviders.includes(key))) {
      continue;
    }

    try {
      const results = await provider.search(track);
      allMatches.push(...results);
      await sleep(1000 / (provider.rateLimit / 60)); // Basic rate limiting
    } catch (error) {
      console.warn(`Provider ${provider.name} failed:`, error.message);
    }
  }

  const scoredMatches = allMatches.map(match => ({
    ...match,
    confidence: calculateConfidence(track, match),
    checkedAt: new Date().toISOString()
  }));

  scoredMatches.sort((a, b) => b.confidence - a.confidence);

  const highConfidence = scoredMatches.filter(m => m.confidence >= 0.85);
  const needsReview = scoredMatches.filter(m => m.confidence >= 0.70 && m.confidence < 0.85);

  needsReview.forEach(m => {
    if (m.status === 'playable') m.status = 'needs-review';
  });

  return {
    matches: scoredMatches,
    bestMatchIndex: highConfidence.length > 0 ? 0 : -1
  };
}

async function loadRawPlaylists() {
  try {
    const files = await readdir(RAW_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const playlists = [];
    for (const file of jsonFiles) {
      const content = await readFile(join(RAW_DIR, file), 'utf8');
      playlists.push(JSON.parse(content));
    }

    return playlists;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`No raw playlists found in ${RAW_DIR}`);
      console.error('Run import first: npm run import -- --file your-playlist.csv');
      process.exit(1);
    }
    throw error;
  }
}

async function sync(options = {}) {
  const { dryRun = false, force = false, provider = null } = options;

  console.log('Loading raw playlists...');
  const playlists = await loadRawPlaylists();
  const allTracks = playlists.flatMap(p => p.tracks);
  console.log(`Found ${allTracks.length} tracks from ${playlists.length} playlist(s).`);

  const enabledProviders = provider ? [provider] : null;
  console.log('\nEnabled providers:',
    Object.entries(PROVIDERS)
      .filter(([k, p]) => p.enabled && (!enabledProviders || enabledProviders.includes(k)))
      .map(([k, p]) => p.name)
      .join(', ') || 'None'
  );

  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    tracks: []
  };

  let matched = 0;
  let needsReview = 0;
  let unavailable = 0;

  for (let i = 0; i < allTracks.length; i++) {
    const track = allTracks[i];
    console.log(`\n[${i + 1}/${allTracks.length}] Matching: ${track.title} - ${track.artist}`);

    const { matches, bestMatchIndex } = await matchTrack(track, enabledProviders);

    const catalogTrack = {
      id: String(i + 1),
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      cover: track.cover || (matches[0]?.cover || null),
      originalSource: track.originalSource,
      originalId: track.originalId,
      matches: matches.slice(0, 3), // Keep top 3
      bestMatch: bestMatchIndex
    };

    catalog.tracks.push(catalogTrack);

    if (bestMatchIndex >= 0) {
      matched++;
      console.log(`  ✓ Match: ${matches[0].provider} (confidence: ${matches[0].confidence.toFixed(2)})`);
    } else if (matches.some(m => m.status === 'needs-review')) {
      needsReview++;
      console.log(`  ? Needs review: Best confidence ${matches[0]?.confidence.toFixed(2) || 0}`);
    } else {
      unavailable++;
      console.log(`  ✗ No matches found`);
    }
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would save catalog to:', CATALOG_PATH);
  } else {
    await mkdir(DATA_ROOT, { recursive: true });
    await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`\nCatalog saved to: ${CATALOG_PATH}`);

    // Also copy to static directory for Hugo
    const STATIC_MUSIC_DIR = join(PROJECT_ROOT, '..', 'static', 'data', 'music');
    const STATIC_CATALOG_PATH = join(STATIC_MUSIC_DIR, 'catalog.json');
    await mkdir(STATIC_MUSIC_DIR, { recursive: true });
    await writeFile(STATIC_CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`Static catalog saved to: ${STATIC_CATALOG_PATH}`);
  }

  console.log('\n=== Summary ===');
  console.log(`Total tracks:       ${allTracks.length}`);
  console.log(`Matched:            ${matched} (${(matched / allTracks.length * 100).toFixed(1)}%)`);
  console.log(`Needs review:       ${needsReview}`);
  console.log(`Unavailable:        ${unavailable}`);

  if (!dryRun) {
    console.log('\nNext step: Validate and build:');
    console.log('  npm run validate');
    console.log('  cd .. && hugo --minify');
  }
}

function parseArgs(argv) {
  const args = { dryRun: false, force: false, provider: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') {
      args.dryRun = true;
    } else if (argv[i] === '--force') {
      args.force = true;
    } else if (argv[i] === '--provider' && argv[i + 1]) {
      args.provider = argv[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  await sync(args);
}

main().catch(error => {
  console.error('Sync failed:', error.message);
  process.exit(1);
});
