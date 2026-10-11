import { useState, type ReactNode } from 'react';
import { PUB_STATUS, copy } from '../lib/labels';
import { LINK_PLACEMENT_LABEL, type LinkPlacement } from '../../supabase/functions/_shared/platforms.ts';

export function StatusBadge({ s }: { s: string }) {
  const st = PUB_STATUS[s] ?? { label: s, tone: 'gray' };
  return <span className={`badge t-${st.tone}`}>{st.label}</span>;
}

export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" onClick={async () => { if (await copy(text)) { setOk(true); setTimeout(() => setOk(false), 1500); } }}>{ok ? 'Copiado ✓' : label}</button>;
}

export function LinkPlacementBadge({ p }: { p: LinkPlacement }) {
  const l = LINK_PLACEMENT_LABEL[p];
  return <span className={`badge ${l.clickable ? 't-green' : 't-amber'}`} title={l.label}>{l.clickable ? '🔗 Link clicável' : '⚠ Link não clicável'}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return <div><label>{label}</label>{children}{hint && <div className="small muted" style={{ marginTop: 4 }}>{hint}</div>}</div>;
}

export function Msg({ m }: { m: { t: 'ok' | 'err' | 'warn' | 'info'; m: string } | null }) {
  return m ? <div className={`alert ${m.t}`}>{m.m}</div> : null;
}
