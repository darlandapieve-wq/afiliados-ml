import type { PlatformCode } from '../platforms.ts';
import type { Connector } from './types.ts';
import { telegram } from './telegram.ts';
import { facebook, instagram } from './meta.ts';
import { tiktok } from './tiktok.ts';
import { youtube } from './youtube.ts';
import { pinterest } from './pinterest.ts';

/** Adaptadores independentes por rede. WhatsApp não tem conector: apenas assistido. */
export const CONNECTORS: Partial<Record<PlatformCode, Connector>> = {
  telegram, facebook, instagram, tiktok, youtube, pinterest,
};

export * from './types.ts';
