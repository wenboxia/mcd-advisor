// Loads secrets from ~/.config/mcd-advisor/.env (outside the repo) without overriding real env vars.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const ENV_FILE = process.env.MCD_ADVISOR_ENV || join(homedir(), '.config', 'mcd-advisor', '.env');

// One parser for both loading and secret scanning: optional "export ", matching quotes stripped.
export function parseEnvFile(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const q = m[2].match(/^(['"])(.*)\1$/);
    out[m[1]] = q ? q[2] : m[2];
  }
  return out;
}

export function loadEnv() {
  if (!existsSync(ENV_FILE)) return;
  for (const [k, v] of Object.entries(parseEnvFile(readFileSync(ENV_FILE, 'utf8')))) if (!(k in process.env)) process.env[k] = v;
}
