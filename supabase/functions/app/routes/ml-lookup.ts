// Busca dados de um anúncio pela API oficial do Mercado Livre (requer conta ML conectada via OAuth).
// Proteção SSRF: o URL informado nunca é buscado; apenas o código MLB extraído é usado contra hosts permitidos.
// deno-lint-ignore-file no-explicit-any
import { admin, env, handle, json, readSecret, requireUser, saveSecret, HttpError } from '../../_shared/supa.ts';
import { checkOriginalUrl, extractItemId, isAllowedFetch } from '../../_shared/links.ts';
import { refresh } from '../../_shared/oauth.ts';
import { http } from '../../_shared/connectors/types.ts';

export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const { url } = await req.json();
  const chk = checkOriginalUrl(String(url ?? ''));
  const itemId = chk.itemId ?? extractItemId(String(url ?? ''));
  if (!itemId) return json(req, { found: false, reason: 'Código do anúncio não identificado. Preencha manualmente.', check: chk });

  const db = admin();
  const { data: acc } = await db.from('connected_accounts').select('id').eq('user_id', user.id).eq('platform', 'mercadolivre').maybeSingle();
  if (!acc) return json(req, { found: false, itemId, reason: 'Conecte sua conta do Mercado Livre em Integrações para preencher automaticamente, ou preencha manualmente.' });
  let sec = await readSecret(db, acc.id);
  if (!sec) throw new HttpError(400, 'Reconecte o Mercado Livre.');
  if (sec.expiresAt && sec.expiresAt.getTime() < Date.now() + 60e3 && sec.refresh) {
    const t = await refresh('mercadolivre', env, fetch, sec.refresh);
    await saveSecret(db, acc.id, t.access_token, t.refresh_token, t.expires_in);
    sec = { access: t.access_token, refresh: t.refresh_token ?? null, expiresAt: null };
  }

  const api = `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}`;
  if (!isAllowedFetch(api)) throw new HttpError(400, 'Destino não permitido');
  const headers = { authorization: `Bearer ${sec.access}` };
  const r = await http(fetch, api, { headers }, 15000);
  if (r.status !== 200) {
    // Pode ser um código de produto de catálogo (/p/MLB...) em vez de anúncio
    const p = await http(fetch, `https://api.mercadolibre.com/products/${encodeURIComponent(itemId)}`, { headers }, 15000);
    if (p.status !== 200) return json(req, { found: false, itemId, reason: `Mercado Livre não retornou o anúncio (HTTP ${r.status}). Preencha manualmente.` });
    const d = p.json;
    return json(req, {
      found: true, itemId, kind: 'product', fetchedAt: new Date().toISOString(),
      title: d.name, price: d.buy_box_winner?.price ?? null,
      image: d.pictures?.[0]?.url ?? null,
      features: (d.main_features ?? []).map((f: any) => f.text).slice(0, 6),
      description: d.short_description?.content ?? null,
    });
  }
  const it = r.json;
  const attrs = (it.attributes ?? []).filter((a: any) => a.value_name && !/^(GTIN|SELLER_SKU|ITEM_CONDITION)$/.test(a.id)).slice(0, 6).map((a: any) => `${a.name}: ${a.value_name}`);
  return json(req, {
    found: true, itemId, kind: 'item', fetchedAt: new Date().toISOString(),
    title: it.title, price: typeof it.price === 'number' ? it.price : null, currency: it.currency_id,
    condition: it.condition, status: it.status,
    image: it.pictures?.[0]?.secure_url ?? it.secure_thumbnail ?? null,
    features: attrs, category: it.category_id, permalink: it.permalink,
    eligibilityHint: it.condition !== 'new' ? 'Apenas produtos novos costumam ser elegíveis ao programa.' : null,
  });
});
