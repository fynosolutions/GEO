import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { setGlobalProxyFromEnv } from 'node:http';

// Load before audit.ts resolves its data directory.
if (existsSync(resolve('.env'))) process.loadEnvFile(resolve('.env'));

// Node fetch does not automatically use the Windows Internet Settings proxy.
// Prefer explicit .env/process proxy settings; fall back to the user's enabled proxy.
if (!process.env.HTTPS_PROXY && !process.env.https_proxy && process.platform === 'win32') {
  try {
    const settings = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "$p=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; @{enabled=$p.ProxyEnable;server=$p.ProxyServer}|ConvertTo-Json -Compress"],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }));
    if (settings.enabled === 1 && typeof settings.server === 'string') {
      const server = settings.server.includes('=') ? settings.server.split(';').find((s: string) => s.startsWith('https='))?.slice(6) : settings.server;
      if (server) process.env.HTTPS_PROXY = server.includes('://') ? server : `http://${server}`;
    }
  } catch { /* Explicit .env proxy configuration remains available. */ }
}
if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
  if (!process.env.NO_PROXY && !process.env.no_proxy) process.env.NO_PROXY = 'localhost,127.0.0.1,::1';
  setGlobalProxyFromEnv();
}
