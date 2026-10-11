import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../App';
import { supabase, api, errMsg } from '../lib/supabase';
import { PLATFORMS, LINK_PLACEMENT_LABEL, AUTO_STATUS_LABEL, PLATFORM_ORDER, type PlatformCode } from '../../supabase/functions/_shared/platforms.ts';
import { riskyClaims, generateText, type Style } from '../../supabase/functions/_shared/text.ts';
import { landingUrl } from '../../supabase/functions/_shared/links.ts';
import { CAMPAIGN_STATUS, STYLES, fmtDate, toLocalInput, copy } from '../lib/labels';
import { CopyButton, LinkPlacementBadge, Msg, StatusBadge } from '../components/ui';
import { generateArts, generateVideoAsset, assetFor } from '../lib/campaign';

type Tab = 'conteudo' | 'artes' | 'publicar' | 'historico' | 'pagina';

export default function CampaignDetail() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { session, profile } = useApp();
  const [tab, setTab] = useState<Tab>('conteudo');
  const [c, setC] = useState<any>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [pubs, setPubs] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err' | 'warn' | 'info'; m: string } | null>(sp.get('avisos') ? { t: 'warn', m: sp.get('avisos')! } : null);
  const [busy, setBusy] = useState('');
  const [aiOn, setAiOn] = useState(false);

  async function load() {
    const { data } = await supabase.from('campaigns').select('*, products(*), affiliate_links(*)').eq('id', id).single();
    setC(data);
    const [{ data: v }, { data: a }, { data: p }, { data: acc }] = await Promise.all([
      supabase.from('content_variants').select('*').eq('campaign_id', id),
      supabase.from('assets').select('*').eq('campaign_id', id).order('created_at', { ascending: false }),
      supabase.from('publications').select('*').eq('campaign_id', id).order('created_at', { ascending: false }),
      supabase.from('connected_accounts').select('id, platform, display_name, status, meta'),
    ]);
    setVariants((v ?? []).sort((x: any, y: any) => PLATFORM_ORDER.indexOf(x.platform) - PLATFORM_ORDER.indexOf(y.platform)));
    setAssets(a ?? []); setPubs(p ?? []); setAccounts(acc ?? []);
  }
  useEffect(() => { load(); api('integrations', { action: 'status' }).then((s: any) => setAiOn(!!s.ai)).catch(() => {}); }, [id]);
  useEffect(() => {
    if (!pubs.some((p) => ['processing', 'scheduled'].includes(p.status))) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [pubs]);

  if (!c) return <div className="empty">Carregando…</div>;
  const product = c.products;
  const link: string = c.affiliate_links?.url ?? '';
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); await load(); } catch (e) { setMsg({ t: 'err', m: errMsg(e) }); } finally { setBusy(''); }
  };

  const approve = (ok: boolean) => run('Salvando…', async () => {
    const { error } = await supabase.from('campaigns').update({ approval_status: ok ? 'approved' : 'rejected', approved_at: ok ? new Date().toISOString() : null, status: ok ? 'approved' : 'draft' }).eq('id', id);
    if (error) throw error;
  });
  const setStatus = (status: string) => run('Salvando…', async () => {
    const { error } = await supabase.from('campaigns').update({ status }).eq('id', id); if (error) throw error;
    if (status === 'paused' || status === 'archived') {
      const sched = pubs.filter((p) => p.status === 'scheduled');
      for (const p of sched) await supabase.from('publications').update({ status: 'cancelled', error_message: `Campanha ${status === 'paused' ? 'pausada' : 'arquivada'}` }).eq('id', p.id);
      if (sched.length) setMsg({ t: 'info', m: `${sched.length} agendamento(s) cancelado(s).` });
    }
  });
  const duplicate = () => run('Duplicando…', async () => {
    const { data: n, error } = await supabase.from('campaigns').insert({
      product_id: c.product_id, affiliate_link_id: c.affiliate_link_id, name: `${c.name} (cópia)`, style: c.style, show_price: false, landing_enabled: c.landing_enabled,
      status: 'draft', approval_status: profile.settings.approval_required ? 'pending' : 'approved',
    }).select('id').single();
    if (error) throw error;
    await supabase.from('content_variants').insert(variants.map((v) => ({ campaign_id: n.id, platform: v.platform, title: v.title, caption: v.caption, hashtags: v.hashtags, link_placement: v.link_placement })));
    nav(`/campanhas/${n.id}`);
  });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="small"><Link to="/campanhas">← Campanhas</Link></div>
          <h1>{c.name}</h1>
          <div className="row small">
            <span className="badge t-blue">{CAMPAIGN_STATUS[c.status]}</span>
            <span className={`badge ${c.approval_status === 'approved' ? 't-green' : c.approval_status === 'rejected' ? 't-red' : 't-amber'}`}>{c.approval_status === 'approved' ? 'Aprovada' : c.approval_status === 'rejected' ? 'Reprovada' : 'Aguardando revisão'}</span>
            {c.is_demo && <span className="badge t-violet">DEMONSTRAÇÃO</span>}
            <span className="muted">Produto: {product.title}</span>
          </div>
        </div>
        <div className="row">
          {c.approval_status !== 'approved' ? <button className="primary" onClick={() => approve(true)}>Aprovar campanha</button> : <button onClick={() => approve(false)}>Revogar aprovação</button>}
          {c.status !== 'paused' ? <button onClick={() => setStatus('paused')}>Pausar</button> : <button onClick={() => setStatus('active')}>Retomar</button>}
          <button onClick={duplicate}>Duplicar</button>
          {c.status !== 'archived' && <button onClick={() => setStatus('archived')}>Arquivar</button>}
        </div>
      </div>
      <Msg m={msg} />
      {busy && <div className="alert info">{busy}</div>}
      <div className="card small">
        <b>Link de afiliado (preservado sem alterações):</b> <code style={{ wordBreak: 'break-all' }}>{link}</code>
        <div className="row" style={{ marginTop: 6 }}><CopyButton text={link} label="Copiar link" /><a className="btn" href={link} target="_blank" rel="noreferrer">Abrir destino ↗</a>
          {c.affiliate_links?.validation_status !== 'valid' && <span className="badge t-amber">Confira: {c.affiliate_links?.validation_notes?.join(' ')}</span>}</div>
      </div>

      <div className="tabs">{([['conteudo', 'Textos por rede'], ['artes', 'Artes e vídeo'], ['publicar', 'Publicar / agendar'], ['historico', 'Histórico'], ['pagina', 'Página intermediária']] as [Tab, string][]).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'conteudo' && <ContentTab c={c} product={product} link={link} variants={variants} assets={assets} aiOn={aiOn} run={run} setMsg={setMsg} />}
      {tab === 'artes' && <ArtsTab c={c} product={product} variants={variants} assets={assets} run={run} uid={session.user.id} />}
      {tab === 'publicar' && <PublishTab c={c} product={product} link={link} variants={variants} assets={assets} pubs={pubs} accounts={accounts} run={run} />}
      {tab === 'historico' && <HistoryTab campaignId={c.id} pubIds={pubs.map((p) => p.id)} />}
      {tab === 'pagina' && <LandingTab c={c} run={run} />}
    </div>
  );
}

function ContentTab({ c, product, link, variants, assets, aiOn, run, setMsg }: any) {
  const { profile } = useApp();
  const [edit, setEdit] = useState<Record<string, any>>({});
  const [style, setStyle] = useState<Style>(c.style);
  useEffect(() => setEdit(Object.fromEntries(variants.map((v: any) => [v.id, { ...v, hashtagsText: (v.hashtags ?? []).join(' ') }]))), [variants]);
  const missing = PLATFORM_ORDER.filter((p) => !variants.some((v: any) => v.platform === p));

  const save = (v: any) => run('Salvando texto…', async () => {
    const e = edit[v.id];
    const { error } = await supabase.from('content_variants').update({ title: e.title, caption: e.caption, hashtags: e.hashtagsText.split(/\s+/).filter(Boolean), asset_id: e.asset_id || null, enabled: e.enabled }).eq('id', v.id);
    if (error) throw error;
  });
  const regen = (v: any) => {
    const g = generateText(v.platform, { title: product.title, price: product.price, priceCheckedAt: product.price_checked_at, features: product.features, description: product.description, category: product.category, audience: product.audience }, { style, showPrice: c.show_price, link, seed: c.id + Date.now(), handle: profile.brand.handle });
    setEdit({ ...edit, [v.id]: { ...edit[v.id], title: g.title, caption: g.caption, hashtagsText: g.hashtags.join(' ') } });
    if (g.warnings.length) setMsg({ t: 'warn', m: g.warnings.join(' ') });
  };
  const improve = (v: any) => run('Melhorando com IA…', async () => {
    const r = await api<any>('ai-text', { platform: v.platform, style, base: edit[v.id].caption, product: { title: product.title, features: product.features, description: product.description, category: product.category, audience: product.audience } });
    const keepsLink = LINK_PLACEMENT_LABEL[v.link_placement as keyof typeof LINK_PLACEMENT_LABEL].clickable && v.platform !== 'telegram' && v.platform !== 'pinterest' ? r.caption.includes(link) : true;
    if (!keepsLink) throw new Error('A IA alterou ou removeu o link de afiliado; sugestão descartada.');
    setEdit((x) => ({ ...x, [v.id]: { ...x[v.id], caption: r.caption } }));
    if (r.flagged?.length) setMsg({ t: 'warn', m: `Revise: a IA usou termos que exigem confirmação (${r.flagged.join(', ')}).` });
  });
  const addPlatform = (p: PlatformCode) => run('Adicionando rede…', async () => {
    const g = generateText(p, { title: product.title, price: product.price, priceCheckedAt: product.price_checked_at, features: product.features, description: product.description, category: product.category, audience: product.audience }, { style: c.style, showPrice: c.show_price, link, seed: c.id, handle: profile.brand.handle });
    const assetMap: Record<string, string> = {};
    for (const a of assets) if (a.kind === 'image') assetMap[`${a.template}|${a.mime}`] ??= a.id;
    const { error } = await supabase.from('content_variants').insert({ campaign_id: c.id, platform: p, title: g.title, caption: g.caption, hashtags: g.hashtags, link_placement: g.linkPlacement, asset_id: assetFor(p, assetMap) });
    if (error) throw error;
  });

  return (
    <div className="stack">
      <div className="row">
        <span className="small">Estilo para regenerar:</span>
        <select value={style} onChange={(e) => setStyle(e.target.value as Style)} style={{ width: 180 }}>{STYLES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
        {missing.length > 0 && <select onChange={(e) => e.target.value && addPlatform(e.target.value as PlatformCode)} value="" style={{ width: 220 }}><option value="">+ Adicionar rede…</option>{missing.map((p) => <option key={p} value={p}>{PLATFORMS[p].name}</option>)}</select>}
      </div>
      {variants.map((v: any) => {
        const e = edit[v.id]; if (!e) return null;
        const cap = PLATFORMS[v.platform as PlatformCode];
        const risky = riskyClaims(e.caption);
        const asset = assets.find((a: any) => a.id === e.asset_id);
        return (
          <div key={v.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>{cap.name}</h2>
              <div className="row"><LinkPlacementBadge p={v.link_placement} /><label className="check small"><input type="checkbox" checked={e.enabled} onChange={(ev) => setEdit({ ...edit, [v.id]: { ...e, enabled: ev.target.checked } })} /> Incluir</label></div>
            </div>
            <div className="small muted" style={{ margin: '4px 0 10px' }}>{LINK_PLACEMENT_LABEL[v.link_placement as keyof typeof LINK_PLACEMENT_LABEL].label}</div>
            <div className="grid g2">
              <div className="stack">
                {cap.limits.title && <div><label>Título ({(e.title ?? '').length}/{cap.limits.title})</label><input value={e.title ?? ''} maxLength={cap.limits.title} onChange={(ev) => setEdit({ ...edit, [v.id]: { ...e, title: ev.target.value } })} /></div>}
                <div><label>Legenda ({e.caption.length}/{cap.limits.caption})</label><textarea style={{ minHeight: 220 }} value={e.caption} maxLength={cap.limits.caption} onChange={(ev) => setEdit({ ...edit, [v.id]: { ...e, caption: ev.target.value } })} /></div>
                <div><label>Hashtags</label><input value={e.hashtagsText} onChange={(ev) => setEdit({ ...edit, [v.id]: { ...e, hashtagsText: ev.target.value } })} /></div>
                <div><label>Mídia</label>
                  <select value={e.asset_id ?? ''} onChange={(ev) => setEdit({ ...edit, [v.id]: { ...e, asset_id: ev.target.value } })}>
                    <option value="">Sem mídia</option>
                    {assets.filter((a: any) => (cap.requiresVideo ? a.kind === 'video' : true)).map((a: any) => <option key={a.id} value={a.id}>{a.kind === 'video' ? '🎬 Vídeo' : '🖼'} {a.template} {a.width}×{a.height} ({a.mime.split('/')[1]})</option>)}
                  </select>
                  {cap.requiresVideo && !assets.some((a: any) => a.kind === 'video') && <div className="small muted">Gere um vídeo na aba "Artes e vídeo".</div>}
                  {v.platform === 'instagram' && asset && asset.mime === 'image/png' && <div className="small" style={{ color: 'var(--amber)' }}>O Instagram aceita apenas JPEG pela API.</div>}
                </div>
                {risky.length > 0 && <div className="alert warn small">Atenção: o texto contém alegações que exigem confirmação ({risky.join(', ')}). Não publique sem confirmar.</div>}
                <div className="row">
                  <button className="primary" onClick={() => save(v)}>Salvar</button>
                  <button onClick={() => regen(v)}>Regenerar</button>
                  {aiOn && <button onClick={() => improve(v)}>Melhorar com IA</button>}
                  <CopyButton text={e.caption + (e.hashtagsText && !e.caption.includes(e.hashtagsText) ? '' : '')} label="Copiar legenda" />
                </div>
              </div>
              <div className="stack">
                <label>Prévia</label>
                {asset && (asset.kind === 'video' ? <video src={asset.public_url} className="thumb" controls muted /> : <img src={asset.public_url} className="thumb" alt="" />)}
                <div className="preview">{e.title && cap.limits.title ? <b>{e.title}{'\n'}</b> : null}{v.platform === 'telegram' ? e.caption.replace(/<\/?[bi]>/g, '') : e.caption}</div>
                {v.platform === 'telegram' && <div className="small muted">Botão abaixo da mensagem: "🛒 Ver no Mercado Livre" → link de afiliado.</div>}
                {v.platform === 'pinterest' && <div className="small muted">Link de destino do Pin: link de afiliado.</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ArtsTab({ c, product, variants, assets, run, uid }: any) {
  const { profile } = useApp();
  const regenerate = () => run('Gerando artes…', async () => {
    const platforms = variants.map((v: any) => v.platform);
    const { assets: map, warnings } = await generateArts(uid, c.id, product, profile.brand, c.style, c.show_price, platforms);
    for (const v of variants) { const a = assetFor(v.platform, map); if (a) await supabase.from('content_variants').update({ asset_id: a }).eq('id', v.id); }
    if (warnings.length) alert(warnings.join('\n'));
  });
  const video = () => run('Gravando vídeo vertical (cerca de 8 s)…', async () => {
    const { assetId, warnings } = await generateVideoAsset(uid, c.id, product, profile.brand, c.style, c.show_price);
    for (const v of variants.filter((x: any) => x.platform === 'youtube' || x.platform === 'tiktok')) await supabase.from('content_variants').update({ asset_id: assetId }).eq('id', v.id);
    if (warnings.length) alert(warnings.join('\n'));
  });
  const del = (a: any) => run('Removendo…', async () => {
    await supabase.storage.from('media').remove([a.storage_path]);
    const { error } = await supabase.from('assets').delete().eq('id', a.id); if (error) throw error;
  });
  return (
    <div className="stack">
      <div className="row">
        <button className="primary" onClick={regenerate}>Gerar novamente as artes</button>
        <button onClick={video}>Gerar vídeo vertical (Shorts/TikTok/Reels)</button>
        <Link className="btn" to="/configuracoes">Identidade visual…</Link>
      </div>
      {c.show_price && <div className="alert warn small">Esta campanha exibe preço. Confira o valor no Mercado Livre antes de cada publicação; se mudou, atualize o produto e gere as artes de novo.</div>}
      <div className="grid g3">
        {assets.map((a: any) => (
          <div key={a.id} className="card stack">
            {a.kind === 'video' ? <video src={a.public_url} className="thumb" controls muted /> : <img src={a.public_url} className="thumb" alt={a.template} />}
            <div className="small"><b>{a.template}</b> · {a.width}×{a.height} · {a.mime.split('/')[1]}{a.price_checked_at && <div className="muted">Preço visto em {fmtDate(a.price_checked_at)}</div>}</div>
            <div className="row"><a className="btn" href={`${a.public_url}?download=${a.template}.${a.mime.split('/')[1].replace('jpeg', 'jpg')}`}>Baixar</a><button className="danger" onClick={() => del(a)}>Excluir</button></div>
          </div>
        ))}
      </div>
      {!assets.length && <div className="empty">Nenhuma arte ainda.</div>}
    </div>
  );
}

function shareLinks(platform: PlatformCode, caption: string, link: string, image?: string) {
  const plain = caption.replace(/<\/?[bi]>/g, '');
  switch (platform) {
    case 'whatsapp': return [{ l: 'Abrir no WhatsApp', u: `https://wa.me/?text=${encodeURIComponent(plain)}` }];
    case 'telegram': return [{ l: 'Compartilhar no Telegram', u: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(plain)}` }];
    case 'facebook': return [{ l: 'Compartilhar no Facebook', u: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}` }];
    case 'pinterest': return [{ l: 'Criar Pin', u: `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(link)}&media=${encodeURIComponent(image ?? '')}&description=${encodeURIComponent(plain.slice(0, 500))}` }];
    default: return [];
  }
}

function PublishTab({ c, link, variants, assets, pubs, accounts, run }: any) {
  const { profile } = useApp();
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [ttConsent, setTtConsent] = useState(false);
  const [manualUrl, setManualUrl] = useState<Record<string, string>>({});
  const [resched, setResched] = useState<Record<string, string>>({});
  const enabled = variants.filter((v: any) => v.enabled);

  useEffect(() => {
    const def: Record<string, any> = {};
    for (const v of enabled) {
      const acc = accounts.find((a: any) => a.platform === v.platform && a.status === 'connected');
      const canAuto = PLATFORMS[v.platform as PlatformCode].autoStatus !== 'none' && !!acc && !!profile.settings.auto_publish?.[v.platform];
      def[v.id] = { on: true, mode: canAuto ? 'auto' : 'assisted', account_id: acc?.id ?? '', when: toLocalInput(new Date(Date.now() + 3600e3)) };
    }
    setCfg(def);
  }, [variants, accounts]);

  const approved = c.approval_status === 'approved' || !profile.settings.approval_required;
  const active = (v: any) => pubs.find((p: any) => p.variant_id === v.id && ['scheduled', 'processing'].includes(p.status));

  const submit = (kind: 'now' | 'schedule' | 'draft') => run(kind === 'draft' ? 'Salvando rascunhos…' : 'Agendando…', async () => {
    const chosen = enabled.filter((v: any) => cfg[v.id]?.on);
    if (!chosen.length) throw new Error('Selecione ao menos uma rede.');
    if (kind !== 'draft' && !approved) throw new Error('Aprove a campanha antes de publicar ou agendar.');
    if (chosen.some((v: any) => v.platform === 'tiktok' && cfg[v.id].mode === 'auto') && !ttConsent) throw new Error('Confirme o aviso do TikTok antes de enviar.');
    const dup = chosen.filter((v: any) => active(v));
    if (dup.length) throw new Error(`Já existe publicação agendada/em processamento para: ${dup.map((v: any) => PLATFORMS[v.platform as PlatformCode].name).join(', ')}. Cancele-a antes.`);
    for (const v of chosen) {
      const o = cfg[v.id];
      const cap = PLATFORMS[v.platform as PlatformCode];
      if (o.mode === 'auto' && cap.requiresVideo && !assets.find((a: any) => a.id === v.asset_id && a.kind === 'video')) throw new Error(`${cap.name} exige um vídeo. Gere-o na aba "Artes e vídeo".`);
      const when = kind === 'now' ? new Date() : new Date(o.when);
      if (kind === 'schedule' && when.getTime() < Date.now() - 60e3) throw new Error('Escolha um horário futuro.');
      const { error } = await supabase.from('publications').insert({
        campaign_id: c.id, variant_id: v.id, platform: v.platform, mode: o.mode, account_id: o.mode === 'auto' ? o.account_id || null : null,
        status: kind === 'draft' ? 'draft' : 'scheduled', scheduled_at: kind === 'draft' ? null : when.toISOString(),
      });
      if (error) throw new Error(`${cap.name}: ${error.message}`);
    }
    if (c.status === 'approved' || c.status === 'awaiting_review') await supabase.from('campaigns').update({ status: 'active' }).eq('id', c.id);
  });

  const cancel = (p: any) => run('Cancelando…', async () => { const { error } = await supabase.from('publications').update({ status: 'cancelled' }).eq('id', p.id); if (error) throw error; });
  const reschedule = (p: any) => run('Reagendando…', async () => {
    const v = resched[p.id]; if (!v) throw new Error('Escolha o novo horário.');
    const { error } = await supabase.from('publications').update({ status: 'scheduled', scheduled_at: new Date(v).toISOString(), error_message: null }).eq('id', p.id); if (error) throw error;
  });
  const markDone = (p: any) => run('Registrando…', async () => {
    const url = manualUrl[p.id]?.trim() || null;
    const { error } = await supabase.from('publications').update({ status: 'published', external_url: url, error_message: null }).eq('id', p.id); if (error) throw error;
  });

  return (
    <div className="stack">
      {!approved && <div className="alert warn">A aprovação manual está ativada: aprove a campanha (botão no topo) para publicar ou agendar.</div>}
      <div className="card">
        <h2>Onde e quando</h2>
        <table>
          <thead><tr><th></th><th>Rede</th><th>Modo</th><th>Conta</th><th>Horário (agendamento)</th></tr></thead>
          <tbody>{enabled.map((v: any) => {
            const o = cfg[v.id]; if (!o) return null;
            const cap = PLATFORMS[v.platform as PlatformCode];
            const accs = accounts.filter((a: any) => a.platform === v.platform);
            const autoAllowed = cap.autoStatus !== 'none' && accs.length > 0 && profile.settings.auto_publish?.[v.platform];
            return (
              <tr key={v.id}>
                <td><input type="checkbox" checked={o.on} onChange={(e) => setCfg({ ...cfg, [v.id]: { ...o, on: e.target.checked } })} /></td>
                <td><b>{cap.name}</b><div className="small muted">{AUTO_STATUS_LABEL[cap.autoStatus]}</div>{active(v) && <span className="badge t-blue">já agendada</span>}</td>
                <td>
                  <select value={o.mode} onChange={(e) => setCfg({ ...cfg, [v.id]: { ...o, mode: e.target.value } })}>
                    <option value="assisted">Assistido (você publica)</option>
                    <option value="auto" disabled={!autoAllowed}>Automático (API oficial)</option>
                  </select>
                  {!autoAllowed && cap.autoStatus !== 'none' && <div className="small muted">{accs.length ? 'Ative em Configurações › Publicação automática.' : <>Conecte em <Link to="/integracoes">Integrações</Link>.</>}</div>}
                  {o.mode === 'auto' && cap.autoStatus === 'private_until_audit' && !accs.find((a: any) => a.id === o.account_id)?.meta?.audited && <div className="small" style={{ color: 'var(--amber)' }}>Ficará PRIVADO até a auditoria da plataforma.</div>}
                </td>
                <td>{o.mode === 'auto' ? <select value={o.account_id} onChange={(e) => setCfg({ ...cfg, [v.id]: { ...o, account_id: e.target.value } })}>{accs.map((a: any) => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select> : <span className="muted small">—</span>}</td>
                <td><input type="datetime-local" value={o.when} onChange={(e) => setCfg({ ...cfg, [v.id]: { ...o, when: e.target.value } })} /></td>
              </tr>
            );
          })}</tbody>
        </table>
        {enabled.some((v: any) => v.platform === 'tiktok' && cfg[v.id]?.mode === 'auto') && (
          <label className="check small" style={{ marginTop: 10 }}><input type="checkbox" checked={ttConsent} onChange={(e) => setTtConsent(e.target.checked)} /> Ao publicar, concordo com a Confirmação de Uso de Música do TikTok e autorizo o envio deste conteúdo para a minha conta.</label>
        )}
        <div className="small muted" style={{ marginTop: 8 }}>Horários no fuso do seu navegador ({Intl.DateTimeFormat().resolvedOptions().timeZone}). O agendamento roda no servidor: pode fechar o navegador.</div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={() => submit('now')} disabled={!approved}>Publicar agora</button>
          <button className="primary" onClick={() => submit('schedule')} disabled={!approved}>Agendar</button>
          <button onClick={() => submit('draft')}>Salvar como rascunho</button>
        </div>
      </div>

      <div className="card">
        <h2>Publicações desta campanha</h2>
        {!pubs.length ? <div className="muted">Nenhuma ainda.</div> : (
          <table>
            <thead><tr><th>Rede</th><th>Estado</th><th>Horário</th><th>Resultado</th><th>Ações</th></tr></thead>
            <tbody>{pubs.map((p: any) => {
              const v = variants.find((x: any) => x.id === p.variant_id);
              const asset = assets.find((a: any) => a.id === v?.asset_id);
              const shares = v ? shareLinks(p.platform, v.caption, link, asset?.public_url) : [];
              return (
                <tr key={p.id}>
                  <td><b>{PLATFORMS[p.platform as PlatformCode].name}</b><div className="small muted">{p.mode === 'auto' ? 'Automático' : 'Assistido'}</div></td>
                  <td><StatusBadge s={p.status} />{p.provider_state && <div className="small muted">{p.provider_state}</div>}{p.manual_done_at && <div className="small muted">confirmado por você</div>}</td>
                  <td className="small">{fmtDate(p.scheduled_at, profile.timezone)}{p.confirmed_at && <div className="muted">confirmado {fmtDate(p.confirmed_at, profile.timezone)}</div>}</td>
                  <td className="small">{p.external_url ? <a href={p.external_url} target="_blank" rel="noreferrer">Ver publicação ↗</a> : '—'}{p.error_message && <div style={{ color: 'var(--red)' }}>{p.error_message}</div>}</td>
                  <td className="stack small" style={{ minWidth: 220 }}>
                    {['scheduled', 'draft', 'awaiting_manual', 'failed', 'not_configured'].includes(p.status) && !(p.mode === 'auto' && p.request_sent_at) && (
                      <div className="row"><input type="datetime-local" value={resched[p.id] ?? ''} onChange={(e) => setResched({ ...resched, [p.id]: e.target.value })} style={{ width: 190 }} /><button onClick={() => reschedule(p)}>{p.status === 'scheduled' ? 'Reagendar' : 'Agendar'}</button></div>)}
                    {['scheduled', 'draft', 'awaiting_manual', 'not_configured', 'failed'].includes(p.status) && <button onClick={() => cancel(p)}>Cancelar</button>}
                    {p.mode === 'assisted' && p.status !== 'published' && p.status !== 'cancelled' && v && (
                      <div className="stack">
                        <div className="row">
                          {shares.map((s) => <a key={s.u} className="btn" href={s.u} target="_blank" rel="noreferrer">{s.l} ↗</a>)}
                          <button onClick={() => copy(v.caption.replace(/<\/?[bi]>/g, ''))}>Copiar texto</button>
                          {asset && <a className="btn" href={`${asset.public_url}?download=arte.${asset.mime.split('/')[1].replace('jpeg', 'jpg')}`}>Baixar mídia</a>}
                        </div>
                        <div className="row"><input placeholder="URL da publicação (opcional)" value={manualUrl[p.id] ?? ''} onChange={(e) => setManualUrl({ ...manualUrl, [p.id]: e.target.value })} style={{ width: 190 }} /><button onClick={() => markDone(p)}>Marcar como publicada</button></div>
                      </div>
                    )}
                    {p.mode === 'auto' && p.status === 'awaiting_manual' && <span className="muted">Confira na rede. Se não foi publicada, cancele e agende de novo.</span>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function HistoryTab({ campaignId, pubIds }: { campaignId: string; pubIds: string[] }) {
  const { profile } = useApp();
  const [audit, setAudit] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const key = useMemo(() => pubIds.join(','), [pubIds]);
  useEffect(() => {
    supabase.from('audit_log').select('*').in('entity_id', [campaignId, ...pubIds]).order('created_at', { ascending: false }).limit(200).then(({ data }) => setAudit(data ?? []));
    if (pubIds.length) supabase.from('execution_logs').select('*, publications(platform)').in('publication_id', pubIds).order('created_at', { ascending: false }).limit(200).then(({ data }) => setLogs(data ?? []));
  }, [campaignId, key]);
  return (
    <div className="grid g2">
      <div className="card"><h2>Execuções (worker)</h2>
        {!logs.length ? <div className="muted">Sem registros.</div> : <table><tbody>{logs.map((l) => (
          <tr key={l.id}><td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.created_at, profile.timezone)}</td><td><span className={`badge ${l.level === 'error' ? 't-red' : l.level === 'warn' ? 't-amber' : 't-gray'}`}>{PLATFORMS[l.publications?.platform as PlatformCode]?.name}</span> <span className="small">{l.message}</span></td></tr>))}</tbody></table>}
      </div>
      <div className="card"><h2>Alterações</h2>
        {!audit.length ? <div className="muted">Sem registros.</div> : <table><tbody>{audit.map((a) => (
          <tr key={a.id}><td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.created_at, profile.timezone)}</td>
            <td className="small"><b>{a.entity === 'campaigns' ? 'Campanha' : a.entity === 'publications' ? 'Publicação' : a.entity}</b> {a.action === 'insert' ? 'criada' : a.action === 'delete' ? 'removida' : 'alterada'}
              {a.action === 'update' && <div className="muted">{Object.entries(a.changes ?? {}).filter(([k]) => !['caption'].includes(k)).map(([k, v]: any) => `${k}: ${JSON.stringify(v.de)} → ${JSON.stringify(v.para)}`).join('; ').slice(0, 300)}</div>}
            </td></tr>))}</tbody></table>}
      </div>
    </div>
  );
}

function LandingTab({ c, run }: any) {
  const [clicks, setClicks] = useState<number | null>(null);
  const url = landingUrl(window.location.origin, c.landing_slug);
  useEffect(() => { supabase.from('click_events').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).then(({ count }) => setClicks(count ?? 0)); }, [c.id]);
  const toggle = () => run('Salvando…', async () => { const { error } = await supabase.from('campaigns').update({ landing_enabled: !c.landing_enabled }).eq('id', c.id); if (error) throw error; });
  return (
    <div className="card stack" style={{ maxWidth: 760 }}>
      <label className="check"><input type="checkbox" checked={c.landing_enabled} onChange={toggle} /> Página intermediária ativa</label>
      <div className="alert info small">A página mostra imagem, nome do produto e o botão "Ver produto no Mercado Livre", que usa o seu link de afiliado <b>sem modificações</b> (sem encurtador, sem redirecionamento oculto). Ela não substitui o link de afiliado e não garante comissão. Use-a, por exemplo, como "link na bio" no Instagram/TikTok, apenas se as regras do programa e da rede permitirem.</div>
      {c.landing_enabled && (<>
        <code style={{ wordBreak: 'break-all' }}>{url}</code>
        <div className="row"><CopyButton text={url} label="Copiar endereço" /><a className="btn" href={url} target="_blank" rel="noreferrer">Abrir ↗</a></div>
        <div className="small muted">Para identificar a origem, acrescente <code>?via=instagram</code> (ou tiktok, youtube…) ao endereço. Cliques registrados nesta página: <b>{clicks ?? '…'}</b> (contados pela aplicação, não pelo Mercado Livre).</div>
      </>)}
    </div>
  );
}
