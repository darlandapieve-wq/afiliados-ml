import { useEffect, useMemo, useState } from 'react';
import { supabase, errMsg } from '../lib/supabase';
import { PLATFORMS, PLATFORM_ORDER, type PlatformCode } from '../../supabase/functions/_shared/platforms.ts';
import { formatBRL } from '../../supabase/functions/_shared/text.ts';
import { Msg } from '../components/ui';

export default function Reports() {
  const [days, setDays] = useState(30);
  const [pubs, setPubs] = useState<any[]>([]);
  const [clicks, setClicks] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [msg, setMsg] = useState<any>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ product_id: '', period_start: today, period_end: today, ml_clicks: '', ml_sales: '', commission_estimated: '', commission_approved: '', notes: '' });

  const since = useMemo(() => new Date(Date.now() - days * 86400e3).toISOString(), [days]);
  const load = async () => {
    const [{ data: p }, { data: c }, { data: r }, { data: pr }] = await Promise.all([
      supabase.from('publications').select('platform, status, campaign_id, campaigns(name, product_id)').gte('created_at', since),
      supabase.from('click_events').select('campaign_id, platform_hint, occurred_at, campaigns(name, product_id)').gte('occurred_at', since).limit(10000),
      supabase.from('affiliate_results').select('*, products(title)').order('period_end', { ascending: false }),
      supabase.from('products').select('id, title'),
    ]);
    setPubs(p ?? []); setClicks(c ?? []); setResults(r ?? []); setProducts(pr ?? []);
  };
  useEffect(() => { load(); }, [since]);

  const byPlatform = PLATFORM_ORDER.map((code) => ({
    code, done: pubs.filter((p) => p.platform === code && p.status === 'published').length,
    failed: pubs.filter((p) => p.platform === code && ['failed', 'not_configured'].includes(p.status)).length,
    clicks: clicks.filter((c) => c.platform_hint === code).length,
  }));
  const byCampaign = Object.values(clicks.reduce((acc: any, c) => { const k = c.campaign_id; acc[k] ??= { name: c.campaigns?.name, n: 0 }; acc[k].n++; return acc; }, {})) as any[];
  const sum = (k: string) => results.reduce((s, r) => s + (Number(r[k]) || 0), 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null);
    const { error } = await supabase.from('affiliate_results').insert({
      product_id: form.product_id || null, period_start: form.period_start, period_end: form.period_end,
      ml_clicks: num(form.ml_clicks), ml_sales: num(form.ml_sales), commission_estimated: num(form.commission_estimated), commission_approved: num(form.commission_approved),
      notes: form.notes || null, source: 'manual',
    });
    if (error) setMsg({ t: 'err', m: errMsg(error) }); else { setMsg({ t: 'ok', m: 'Registro salvo.' }); load(); }
  };
  const set = (k: keyof typeof form) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="stack">
      <div className="page-head"><h1>Relatórios</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 180 }}><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={365}>Último ano</option></select>
      </div>
      <div className="alert info small">As origens são separadas e <b>nunca somadas entre si</b>: (1) cliques contados pela aplicação na página intermediária; (2–5) números do painel oficial do Mercado Livre informados por você. Não há API oficial de resultados do afiliado; estimativas não são ganhos confirmados.</div>

      <div className="grid g3">
        <div className="card kpi"><div className="v">{pubs.filter((p) => p.status === 'published').length}</div><div className="l">Publicações concluídas no período</div></div>
        <div className="card kpi"><div className="v">{pubs.filter((p) => ['failed', 'not_configured'].includes(p.status)).length}</div><div className="l">Falhas de publicação</div></div>
        <div className="card kpi"><div className="v">{clicks.length}</div><div className="l">(1) Cliques registrados pela aplicação</div></div>
      </div>

      <div className="grid g2">
        <div className="card"><h2>Por rede</h2>
          <table><thead><tr><th>Rede</th><th>Publicadas</th><th>Falhas</th><th>Cliques (app)*</th></tr></thead>
            <tbody>{byPlatform.map((r) => <tr key={r.code}><td>{PLATFORMS[r.code as PlatformCode].name}</td><td>{r.done}</td><td>{r.failed}</td><td>{r.clicks}</td></tr>)}</tbody></table>
          <div className="small muted">* Atribuídos pela origem <code>?via=</code> do link da página intermediária. Cliques diretos no link de afiliado não passam pela aplicação.</div>
        </div>
        <div className="card"><h2>Cliques por campanha (app)</h2>
          {!byCampaign.length ? <div className="muted">Sem cliques no período.</div> : <table><tbody>{byCampaign.sort((a, b) => b.n - a.n).map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.n}</td></tr>)}</tbody></table>}
        </div>
      </div>

      <div className="card stack">
        <h2>Resultados informados do painel do Mercado Livre</h2>
        <div className="grid g4">
          <div className="kpi"><div className="v">{sum('ml_clicks')}</div><div className="l">(2) Cliques registrados pelo ML</div></div>
          <div className="kpi"><div className="v">{sum('ml_sales')}</div><div className="l">(3) Vendas atribuídas pelo ML</div></div>
          <div className="kpi"><div className="v">{formatBRL(sum('commission_estimated'))}</div><div className="l">(4) Comissões estimadas (não garantidas)</div></div>
          <div className="kpi"><div className="v">{formatBRL(sum('commission_approved'))}</div><div className="l">(5) Comissões aprovadas pelo programa</div></div>
        </div>
        <form onSubmit={save} className="grid g4">
          <div><label>Produto (opcional)</label><select value={form.product_id} onChange={set('product_id')}><option value="">Geral</option>{products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
          <div><label>De</label><input type="date" value={form.period_start} onChange={set('period_start')} required /></div>
          <div><label>Até</label><input type="date" value={form.period_end} onChange={set('period_end')} required /></div>
          <div><label>Cliques (ML)</label><input value={form.ml_clicks} onChange={set('ml_clicks')} inputMode="numeric" /></div>
          <div><label>Vendas (ML)</label><input value={form.ml_sales} onChange={set('ml_sales')} inputMode="numeric" /></div>
          <div><label>Comissão estimada (R$)</label><input value={form.commission_estimated} onChange={set('commission_estimated')} inputMode="decimal" /></div>
          <div><label>Comissão aprovada (R$)</label><input value={form.commission_approved} onChange={set('commission_approved')} inputMode="decimal" /></div>
          <div><label>Observações</label><input value={form.notes} onChange={set('notes')} /></div>
          <div><button className="primary">Registrar</button></div>
        </form>
        <Msg m={msg} />
        {results.length > 0 && <table><thead><tr><th>Período</th><th>Produto</th><th>Cliques</th><th>Vendas</th><th>Estimada</th><th>Aprovada</th><th>Fonte</th></tr></thead>
          <tbody>{results.map((r) => <tr key={r.id}><td className="small">{r.period_start} a {r.period_end}</td><td>{r.products?.title ?? 'Geral'}</td><td>{r.ml_clicks ?? '—'}</td><td>{r.ml_sales ?? '—'}</td><td>{r.commission_estimated != null ? formatBRL(r.commission_estimated) : '—'}</td><td>{r.commission_approved != null ? formatBRL(r.commission_approved) : '—'}</td><td className="small">Informado por você em {new Date(r.created_at).toLocaleDateString('pt-BR')}</td></tr>)}</tbody></table>}
      </div>
    </div>
  );
}
