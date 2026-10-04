/**
 * PLATFORM ADAPTER REGISTRY
 * ============================================================================
 * Single lookup point so routes and the disconnect flow never import a specific
 * platform directly. Adding a platform = add one import + one map entry.
 */

import discord from './discord.js';
import gmail from './gmail.js';
import instagram from './instagram.js';
import telegram from './telegram.js';
import whatsapp from './whatsapp.js';
import type { PlatformAdapter } from './adapterTypes.js';
import type { Platform } from './types.js';

const REGISTRY: Record<Platform, PlatformAdapter> = {
  INSTAGRAM: instagram,
  WHATSAPP: whatsapp,
  GMAIL: gmail,
  DISCORD: discord,
  TELEGRAM: telegram,
};

export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = REGISTRY[platform];
  if (!adapter) throw new Error(`No adapter registered for platform: ${platform}`);
  return adapter;
}

export function allAdapters(): PlatformAdapter[] {
  return Object.values(REGISTRY);
}