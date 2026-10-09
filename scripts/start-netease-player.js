#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const npmBin = isWindows ? 'npm.cmd' : 'npm';

const config = {
  apiDir: process.env.NETEASE_API_DIR || path.join(os.tmpdir(), 'NeteaseCloudMusicApi'),
  apiRepo: process.env.NETEASE_API_REPO || 'https://github.com/Binaryify/NeteaseCloudMusicApi.git',
  apiPort: Number(process.env.NETEASE_API_PORT || 3000),
  proxyPort: Number(process.env.NETEASE_PROXY_PORT || process.env.PORT || 4188),
  proxyHost: process.env.NETEASE_PROXY_HOST || '127.0.0.1',
  cookieFile: process.env.NETEASE_COOKIE_FILE || path.join(repoRoot, 'float-player', 'netease-proxy', '.netease-session.json'),
  adminUrl: process.env.FLOAT_PLAYER_ADMIN_URL || 'https://blog-go3.pages.dev/admin/'
};

const children = [];

function log(message) {
  console.log(`[netease-player] ${message}`);
}

function fail(message) {
  console.error(`[netease-player] ${message}`);
  process.exitCode = 1;
}

function hasCommand(command, args) {
  const result = spawnSync(command, args || ['--version'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function run(command, args, options) {
  const result = spawnSync(command, args, Object.assign({
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
  }, options || {}));
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

function requestJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs || 1200 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 500) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function waitFor(url, label, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await requestJson(url, 1500);
      return true;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`${label} did not become ready: ${url}`);
}

async function isReady(url) {
  try {
    await requestJson(url, 800);
    return true;
  } catch (error) {
    return false;
  }
}

function pipe(child, label) {
  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      process.stdout.write(`[${label}] ${chunk}`);
    });
  }
  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      process.stderr.write(`[${label}] ${chunk}`);
    });
  }
}

function spawnProcess(label, command, args, options) {
  const child = spawn(command, args, Object.assign({
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  }, options || {}));
  children.push(child);
  pipe(child, label);
  child.on('exit', (code) => {
    if (code && process.exitCode == null) {
      process.exitCode = code;
      console.error(`[${label}] exited with code ${code}`);
    }
  });
  return child;
}

function ensureApiSource() {
  if (fs.existsSync(path.join(config.apiDir, 'package.json'))) {
    log(`NeteaseCloudMusicApi found: ${config.apiDir}`);
    return;
  }
  if (!hasCommand('git')) {
    throw new Error('Git is required to clone NeteaseCloudMusicApi.');
  }
  fs.mkdirSync(path.dirname(config.apiDir), { recursive: true });
  log(`Cloning NeteaseCloudMusicApi into ${config.apiDir}`);
  run('git', ['clone', config.apiRepo, config.apiDir]);
}

function ensureApiDeps() {
  if (fs.existsSync(path.join(config.apiDir, 'node_modules'))) {
    log('NeteaseCloudMusicApi dependencies already installed.');
    return;
  }
  if (!hasCommand(npmBin)) {
    throw new Error('npm is required to install NeteaseCloudMusicApi dependencies.');
  }
  log('Installing NeteaseCloudMusicApi dependencies. This may take a few minutes.');
  run(npmBin, ['install'], { cwd: config.apiDir });
}

function startApi() {
  const appFile = path.join(config.apiDir, 'app.js');
  const args = fs.existsSync(appFile) ? [appFile] : ['start'];
  const command = fs.existsSync(appFile) ? process.execPath : npmBin;
  return spawnProcess('ncm-api', command, args, {
    cwd: config.apiDir,
    env: Object.assign({}, process.env, {
      PORT: String(config.apiPort)
    })
  });
}

function startProxy() {
  return spawnProcess('netease-proxy', process.execPath, [
    path.join(repoRoot, 'float-player', 'netease-proxy', 'server.js')
  ], {
    cwd: repoRoot,
    env: Object.assign({}, process.env, {
      HOST: config.proxyHost,
      PORT: String(config.proxyPort),
      NETEASE_API_BASE: `http://127.0.0.1:${config.apiPort}`,
      NETEASE_COOKIE_FILE: config.cookieFile
    })
  });
}

function openUrl(url) {
  try {
    if (isWindows) {
      spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (error) {
    log(`Open this URL manually: ${url}`);
  }
}

function shutdown() {
  log('Stopping child processes...');
  children.forEach((child) => {
    if (!child.killed) child.kill();
  });
}

process.on('SIGINT', () => {
  shutdown();
  process.exit();
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit();
});

(async function main() {
  try {
    if (!hasCommand(process.execPath, ['--version'])) {
      throw new Error('Node.js is required.');
    }

    const apiStatusUrl = `http://127.0.0.1:${config.apiPort}/login/status`;
    const proxyStatusUrl = `http://${config.proxyHost}:${config.proxyPort}/api/netease/status`;

    ensureApiSource();
    ensureApiDeps();

    if (await isReady(apiStatusUrl)) {
      log(`NeteaseCloudMusicApi is already running on ${apiStatusUrl}`);
    } else {
      log(`Starting NeteaseCloudMusicApi on port ${config.apiPort}`);
      startApi();
      await waitFor(apiStatusUrl, 'NeteaseCloudMusicApi', 30000);
    }

    if (await isReady(proxyStatusUrl)) {
      log(`Netease proxy is already running on ${proxyStatusUrl}`);
    } else {
      log(`Starting Netease proxy on port ${config.proxyPort}`);
      startProxy();
      await waitFor(proxyStatusUrl, 'Netease proxy', 15000);
    }

    log('All services are ready.');
    log(`Admin page: ${config.adminUrl}`);
    log('Keep this terminal open. Press Ctrl+C to stop services started by this script.');
    openUrl(config.adminUrl);
  } catch (error) {
    fail(error.message || error);
    shutdown();
  }
})();
