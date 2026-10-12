import { supabase, uploadMedia, publicUrl } from './supabase';
import { generateBrief, type TtsBrief, type TtsFormat, type TtsGoal } from '../../supabase/functions/_shared/tts.ts';

export const PIPPIT_URL = 'https://pippit.capcut.com';

export interface Creative {
  id: string; product_name: string; product_url: string | null; image_path: string | null; notes: string | null;
  format: TtsFormat; goal: TtsGoal; duration_s: number; brief: TtsBrief | null; brief_source: 'template' | 'ai' | null;
  status: string; scheduled_for: string | null; video_path: string | null; video_url: string | null;
  publish_route: 'pippit' | 'api' | 'app' | null; published_at: string | null; post_url: string | null;
  anchor_deadline: string | null; anchor_added_at: string | null;
  tt_account_id: string | null; tt_publish_id: string | null; tt_state: string | null; tt_privacy: string | null; tt_error: string | null; tt_request_sent_at: string | null;
  created_at: string; updated_at: string;
}

export function imageOf(c: Pick<Creative, 'image_path'>): string | null {
  return c.image_path ? publicUrl(c.image_path) : null;
}

export function templateBrief(c: Pick<Creative, 'id' | 'product_name' | 'product_url' | 'notes' | 'format' | 'goal' | 'duration_s' | 'image_path'>, fresh = false): TtsBrief {
  return generateBrief({
    productName: c.product_name, productUrl: c.product_url, notes: c.notes, format: c.format, goal: c.goal,
    durationS: c.duration_s, hasImage: !!c.image_path, seed: fresh ? `${c.id}:${Date.now()}` : c.id,
  });
}

export async function uploadCreativeFile(userId: string, creativeId: string, file: File, kind: 'foto' | 'video'): Promise<{ path: string; url: string }> {
  const ext = (file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '');
  return uploadMedia(userId, `tts-${creativeId}`, `${kind}-${Date.now()}.${ext}`, file);
}

export async function updateCreative(id: string, patch: Partial<Creative>) {
  const { error } = await supabase.from('tts_creatives').update(patch).eq('id', id);
  if (error) throw error;
}

/** Próximo passo exibido na fila. */
export function nextStep(c: Creative): string {
  switch (c.status) {
    case 'draft': return 'Gerar o briefing';
    case 'brief_ready': return 'Gerar o vídeo no Pippit';
    case 'video_ready': return 'Agendar no Pippit ou enviar pela API';
    case 'scheduled': return 'Confirmar a publicação';
    case 'posting': return 'Aguardando o TikTok';
    case 'published': return 'Adicionar a sacolinha';
    case 'anchor_added': return 'Concluído';
    default: return '—';
  }
}

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
