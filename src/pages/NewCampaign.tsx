import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../App';
import { supabase, api, uploadMedia, errMsg } from '../lib/supabase';
import { checkAffiliateUrl, checkOriginalUrl, cleanPasted, looksLikeAffiliate, parseUrl, extractItemId } from '../../supabase/functions/_shared/links.ts';
import { PLATFORMS, PLATFORM_ORDER, AUTO_STATUS_LABEL, type PlatformCode } from '../../supabase/functions/_shared/platforms.ts';
import type { Style } from '../../supabase/functions/_shared/text.ts';
import { STYLES } from '../lib/labels';
import { Field, Msg } from '../components/ui';
import { generateArts, upsertVariants, type ProductRow } from '../lib/campaign';

const AFF_PANEL = 'https://www.mercadolivre.com.br/afiliados';

export default function NewCampaign() {
  const { session, profile } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err' | 'warn' | 'info'; m: string } | null>(null);
  const [busy, setBusy] = useState('');

  // Etapa 1
  const [pasted, setPasted] = useState('');
  // Produto
  const [existing, setExisting] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState<string>(params.get('produto') ?? '');
  const [f, setF] = useState({ title: '', original_url: '', price: '', priceChecked: false, image_url: '', category: '', description: '', features: '', audience: '', notes: '' });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [lookupInfo, setLookupInfo] = useState<string | null>(null);
  // Link
  const [aff, setAff] = useState('');
  // Conteúdo
  const [style, setStyle] = useState<Style>('informativo');
  const [showPrice, setShowPrice] = useState(false);
  const [platforms, setPlatforms] = useState<PlatformCode[]>(['facebook', 'instagram', 'whatsapp', 'telegram']);
  const [landing, setLanding] = useState(true);
  const [name, setName] = useState('');

  useEffect(() => {
    supabase.from('products').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => setExisting((data ?? []) as any));
  }, []);
  useEffect(() => {
    if (!productId) return;
    const p = existing.find((x) => x.id === productId);
    if (p) {
      setF({ title: p.title, original_url: p.original_url ?? '', price: p.price?.toString() ?? '', priceChecked: false, image_url: p.image_url ?? '', category: p.category ?? '', description: p.description ?? '', features: (p.features ?? []).join('\n'), audience: p.audience ?? '', notes: p.notes ?? '' });
      supabase.from('affiliate_links').select('url').eq('product_id', p.id).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => data && setAff(data.url));
    }
  }, [productId, existing]);

  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function step1() {
    setMsg(null);
    const u = parseUrl(pasted);
    if (!u) return setMsg({ t: 'err', m: 'Cole um endereço válido do Mercado Livre.' });
    const isAff = looksLikeAffiliate(u);
    if (isAff) {
      setAff(cleanPasted(pasted));
      const c = checkAffiliateUrl(pasted);
      if (c.status === 'invalid') return setMsg({ t: 'err', m: c.notes.join(' ') });
      setMsg({ t: 'info', m: 'Link de afiliado reconhecido. Ele será guardado exatamente como foi colado. Preencha os dados do produto.' });
      if (extractItemId(pasted)) await lookup(pasted);
    } else {
      const c = checkOriginalUrl(pasted);
      if (c.status === 'invalid') return setMsg({ t: 'err', m: c.notes.join(' ') });
      setF((x) => ({ ...x, original_url: cleanPasted(pasted) }));
      await lookup(pasted);
    }
    setStep(2);
  }

  async function lookup(url: string) {
    setBusy('Buscando dados oficiais…');
    try {
      const r = await api<any>('ml-lookup', { url });
      if (r.found) {
        setF((x) => ({
          ...x, title: r.title ?? x.title, price: r.price != null ? String(r.price) : x.price, priceChecked: r.price != null,
          image_url: r.image ?? x.image_url, features: (r.features ?? []).join('\n') || x.features, description: r.description ?? x.description,
          original_url: x.original_url || r.permalink || '',
        }));
        setLookupInfo(`Dados obtidos pela API oficial do Mercado Livre em ${new Date(r.fetchedAt).toLocaleString('pt-BR')}.${r.eligibilityHint ? ' ' + r.eligibilityHint : ''}`);
      } else setLookupInfo(r.reason);
    } catch (e) { setLookupInfo(`Busca automática indisponível (${errMsg(e)}). Preencha manualmente.`); }
    finally { setBusy(''); }
  }

  const affCheck = aff ? checkAffiliateUrl(aff, f.original_url) : null;

  async function create() {
    setMsg(null);
    if (!f.title.trim()) return setMsg({ t: 'err', m: 'Informe o nome do produto.' });
    if (!affCheck || affCheck.status === 'invalid') return setMsg({ t: 'err', m: 'Informe um link de afiliado válido.' });
    if (!platforms.length) return setMsg({ t: 'err', m: 'Selecione ao menos uma rede.' });
    try {
      setBusy('Salvando produto…');
      const uid = session.user.id;
      const price = f.price ? Number(f.price.replace(',', '.')) : null;
      const prodRow: any = {
        title: f.title.trim(), original_url: f.original_url || null, price: Number.isFinite(price) ? price : null,
        price_source: price != null ? (lookupInfo?.startsWith('Dados obtidos') ? 'ml_api' : 'manual') : null,
        price_checked_at: price != null && f.priceChecked ? new Date().toISOString() : null,
        image_url: f.image_url || null, category: f.category || null, description: f.description || null,
        features: f.features.split('\n').map((s) => s.trim()).filter(Boolean), audience: f.audience || null, notes: f.notes || null,
        ml_item_id: extractItemId(f.original_url || aff), data_source: lookupInfo?.startsWith('Dados obtidos') ? 'ml_api' : 'manual',
        image_rights: imageFile ? 'own' : f.image_url ? 'ml_listing' : 'unknown',
      };
      let pid = productId;
      if (pid) { const { error } = await supabase.from('products').update(prodRow).eq('id', pid); if (error) throw error; }
      else { const { data, error } = await supabase.from('products').insert(prodRow).select('id').single(); if (error) throw error; pid = data.id; }
      if (imageFile) {
        const { path } = await uploadMedia(uid, `produtos/${pid}`, `imagem-${Date.now()}.${imageFile.name.split('.').pop()}`, imageFile);
        await supabase.from('products').update({ image_path: path, image_rights: 'own' }).eq('id', pid);
      }
      const { data: product } = await supabase.from('products').select('*').eq('id', pid).single();

      setBusy('Registrando link de afiliado…');
      const url = cleanPasted(aff);
      let { data: link } = await supabase.from('affiliate_links').select('id').eq('product_id', pid).eq('url', url).maybeSingle();
      if (!link) {
        const r = await supabase.from('affiliate_links').insert({ product_id: pid, url, source: 'manual_paste', validation_status: affCheck.status, validation_notes: affCheck.notes }).select('id').single();
        if (r.error) throw r.error; link = r.data;
      }

      setBusy('Criando campanha…');
      const { data: camp, error: ce } = await supabase.from('campaigns').insert({
        product_id: pid, affiliate_link_id: link!.id, name: name.trim() || f.title.trim().slice(0, 80), style, show_price: showPrice, landing_enabled: landing,
        status: profile.settings.approval_required ? 'awaiting_review' : 'approved',
        approval_status: profile.settings.approval_required ? 'pending' : 'approved',
      }).select('id').single();
      if (ce) throw ce;

      setBusy('Gerando artes…');
      // Se as artes falharem, a campanha continua (sem duplicar): textos são gerados e as artes podem ser refeitas na aba "Artes e vídeo".
      let assets: Record<string, string> = {};
      const warnings: string[] = [];
      try {
        const r = await generateArts(uid, camp.id, product as any, profile.brand, style, showPrice, platforms);
        assets = r.assets; warnings.push(...r.warnings);
      } catch (e) {
        warnings.push(`As artes não foram geradas (${errMsg(e)}). Use "Gerar novamente as artes" na aba Artes e vídeo.`);
      }
      setBusy('Gerando textos…');
      await upsertVariants(camp.id, product as any, style, showPrice, url, platforms, assets, profile.brand.handle);
      nav(`/campanhas/${camp.id}${warnings.length ? `?avisos=${encodeURIComponent(warnings.join(' | '))}` : ''}`);
    } catch (e) { setMsg({ t: 'err', m: errMsg(e) }); } finally { setBusy(''); }
  }

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <h1>Novo produto / campanha</h1>
      <div className="steps">{['Link', 'Produto', 'Link de afiliado', 'Conteúdo'].map((s, i) => <div key={s} className={step === i + 1 ? 'on' : ''}>{i + 1}. {s}</div>)}</div>
      <Msg m={msg} />
      {busy && <div className="alert info">{busy}</div>}

      {step === 1 && (
        <div className="card stack">
          <Field label="Cole o link do produto ou o seu link de afiliado" hint="Aceita o link comum do anúncio ou o link gerado no Programa de Afiliados.">
            <input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://..." autoFocus />
          </Field>
          <div className="row">
            <button className="primary" onClick={step1} disabled={!pasted || !!busy}>Continuar</button>
            <span className="muted">ou</span>
            <select value={productId} onChange={(e) => { setProductId(e.target.value); if (e.target.value) setStep(2); }} style={{ maxWidth: 360 }}>
              <option value="">Usar um produto já salvo…</option>
              {existing.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <button onClick={() => setStep(2)}>Preencher manualmente</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card stack">
          {lookupInfo && <div className="alert info small">{lookupInfo}</div>}
          <Field label="Nome do produto *"><input value={f.title} onChange={set('title')} maxLength={300} /></Field>
          <Field label="URL original do produto"><input value={f.original_url} onChange={set('original_url')} placeholder="https://produto.mercadolivre.com.br/MLB-..." /></Field>
          <div className="grid g2">
            <Field label="Preço atual (R$)" hint="Opcional. Só aparece nas artes se você conferir agora e ativar a exibição.">
              <input value={f.price} onChange={set('price')} inputMode="decimal" placeholder="Ex.: 199,90" />
            </Field>
            <div style={{ alignSelf: 'end' }}><label className="check"><input type="checkbox" checked={f.priceChecked} onChange={set('priceChecked')} /> Conferi este preço no Mercado Livre agora</label></div>
          </div>
          <div className="grid g2">
            <Field label="Imagem do produto (URL)" hint="Use apenas imagens que você pode usar. A opção mais segura é enviar sua própria foto."><input value={f.image_url} onChange={set('image_url')} /></Field>
            <Field label="…ou enviar imagem própria"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} /></Field>
          </div>
          <div className="grid g2">
            <Field label="Categoria"><input value={f.category} onChange={set('category')} placeholder="Ex.: Áudio" /></Field>
            <Field label="Público-alvo"><input value={f.audience} onChange={set('audience')} placeholder="Ex.: quem treina na academia" /></Field>
          </div>
          <Field label="Características / benefícios (um por linha)" hint="Use somente informações que constam no anúncio."><textarea value={f.features} onChange={set('features')} /></Field>
          <Field label="Descrição"><textarea value={f.description} onChange={set('description')} /></Field>
          <Field label="Observações e diferenciais"><input value={f.notes} onChange={set('notes')} /></Field>
          <div className="row"><button onClick={() => setStep(1)}>Voltar</button><button className="primary" onClick={() => setStep(3)} disabled={!f.title.trim()}>Continuar</button></div>
        </div>
      )}

      {step === 3 && (
        <div className="card stack">
          <div className="alert info small">O Mercado Livre <b>não oferece API pública</b> para gerar links de afiliado. Gere o link no painel oficial (Afiliados › Gerador de links, ou a barra de afiliado no topo da página do produto) e cole abaixo. O link será salvo <b>sem nenhuma alteração</b>.</div>
          <div className="row">
            <a className="btn" href={AFF_PANEL} target="_blank" rel="noreferrer">Abrir painel de afiliados ↗</a>
            {f.original_url && <a className="btn" href={f.original_url} target="_blank" rel="noreferrer">Abrir produto ↗</a>}
          </div>
          <Field label="Link de afiliado *"><input value={aff} onChange={(e) => setAff(e.target.value)} placeholder="https://mercadolivre.com/sec/..." /></Field>
          {affCheck && <div className={`alert ${affCheck.status === 'valid' ? 'ok' : affCheck.status === 'warning' ? 'warn' : 'err'} small`}>{affCheck.status === 'valid' ? 'Link de afiliado reconhecido.' : affCheck.notes.join(' ')}</div>}
          {aff && <div className="row"><a className="btn" href={cleanPasted(aff)} target="_blank" rel="noreferrer">Abrir destino para conferir ↗</a></div>}
          <div className="row"><button onClick={() => setStep(2)}>Voltar</button><button className="primary" onClick={() => setStep(4)} disabled={!affCheck || affCheck.status === 'invalid'}>Continuar</button></div>
        </div>
      )}

      {step === 4 && (
        <div className="card stack">
          <Field label="Nome da campanha"><input value={name} onChange={(e) => setName(e.target.value)} placeholder={f.title.slice(0, 80)} /></Field>
          <Field label="Estilo de comunicação">
            <div className="row">{STYLES.map((s) => <label key={s.v} className="check"><input type="radio" name="style" checked={style === s.v} onChange={() => setStyle(s.v)} /> {s.l}</label>)}</div>
          </Field>
          <label className="check"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} disabled={!f.price || !f.priceChecked} /> Exibir preço nas artes e textos {(!f.price || !f.priceChecked) && <span className="muted small">(exige preço conferido agora)</span>}</label>
          <label className="check"><input type="checkbox" checked={landing} onChange={(e) => setLanding(e.target.checked)} /> Criar página intermediária (útil para "link na bio")</label>
          <Field label="Redes de destino">
            <div className="grid g2">{PLATFORM_ORDER.map((code) => (
              <label key={code} className="check card" style={{ padding: 10 }}>
                <input type="checkbox" checked={platforms.includes(code)} onChange={(e) => setPlatforms(e.target.checked ? [...platforms, code] : platforms.filter((x) => x !== code))} />
                <span><b>{PLATFORMS[code].name}</b><br /><span className="small muted">{AUTO_STATUS_LABEL[PLATFORMS[code].autoStatus]}</span></span>
              </label>
            ))}</div>
          </Field>
          <div className="row"><button onClick={() => setStep(3)}>Voltar</button><button className="primary big" onClick={create} disabled={!!busy}>Gerar arte e textos</button></div>
        </div>
      )}
    </div>
  );
}
