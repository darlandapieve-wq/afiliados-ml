import { useState } from 'react';
import { useApp } from '../App';
import { supabase, api, uploadMedia, errMsg } from '../lib/supabase';
import { PLATFORMS, PLATFORM_ORDER, AUTO_STATUS_LABEL } from '../../supabase/functions/_shared/platforms.ts';
import { download } from '../lib/labels';
import { Field, Msg } from '../components/ui';
import { generateArts, upsertVariants } from '../lib/campaign';

export default function Settings() {
  const { profile, reloadProfile, session } = useApp();
  const [s, setS] = useState(profile.settings);
  const [b, setB] = useState(profile.brand);
  const [tz, setTz] = useState(profile.timezone);
  const [name, setName] = useState(profile.display_name ?? '');
  const [msg, setMsg] = useState<any>(null);
  const [busy, setBusy] = useState('');

  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); setMsg(null); try { await fn(); } catch (e) { setMsg({ t: 'err', m: errMsg(e) }); } finally { setBusy(''); } };

  const save = () => run('Salvando…', async () => {
    const { error } = await supabase.from('profiles').update({ settings: s, brand: b, timezone: tz, display_name: name || null }).eq('id', profile.id);
    if (error) throw error;
    await reloadProfile(); setMsg({ t: 'ok', m: 'Configurações salvas.' });
  });
  const uploadLogo = (f: File) => run('Enviando logotipo…', async () => {
    const { path } = await uploadMedia(session.user.id, 'marca', `logo-${Date.now()}.${f.name.split('.').pop()}`, f);
    setB({ ...b, logo_path: path });
  });

  const exportData = () => run('Exportando…', async () => {
    const tables = ['profiles', 'products', 'affiliate_links', 'campaigns', 'content_variants', 'assets', 'publications', 'jobs', 'execution_logs', 'click_events', 'affiliate_results', 'connected_accounts', 'audit_log'];
    const out: Record<string, unknown> = { exportado_em: new Date().toISOString(), observacao: 'Tokens de integrações não são exportados.' };
    for (const t of tables) { const { data } = await supabase.from(t).select('*').limit(10000); out[t] = data; }
    download(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), `afiliados-ml-export-${new Date().toISOString().slice(0, 10)}.json`);
  });

  const deleteAll = () => run('Excluindo conta…', async () => {
    const c = prompt('Isto apaga definitivamente sua conta, produtos, campanhas, artes e integrações. Digite EXCLUIR para confirmar.');
    if (c !== 'EXCLUIR') return;
    await api('account', { action: 'delete', confirm: 'EXCLUIR' });
    await supabase.auth.signOut();
  });

  const demo = () => run('Criando dados de demonstração…', async () => {
    const { data: p, error } = await supabase.from('products').insert({
      title: '[DEMO] Fone de ouvido Bluetooth com cancelamento de ruído', category: 'Áudio', is_demo: true,
      features: ['Até 30 h de bateria (dado fictício)', 'Cancelamento ativo de ruído (dado fictício)', 'Conexão multiponto (dado fictício)'],
      description: 'Produto fictício para demonstração da ferramenta. Não corresponde a um anúncio real.', audience: 'quem trabalha em home office',
    }).select('*').single();
    if (error) throw error;
    const { data: l } = await supabase.from('affiliate_links').insert({ product_id: p.id, url: 'https://mercadolivre.com/sec/DEMO0000', validation_status: 'warning', validation_notes: ['Link fictício de demonstração — não gera comissão.'] }).select('id').single();
    const { data: c } = await supabase.from('campaigns').insert({ product_id: p.id, affiliate_link_id: l!.id, name: '[DEMO] Campanha de exemplo', is_demo: true, landing_enabled: true }).select('id').single();
    const platforms = ['facebook', 'instagram', 'whatsapp', 'telegram', 'pinterest'] as const;
    const { assets } = await generateArts(session.user.id, c!.id, p, profile.brand, 'informativo', false, [...platforms]);
    await upsertVariants(c!.id, p, 'informativo', false, 'https://mercadolivre.com/sec/DEMO0000', [...platforms], assets, profile.brand.handle);
    setMsg({ t: 'ok', m: 'Dados de demonstração criados (identificados como DEMO). Nada é publicado de verdade sem integração conectada.' });
  });

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <h1>Configurações</h1>
      <Msg m={msg} />{busy && <div className="alert info">{busy}</div>}

      <div className="card stack">
        <h2>Publicação</h2>
        <label className="check"><input type="checkbox" checked={s.approval_required} onChange={(e) => setS({ ...s, approval_required: e.target.checked })} /> Exigir minha aprovação antes de publicar/agendar (recomendado)</label>
        <div>
          <label>Publicação automática por rede</label>
          <div className="small muted" style={{ marginBottom: 6 }}>Desativado = você revisa e publica (modo assistido). Ative apenas para redes conectadas e testadas.</div>
          <div className="grid g2">{PLATFORM_ORDER.filter((c) => PLATFORMS[c].autoStatus !== 'none').map((c) => (
            <label key={c} className="check"><input type="checkbox" checked={!!s.auto_publish?.[c]} onChange={(e) => setS({ ...s, auto_publish: { ...s.auto_publish, [c]: e.target.checked } })} /> {PLATFORMS[c].name} <span className="small muted">({AUTO_STATUS_LABEL[PLATFORMS[c].autoStatus]})</span></label>
          ))}</div>
        </div>
        <div className="grid g3">
          <Field label="Máx. publicações automáticas em 24 h"><input type="number" min={1} max={100} value={s.max_posts_per_day} onChange={(e) => setS({ ...s, max_posts_per_day: Number(e.target.value) })} /></Field>
          <Field label="Intervalo mínimo na mesma rede (min)"><input type="number" min={0} max={1440} value={s.min_minutes_between_posts} onChange={(e) => setS({ ...s, min_minutes_between_posts: Number(e.target.value) })} /></Field>
          <Field label="Fuso horário"><select value={tz} onChange={(e) => setTz(e.target.value)}>{['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Rio_Branco', 'America/Noronha'].map((z) => <option key={z}>{z}</option>)}</select></Field>
        </div>
      </div>

      <div className="card stack">
        <h2>Identidade visual das artes</h2>
        <div className="grid g4">
          <Field label="Cor de destaque"><input type="color" value={b.primary} onChange={(e) => setB({ ...b, primary: e.target.value })} /></Field>
          <Field label="Cor de fundo"><input type="color" value={b.secondary} onChange={(e) => setB({ ...b, secondary: e.target.value })} /></Field>
          <Field label="Texto do botão"><input type="color" value={b.text} onChange={(e) => setB({ ...b, text: e.target.value })} /></Field>
          <Field label="Fonte"><select value={b.font} onChange={(e) => setB({ ...b, font: e.target.value })}>{['Inter', 'Arial', 'Verdana', 'Georgia', 'Trebuchet MS'].map((f) => <option key={f}>{f}</option>)}</select></Field>
        </div>
        <div className="grid g2">
          <Field label="Seu @ (aparece nas artes)"><input value={b.handle ?? ''} onChange={(e) => setB({ ...b, handle: e.target.value || null })} placeholder="@seuperfil" /></Field>
          <Field label="Logotipo (opcional)"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />{b.logo_path && <div className="small muted">Logotipo enviado. <a href="#" onClick={() => setB({ ...b, logo_path: null })}>remover</a></div>}</Field>
        </div>
        <Field label="Nome de exibição"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <div><button className="primary big" onClick={save}>Salvar configurações</button></div>

      <div className="card stack">
        <h2>Dados</h2>
        <div className="row">
          <button onClick={demo}>Carregar dados de demonstração</button>
          <button onClick={exportData}>Exportar meus dados (JSON)</button>
          <button className="danger" onClick={deleteAll}>Excluir conta e todos os dados</button>
        </div>
        <div className="small muted">Backup completo do banco: veja docs/BACKUP.md.</div>
      </div>
    </div>
  );
}
