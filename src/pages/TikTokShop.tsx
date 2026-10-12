import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../App';
import { supabase, errMsg } from '../lib/supabase';
import { fmtDate } from '../lib/labels';
import { Field, Msg } from '../components/ui';
import { TTS_FORMATS, TTS_STATUS, TTS_PIPELINE, anchorDaysLeft, type TtsFormat, type TtsGoal } from '../../supabase/functions/_shared/tts.ts';
import { templateBrief, uploadCreativeFile, nextStep, type Creative } from '../lib/tts';

export function TtsBadge({ s }: { s: string }) {
  const st = TTS_STATUS[s] ?? { label: s, tone: 'gray' };
  return <span className={`badge t-${st.tone}`}>{st.label}</span>;
}

export function AnchorCountdown({ c }: { c: Pick<Creative, 'status' | 'anchor_deadline'> }) {
  if (c.status !== 'published') return null;
  const d = anchorDaysLeft(c.anchor_deadline);
  if (d == null) return null;
  if (d <= 0) return <span className="badge t-red">Prazo da sacolinha encerrado</span>;
  return <span className={`badge ${d <= 7 ? 't-red' : 't-amber'}`}>Sacolinha: {d} dia{d === 1 ? '' : 's'}</span>;
}

export default function TikTokShop() {
  const { session, profile } = useApp();
  const nav = useNavigate();
  const [rows, setRows] = useState<Creative[] | null>(null);
  const [view, setView] = useState<'ativos' | 'arquivados'>('ativos');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err' | 'warn' | 'info'; m: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ product_name: '', product_url: '', notes: '', format: 'demo' as TtsFormat, goal: 'venda' as TtsGoal, duration_s: 30 });
  const [photo, setPhoto] = useState<File | null>(null);

  const load = async () => {
    const { data } = await supabase.from('tts_creatives').select('*').order('updated_at', { ascending: false }).limit(200);
    setRows((data ?? []) as Creative[]);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const url = f.product_url.trim();
    if (url && !/^https:\/\//i.test(url)) { setMsg({ t: 'err', m: 'O link do produto deve começar com https://' }); return; }
    if (photo && !/^image\/(png|jpeg|webp)$/.test(photo.type)) { setMsg({ t: 'err', m: 'Envie a foto em JPG, PNG ou WebP.' }); return; }
    if (photo && photo.size > 10 * 1024 * 1024) { setMsg({ t: 'err', m: 'Foto acima de 10 MB.' }); return; }
    setBusy(true);
    try {
      const { data: c, error } = await supabase.from('tts_creatives').insert({
        product_name: f.product_name.trim(), product_url: url || null, notes: f.notes.trim() || null,
        format: f.format, goal: f.goal, duration_s: f.duration_s,
      }).select('*').single();
      if (error) throw error;
      let image_path: string | null = null;
      if (photo) image_path = (await uploadCreativeFile(session.user.id, c.id, photo, 'foto')).path;
      const brief = templateBrief({ ...c, image_path });
      const { error: e2 } = await supabase.from('tts_creatives').update({ image_path, brief, brief_source: 'template', status: 'brief_ready' }).eq('id', c.id);
      if (e2) throw e2;
      nav(`/tiktok-shop/${c.id}`);
    } catch (err) { setMsg({ t: 'err', m: errMsg(err) }); } finally { setBusy(false); }
  };

  const list = (rows ?? []).filter((r) => (view === 'arquivados' ? r.status === 'archived' : r.status !== 'archived'));
  const counts = Object.fromEntries(TTS_PIPELINE.map((s) => [s, (rows ?? []).filter((r) => r.status === s).length]));
  const urgent = (rows ?? []).filter((r) => r.status === 'published' && (anchorDaysLeft(r.anchor_deadline) ?? 99) <= 7);
  const fmt = TTS_FORMATS.find((x) => x.v === f.format)!;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>TikTok Shop</h1>
          <div className="muted">Foto ou link + seus comentários → briefing para o Pippit → vídeo → publicação → sacolinha.</div>
        </div>
      </div>

      <div className="alert info small">
        A API oficial do TikTok publica o vídeo, mas <b>não adiciona o link do produto (sacolinha)</b>. Agende pelo Publisher do Pippit já com a sacolinha
        ou adicione o link no app depois (vídeos dos últimos 30 dias). Todo vídeo sai com o rótulo de <b>conteúdo gerado por IA</b>.
      </div>

      {urgent.length > 0 && (
        <div className="alert warn">
          <b>Sacolinha pendente:</b> {urgent.map((u, i) => <span key={u.id}>{i ? ' · ' : ' '}<Link to={`/tiktok-shop/${u.id}`}>{u.product_name}</Link> ({Math.max(0, anchorDaysLeft(u.anchor_deadline) ?? 0)} d)</span>)}
        </div>
      )}

      <div className="steps">
        {TTS_PIPELINE.map((s) => <div key={s} className={counts[s] ? 'on' : ''}>{TTS_STATUS[s].label}: {counts[s] ?? 0}</div>)}
      </div>

      <form className="card stack" onSubmit={create}>
        <h2>Novo criativo</h2>
        <Msg m={msg} />
        <div className="grid g2">
          <Field label="Nome do produto *"><input required minLength={2} maxLength={200} value={f.product_name} onChange={(e) => setF({ ...f, product_name: e.target.value })} placeholder="Ex.: Politriz orbital 600 W" /></Field>
          <Field label="Link do produto" hint="TikTok Shop ou loja do parceiro. O Pippit lê o anúncio e usa as fotos reais."><input type="url" value={f.product_url} onChange={(e) => setF({ ...f, product_url: e.target.value })} placeholder="https://…" /></Field>
        </div>
        <div className="grid g2">
          <Field label="Foto do produto (opcional)" hint="JPG/PNG/WebP até 10 MB. A IA descreve o produto a partir dela."><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></Field>
          <div className="grid g2">
            <Field label="Objetivo">
              <select value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value as TtsGoal })}>
                <option value="venda">Vender (com sacolinha)</option>
                <option value="seguidores">Ganhar seguidores</option>
              </select>
            </Field>
            <Field label="Duração">
              <select value={f.duration_s} onChange={(e) => setF({ ...f, duration_s: Number(e.target.value) })}>
                {[15, 20, 30, 40, 45, 60].map((d) => <option key={d} value={d}>{d} s</option>)}
              </select>
            </Field>
          </div>
        </div>
        <Field label="Formato" hint={fmt.hint}>
          <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as TtsFormat })}>
            {TTS_FORMATS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
          </select>
        </Field>
        <Field label="Comentários adicionais" hint="Um benefício por linha: o que o produto faz, para quem é, diferenciais que você confirmou. Não invente preço ou desconto.">
          <textarea maxLength={3000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={'Remove riscos leves da pintura\nNão queima o verniz\nVem com 3 boinas'} />
        </Field>
        <div><button className="primary big" disabled={busy || f.product_name.trim().length < 2}>{busy ? 'Criando…' : 'Criar e gerar briefing'}</button></div>
      </form>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Fila de criativos</h2>
          <div className="tabs" style={{ margin: 0, border: 'none' }}>
            <button className={view === 'ativos' ? 'on' : ''} onClick={() => setView('ativos')}>Ativos</button>
            <button className={view === 'arquivados' ? 'on' : ''} onClick={() => setView('arquivados')}>Arquivados</button>
          </div>
        </div>
        {rows === null ? <div className="empty">Carregando…</div> : list.length === 0 ? <div className="empty">Nenhum criativo {view === 'arquivados' ? 'arquivado' : 'ainda'}.</div> : (
          <table>
            <thead><tr><th>Produto</th><th>Formato</th><th>Etapa</th><th>Próximo passo</th><th>Atualizado</th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/tiktok-shop/${r.id}`}><b>{r.product_name}</b></Link><div className="small muted">{r.goal === 'venda' ? 'Venda' : 'Seguidores'} · {r.duration_s} s</div></td>
                <td className="small">{TTS_FORMATS.find((x) => x.v === r.format)?.l}</td>
                <td><TtsBadge s={r.status} /> <AnchorCountdown c={r} />{r.tt_error && <div className="small" style={{ color: 'var(--red)' }}>{r.tt_error}</div>}</td>
                <td className="small">{nextStep(r)}{r.status === 'scheduled' && r.scheduled_for ? ` (${fmtDate(r.scheduled_for, profile.timezone)})` : ''}</td>
                <td className="small muted">{fmtDate(r.updated_at, profile.timezone)}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
