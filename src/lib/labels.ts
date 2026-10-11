export const PUB_STATUS: Record<string, { label: string; tone: 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'violet' }> = {
  draft: { label: 'Rascunho', tone: 'gray' },
  awaiting_review: { label: 'Aguardando revisão', tone: 'amber' },
  approved: { label: 'Aprovada', tone: 'blue' },
  scheduled: { label: 'Agendada', tone: 'blue' },
  processing: { label: 'Em processamento', tone: 'violet' },
  published: { label: 'Publicada', tone: 'green' },
  failed: { label: 'Falha', tone: 'red' },
  cancelled: { label: 'Cancelada', tone: 'gray' },
  awaiting_manual: { label: 'Aguardando ação manual', tone: 'amber' },
  not_configured: { label: 'Integração não configurada', tone: 'red' },
};

export const CAMPAIGN_STATUS: Record<string, string> = {
  draft: 'Rascunho', awaiting_review: 'Aguardando revisão', approved: 'Aprovada', active: 'Ativa', paused: 'Pausada', archived: 'Arquivada',
};

export const STYLES = [
  { v: 'informativo', l: 'Informativo' },
  { v: 'promocional', l: 'Promocional' },
  { v: 'comparativo', l: 'Comparativo' },
  { v: 'descontraido', l: 'Descontraído' },
] as const;

export function fmtDate(iso: string | null | undefined, tz = 'America/Sao_Paulo'): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Valor para <input type="datetime-local"> no fuso do navegador. */
export function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function download(blobOrUrl: Blob | string, filename: string) {
  const a = document.createElement('a');
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}
