import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../App';
import { supabase, api, errMsg } from '../lib/supabase';
import { fmtDate, toLocalInput, download } from '../lib/labels';
import { CopyButton, Field, Msg } from '../components/ui';
import { TTS_FORMATS, TTS_PIPELINE, TTS_STATUS, briefIssues, fmtTime, anchorDaysLeft, type TtsBrief, type TtsFormat, type TtsGoal } from '../../supabase/functions/_shared/tts.ts';
import { PIPPIT_URL, VIDEO_MAX_BYTES, imageOf, templateBrief, uploadCreativeFile, updateCreative, type Creative } from '../lib/tts';
import { TtsBadge, AnchorCountdown } from './TikTokShop';

type M = { t: 'ok' | 'err' | 'warn' | 'info'; m: string } | null;

export default function TikTokShopDetail() {
  const { id } = useParams();
  const { session, profile } = useApp();
  const [c, setC] = useState<Creative | null>(null);
  const [brief, setBrief] = useState<TtsBrief | null>(null);
  const [dirty, setDirty] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [aiOn, setAiOn] = useState(false);
  const [msg, setMsg] = useState<M>(null);
  const [busy, setBusy] = useState('');

  async function load() {
    const { data } = await supabase.from('tts_creatives').select('*').eq('id', id).single();
    setC(data as Creative);
    if (!dirty) setBrief((data as Creative)?.brief ?? null);
  }
  useEffect(() => {
    load();
    supabase.from('connected_accounts').select('id, display_name, status, meta').eq('platform', 'tiktok').then(({ data }) => setAccounts(data ?? []));
    api('integrations', { action: 'status' }).then((s: any) => setAiOn(!!s.ai)).catch(() => {});
  }, [id]);
  // Envio pela API em andamento: acompanha o status
  useEffect(() => {
    if (c?.status !== 'posting') return;
    const t = setInterval(async () => { try { await api('tts', { action: 'check', id }); } catch { /* o worker também verifica */ } load(); }, 15000);
    return () => clearInterval(t);
  }, [c?.status]);

  if (!c) return <div className="empty">Carregando…</div>;

  const run = async (label: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(label); setMsg(null);
    try { await fn(); await load(); if (ok) setMsg({ t: 'ok', m: ok }); } catch (e) { setMsg({ t: 'err', m: errMsg(e) }); } finally { setBusy(''); }
  };
  const img = imageOf(c);
  const step = TTS_PIPELINE.indexOf(c.status as any);
  const issues = brief ? briefIssues(brief) : [];
  const ttAcc = accounts.find((a) => a.status === 'connected');
  const audited = ttAcc?.meta?.audited === true;
  const locked = ['posting', 'published', 'anchor_added'].includes(c.status);

  const setStatus = (status: string, extra: Partial<Creative> = {}, ok?: string) => run('Salvando…', () => updateCreative(c.id, { status, ...extra } as any), ok);

  const regenTemplate = () => { setBrief(templateBrief(c, true)); setDirty(true); };
  const saveBrief = () => run('Salvando briefing…', async () => {
    await updateCreative(c.id, { brief: { ...brief!, warnings: briefIssues(brief!) }, ...(c.status === 'draft' ? { status: 'brief_ready' } : {}) } as any);
    setDirty(false);
  }, 'Briefing salvo.');
  const improveAI = () => run('Gerando com IA…', async () => {
    const r = await api<any>('tts', { action: 'brief_ai', id: c.id });
    setBrief(r.brief); setDirty(false);
    setMsg({ t: r.brief.warnings?.length ? 'warn' : 'ok', m: r.brief.warnings?.length ? `Revise antes de usar: ${r.brief.warnings.join(' ')}` : `Briefing gerado com IA${r.image_used ? ' a partir da foto' : ''}. Revise antes de usar.` });
  });
  const editScene = (i: number, k: 'narration' | 'onscreen' | 'visual' | 'prompt', v: string) => {
    setBrief({ ...brief!, scenes: brief!.scenes.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }); setDirty(true);
  };

  const uploadVideo = (file: File) => run('Enviando vídeo…', async () => {
    if (!/^video\/(mp4|webm)$/.test(file.type)) throw new Error('Envie o vídeo em MP4 (recomendado) ou WebM.');
    if (file.size > VIDEO_MAX_BYTES) throw new Error('Vídeo acima de 50 MB. Exporte do Pippit em 1080p.');
    const { path, url } = await uploadCreativeFile(session.user.id, c.id, file, 'video');
    await updateCreative(c.id, { video_path: path, video_url: url, ...(['draft', 'brief_ready'].includes(c.status) ? { status: 'video_ready' } : {}) } as any);
  }, 'Vídeo enviado.');

  const publishApi = (confirm_resend = false) => run('Enviando ao TikTok…', async () => {
    const r = await api<any>('tts', { action: 'publish', id: c.id, account_id: ttAcc?.id, confirm_resend });
    if (r.outcome === 'rejected' || r.outcome === 'uncertain') throw new Error(r.tt_error ?? 'O TikTok recusou o envio.');
    setMsg({ t: 'ok', m: r.audited ? 'Enviado. O TikTok está processando o vídeo.' : 'Enviado como PRIVADO (app ainda não auditado). Deixe público no app do TikTok e adicione a sacolinha.' });
  });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="small"><Link to="/tiktok-shop">← TikTok Shop</Link></div>
          <h1>{c.product_name}</h1>
          <div className="row small">
            <TtsBadge s={c.status} /> <AnchorCountdown c={c} />
            <span className="muted">{TTS_FORMATS.find((x) => x.v === c.format)?.l} · {c.goal === 'venda' ? 'venda' : 'seguidores'} · {c.duration_s} s</span>
          </div>
        </div>
        <div className="row">
          {c.status !== 'archived' && c.status !== 'posting' && <button onClick={() => setStatus('archived')}>Arquivar</button>}
          {c.status === 'archived' && <button onClick={() => setStatus(c.brief ? 'brief_ready' : 'draft')}>Restaurar</button>}
        </div>
      </div>

      <div className="steps">{TTS_PIPELINE.map((s, i) => <div key={s} className={i <= step ? 'on' : ''}>{i + 1}. {TTS_STATUS[s].label}</div>)}</div>
      <Msg m={msg} />
      {busy && <div className="alert info">{busy}</div>}

      <ProductCard c={c} img={img} locked={locked} run={run} onRegen={(b) => { setBrief(b); setDirty(true); }} />

      {/* 1–2. Briefing */}
      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Briefing do vídeo {c.brief_source === 'ai' && <span className="badge t-violet">IA</span>}</h2>
          <div className="row">
            <button onClick={regenTemplate}>Nova versão (modelos)</button>
            {aiOn ? <button onClick={improveAI} disabled={!!busy}>✨ Gerar com IA{img ? ' (usa a foto)' : ''}</button> : <span className="small muted">IA desativada (configure GEMINI_API_KEY ou ANTHROPIC_API_KEY)</span>}
            {dirty && <button className="primary" onClick={saveBrief}>Salvar alterações</button>}
          </div>
        </div>
        {!brief ? <div className="muted">Sem briefing. Clique em "Nova versão".</div> : (<>
          {issues.length > 0 && <div className="alert warn small"><b>Conformidade:</b> {issues.join(' ')}</div>}
          {brief.warnings?.filter((w) => !issues.includes(w)).length > 0 && <div className="alert info small">{brief.warnings.filter((w) => !issues.includes(w)).join(' ')}</div>}

          <div>
            <h3>Ganchos (3 primeiros segundos)</h3>
            {brief.hooks.map((h, i) => <div key={i} className="row small" style={{ marginBottom: 4 }}><span className="badge t-blue">{i === 0 ? 'Usado' : 'Alternativo'}</span> {h} <CopyButton text={h} /></div>)}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <h3>Roteiro por cena</h3>
            <table>
              <thead><tr><th>Tempo</th><th>Visual / prompt (EN)</th><th>Narração (pt-BR)</th><th>Texto na tela</th></tr></thead>
              <tbody>{brief.scenes.map((s, i) => (
                <tr key={i}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}><b>{fmtTime(s.start)}–{fmtTime(s.end)}</b><div className="muted">{s.label}</div></td>
                  <td style={{ minWidth: 240 }}>
                    <textarea style={{ minHeight: 56 }} value={s.visual} onChange={(e) => editScene(i, 'visual', e.target.value)} />
                    <textarea style={{ minHeight: 70, fontFamily: 'ui-monospace, monospace', fontSize: '.8rem', marginTop: 4 }} value={s.prompt} onChange={(e) => editScene(i, 'prompt', e.target.value)} />
                    <CopyButton text={s.prompt} label="Copiar prompt" />
                  </td>
                  <td style={{ minWidth: 220 }}><textarea style={{ minHeight: 90 }} value={s.narration} onChange={(e) => editScene(i, 'narration', e.target.value)} /></td>
                  <td style={{ minWidth: 140 }}><input value={s.onscreen} onChange={(e) => editScene(i, 'onscreen', e.target.value)} /></td>
                </tr>))}</tbody>
            </table>
            <div className="row" style={{ marginTop: 8 }}>
              <CopyButton text={brief.scenes.map((s) => s.narration).join(' ')} label="Copiar locução completa" />
              <CopyButton text={brief.scenes.map((s) => `${fmtTime(s.start)}-${fmtTime(s.end)} ${s.label}\nVisual: ${s.visual}\nPrompt: ${s.prompt}\nNarração: ${s.narration}\nTela: ${s.onscreen}`).join('\n\n')} label="Copiar roteiro" />
            </div>
          </div>

          <div className="grid g2">
            <Field label="Legenda" hint={`${brief.caption.length}/2200`}>
              <textarea style={{ minHeight: 170 }} value={brief.caption} onChange={(e) => { setBrief({ ...brief, caption: e.target.value }); setDirty(true); }} />
              <div className="row" style={{ marginTop: 6 }}><CopyButton text={brief.caption} label="Copiar legenda" /></div>
            </Field>
            <Field label="Hashtags (máx. 5)">
              <input value={brief.hashtags.join(' ')} onChange={(e) => { setBrief({ ...brief, hashtags: e.target.value.split(/\s+/).filter(Boolean) }); setDirty(true); }} />
              <Field label="Chamada para ação"><input value={brief.cta} onChange={(e) => { setBrief({ ...brief, cta: e.target.value }); setDirty(true); }} /></Field>
            </Field>
          </div>
        </>)}
      </div>

      {/* 2. Pippit */}
      {brief && (
        <div className="card stack">
          <h2>Gerar no Pippit</h2>
          <div className="grid g2">
            <div className="stack">
              <Field label="Prompt para o Pippit">
                <textarea style={{ minHeight: 200 }} value={brief.pippitPrompt} onChange={(e) => { setBrief({ ...brief, pippitPrompt: e.target.value }); setDirty(true); }} />
              </Field>
              <div className="row">
                <CopyButton text={brief.pippitPrompt} label="Copiar prompt" />
                {c.product_url && <CopyButton text={c.product_url} label="Copiar link do produto" />}
                {img && <button onClick={() => download(img, `${c.product_name.slice(0, 40)}.jpg`)}>Baixar foto</button>}
                <a className="btn primary" href={PIPPIT_URL} target="_blank" rel="noreferrer">Abrir Pippit ↗</a>
              </div>
            </div>
            <div>
              <h3>Passo a passo</h3>
              <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>{brief.pippitSteps.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}</ol>
            </div>
          </div>
        </div>
      )}

      {/* 3. Vídeo */}
      <div className="card stack">
        <h2>Vídeo final</h2>
        {c.video_url ? <video src={c.video_url} controls style={{ maxWidth: 280, borderRadius: 10 }} /> : <div className="muted small">Envie o MP4 exportado do Pippit para guardar aqui e para publicar pela API. Se for agendar direto no Pippit, o envio é opcional.</div>}
        {!locked && (
          <div className="row">
            <label className="btn">{c.video_url ? 'Trocar vídeo' : 'Enviar MP4'}<input type="file" accept="video/mp4,video/webm" hidden onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])} /></label>
            {['draft', 'brief_ready'].includes(c.status) && <button onClick={() => setStatus('video_ready', {}, 'Marcado como vídeo pronto.')}>Já gerei no Pippit (sem enviar)</button>}
          </div>
        )}
      </div>

      {/* 4. Publicar */}
      <PublishCard c={c} ttAcc={ttAcc} audited={audited} profileTz={profile.timezone} setStatus={setStatus} publishApi={publishApi} busy={!!busy} />

      {/* 5. Sacolinha */}
      {['published', 'anchor_added'].includes(c.status) && (
        <div className="card stack">
          <h2>Sacolinha (link do produto)</h2>
          {c.status === 'anchor_added' ? <div className="alert ok">Sacolinha adicionada em {fmtDate(c.anchor_added_at, profile.timezone)}. Criativo concluído.</div> : (<>
            <div className="small">Publicado em {fmtDate(c.published_at, profile.timezone)}{c.post_url && <> · <a href={c.post_url} target="_blank" rel="noreferrer">ver vídeo ↗</a></>}. Prazo para incluir o link: <b>{fmtDate(c.anchor_deadline, profile.timezone)}</b> ({Math.max(0, anchorDaysLeft(c.anchor_deadline) ?? 0)} dias).</div>
            {c.publish_route === 'api' && c.tt_privacy === 'SELF_ONLY' && <div className="alert warn small">O vídeo foi publicado como <b>privado</b> (app sem auditoria do TikTok). No app, mude a privacidade para "Todos" antes de adicionar a sacolinha.</div>}
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Abra o vídeo no app do TikTok e escolha editar a publicação / adicionar link.</li>
              <li>Selecione <b>Produtos</b> e escolha o item na sua vitrine de afiliado.</li>
              <li>Confirme. O link passa por uma revisão do TikTok antes de aparecer.</li>
            </ol>
            <div><button className="primary" onClick={() => setStatus('anchor_added', {}, 'Concluído!')}>Sacolinha adicionada ✓</button></div>
          </>)}
        </div>
      )}
    </div>
  );
}

function ProductCard({ c, img, locked, run, onRegen }: { c: Creative; img: string | null; locked: boolean; run: (l: string, fn: () => Promise<void>, ok?: string) => Promise<void>; onRegen: (b: TtsBrief) => void }) {
  const { session } = useApp();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ product_name: c.product_name, product_url: c.product_url ?? '', notes: c.notes ?? '', format: c.format, goal: c.goal, duration_s: c.duration_s });
  useEffect(() => setF({ product_name: c.product_name, product_url: c.product_url ?? '', notes: c.notes ?? '', format: c.format, goal: c.goal, duration_s: c.duration_s }), [c.id, c.updated_at]);

  const save = () => run('Salvando produto…', async () => {
    if (f.product_url && !/^https:\/\//i.test(f.product_url)) throw new Error('O link deve começar com https://');
    const patch = { product_name: f.product_name.trim(), product_url: f.product_url.trim() || null, notes: f.notes.trim() || null, format: f.format, goal: f.goal, duration_s: f.duration_s };
    await updateCreative(c.id, patch as any);
    onRegen(templateBrief({ ...c, ...patch }, true));
    setEdit(false);
  }, 'Produto atualizado. Um novo briefing foi gerado: revise e salve.');
  const photo = (file: File) => run('Enviando foto…', async () => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Envie JPG, PNG ou WebP.');
    const { path } = await uploadCreativeFile(session.user.id, c.id, file, 'foto');
    await updateCreative(c.id, { image_path: path });
  }, 'Foto atualizada.');

  return (
    <div className="card">
      <div className="grid" style={{ gridTemplateColumns: '160px 1fr', alignItems: 'start' }}>
        <div className="stack">
          {img ? <img src={img} alt="" className="thumb" /> : <div className="thumb empty small">Sem foto</div>}
          {!locked && <label className="btn small">{img ? 'Trocar foto' : 'Enviar foto'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && photo(e.target.files[0])} /></label>}
        </div>
        {!edit ? (
          <div className="stack small">
            <div><b>Link:</b> {c.product_url ? <><a href={c.product_url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{c.product_url}</a></> : <span className="muted">não informado</span>}</div>
            <div><b>Comentários:</b><div className="preview" style={{ maxHeight: 140 }}>{c.notes || '—'}</div></div>
            {!locked && <div><button onClick={() => setEdit(true)}>Editar dados do produto</button></div>}
          </div>
        ) : (
          <div className="stack">
            <div className="grid g2">
              <Field label="Nome"><input value={f.product_name} onChange={(e) => setF({ ...f, product_name: e.target.value })} /></Field>
              <Field label="Link"><input value={f.product_url} onChange={(e) => setF({ ...f, product_url: e.target.value })} /></Field>
            </div>
            <div className="grid g3">
              <Field label="Formato"><select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as TtsFormat })}>{TTS_FORMATS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}</select></Field>
              <Field label="Objetivo"><select value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value as TtsGoal })}><option value="venda">Vender</option><option value="seguidores">Seguidores</option></select></Field>
              <Field label="Duração"><select value={f.duration_s} onChange={(e) => setF({ ...f, duration_s: Number(e.target.value) })}>{[15, 20, 30, 40, 45, 60].map((d) => <option key={d} value={d}>{d} s</option>)}</select></Field>
            </div>
            <Field label="Comentários adicionais"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <div className="row"><button className="primary" onClick={save}>Salvar e gerar novo briefing</button><button onClick={() => setEdit(false)}>Cancelar</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

function PublishCard({ c, ttAcc, audited, profileTz, setStatus, publishApi, busy }: {
  c: Creative; ttAcc: any; audited: boolean; profileTz: string; busy: boolean;
  setStatus: (s: string, extra?: Partial<Creative>, ok?: string) => Promise<void>; publishApi: (confirm?: boolean) => Promise<void>;
}) {
  const [when, setWhen] = useState(toLocalInput(new Date(Date.now() + 3600e3)));
  const [postUrl, setPostUrl] = useState('');
  const [withAnchor, setWithAnchor] = useState(true);
  if (['draft', 'archived'].includes(c.status)) return null;
  const done = ['published', 'anchor_added'].includes(c.status);
  const cleanUrl = postUrl.trim();
  const urlOk = !cleanUrl || /^https:\/\/(www\.|vm\.|vt\.)?tiktok\.com\//i.test(cleanUrl);

  return (
    <div className="card stack">
      <h2>Publicar</h2>
      {c.status === 'posting' && <div className="alert info">Enviando ao TikTok ({c.tt_state ?? 'aguardando'}). Pode fechar a página: o sistema confere a cada minuto.</div>}
      {c.tt_error && c.status !== 'posting' && <div className="alert err small">{c.tt_error}</div>}
      {done ? <div className="small muted">Publicado {c.publish_route === 'api' ? 'pela API' : c.publish_route === 'app' ? 'pelo app do TikTok' : 'pelo Pippit'}.</div> : c.status !== 'posting' && (
        <div className="grid g2">
          <div className="stack">
            <h3>A) Pelo Pippit (recomendado: já sai com a sacolinha)</h3>
            {c.status !== 'scheduled' ? (<>
              <Field label="Horário agendado no Pippit"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
              <div><button onClick={() => setStatus('scheduled', { scheduled_for: new Date(when).toISOString(), publish_route: 'pippit' }, 'Agendamento registrado.')} disabled={busy}>Agendei no Pippit</button></div>
            </>) : <div className="small">Agendado para <b>{fmtDate(c.scheduled_for, profileTz)}</b>.</div>}
            <Field label="Link do vídeo publicado (opcional)"><input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://www.tiktok.com/@…/video/…" /></Field>
            <label className="check"><input type="checkbox" checked={withAnchor} onChange={(e) => setWithAnchor(e.target.checked)} /> Saiu com a sacolinha (link do produto)</label>
            <div className="row">
              <button className="primary" disabled={busy || !urlOk} onClick={() => setStatus(withAnchor ? 'anchor_added' : 'published', { publish_route: c.publish_route === 'app' ? 'app' : 'pippit', post_url: cleanUrl || null }, 'Publicação registrada.')}>Foi publicado</button>
              <button disabled={busy || !urlOk} onClick={() => setStatus(withAnchor ? 'anchor_added' : 'published', { publish_route: 'app', post_url: cleanUrl || null }, 'Publicação registrada.')}>Publiquei pelo app do TikTok</button>
            </div>
            {!urlOk && <div className="small" style={{ color: 'var(--red)' }}>Use um link do tiktok.com.</div>}
          </div>
          <div className="stack">
            <h3>B) Pela API oficial do TikTok</h3>
            {!ttAcc ? <div className="small muted">Conecte sua conta do TikTok em <Link to="/integracoes">Integrações</Link> para enviar daqui.</div>
              : !c.video_url ? <div className="small muted">Envie o MP4 final em "Vídeo final" para habilitar.</div>
              : (<>
                <div className="small">Conta: <b>{ttAcc.display_name}</b>. Vai com o rótulo <b>conteúdo gerado por IA</b> e a legenda do briefing.</div>
                {!audited && <div className="alert warn small">App ainda sem auditoria do TikTok: o vídeo será publicado como <b>privado</b>. Depois, deixe público e adicione a sacolinha pelo app.</div>}
                <div className="small muted">A API não adiciona a sacolinha. Você terá 30 dias para incluí-la pelo app.</div>
                <div className="row">
                  {!c.tt_request_sent_at
                    ? <button className="primary" disabled={busy} onClick={() => publishApi(false)}>Enviar pela API</button>
                    : <button className="danger" disabled={busy} onClick={() => { if (confirm('Você conferiu no app do TikTok e o vídeo NÃO foi publicado? Reenviar pode duplicar a publicação.')) publishApi(true); }}>Conferi: não está no TikTok, reenviar</button>}
                </div>
              </>)}
          </div>
        </div>
      )}
    </div>
  );
}
