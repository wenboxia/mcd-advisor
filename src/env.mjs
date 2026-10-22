// Loads secrets from ~/.config/mcd-advisor/.env (outside the repo) without overriding real env vars.
// WorkBuddy users usually configured the McDonald's connector already; its token is reused (read-only).
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const ENV_FILE = process.env.MCD_ADVISOR_ENV || join(homedir(), '.config', 'mcd-advisor', '.env');
export const WORKBUDDY_MCP = join(homedir(), '.workbuddy', 'mcp.json');
const MCD_URL = 'https://mcp.mcd.cn';

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

// Token of the one WorkBuddy connector pointing at the official server; placeholders, several
// matches or an unreadable file all count as "none" (never printed, never written).
export function workbuddyToken(file = WORKBUDDY_MCP) {
  try {
    const servers = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')).mcpServers || {};
    const hits = Object.values(servers).filter((s) => typeof s?.url === 'string' && s.url.trim().replace(/\/+$/, '') === MCD_URL);
    if (hits.length !== 1) return null;
    const auth = Object.entries(hits[0].headers || {}).find(([k]) => k.toLowerCase() === 'authorization')?.[1];
    return (typeof auth === 'string' && auth.trim().match(/^Bearer\s+([A-Za-z0-9._~+/=-]{8,})$/)?.[1]) || null;
  } catch {
    return null;
  }
}

export function loadEnv({ envFile = ENV_FILE, workbuddyFile = WORKBUDDY_MCP } = {}) {
  if (existsSync(envFile)) {
    for (const [k, v] of Object.entries(parseEnvFile(readFileSync(envFile, 'utf8')))) if (!(k in process.env)) process.env[k] = v;
  }
  if (!process.env.MCD_MCP_TOKEN) {
    const token = workbuddyToken(workbuddyFile);
    if (token) process.env.MCD_MCP_TOKEN = token;
  }
}
