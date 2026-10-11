import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useApp } from '../App';
import { PUB_STATUS, fmtDate } from '../lib/labels';
import { PLATFORMS, PLATFORM_ORDER, AUTO_STATUS_LABEL } from '../../supabase/functions/_shared/platforms.ts';
import { StatusBadge } from '../components/ui';

export default function Dashboard() {
  const { profile } = useApp();
  const [k, setK] = useState<Record<string, number>>({});
  const [manual, setManual] = useState<any[]>([]);
  const [next, setNext] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [notice, setNotice] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      const c = (t: string, f?: (q: any) => any) => { let q = supabase.from(t).select('id', { count: 'exact', head: true }); if (f) q = f(q); return q.then((r: any) => r.count ?? 0); };
      const [products, campaigns, scheduled, published, failed] = await Promise.all([
        c('products'), c('campaigns'),
        c('publications', (q) => q.eq('status', 'scheduled')),
        c('publications', (q) => q.eq('status', 'published')),
        c('publications', (q) => q.in('status', ['failed', 'not_configured'])),
      ]);
      setK({ products, campaigns, scheduled, published, failed });
      const { data: m } = await supabase.from('publications').select('id, platform, status, error_message, scheduled_at, campaign_id, campaigns(name)').in('status', ['awaiting_manual', 'failed', 'not_configured']).order('updated_at', { ascending: false }).limit(8);
      setManual(m ?? []);
      const { data: n } = await supabase.from('publications').select('id, platform, mode, status, scheduled_at, campaign_id, campaigns(name)').eq('status', 'scheduled').order('scheduled_at').limit(8);
      setNext(n ?? []);
      const { data: a } = await supabase.from('connected_accounts').select('platform, status');
      setAccounts(a ?? []);
      const { data: notices } = await supabase.from('policy_notices').select('*').eq('requires_ack', true);
      const { data: acks } = await supabase.from('policy_acks').select('notice_id');
      setNotice((notices ?? []).find((x: any) => !(acks ?? []).some((y: any) => y.notice_id === x.id)) ?? null);
    })();
  }, []);

  const ack = async () => { await supabase.from('policy_acks').insert({ notice_id: notice.id }); setNotice(null); };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Olá{profile.display_name ? `, ${profile.display_name}` : ''}</h1><div className="muted">Resumo das suas campanhas de afiliado.</div></div>
        <Link to="/nova" className="btn primary big">+ Criar nova campanha</Link>
      </div>

      {notice && (
        <div className="alert warn stack">
          <b>{notice.title}</b><span>{notice.body}</span>
          <div><button onClick={ack}>Li e entendi</button></div>
        </div>
      )}

      <div className="grid g4">
        {[['products', 'Produtos'], ['campaigns', 'Campanhas'], ['scheduled', 'Agendadas'], ['published', 'Publicadas']].map(([key, l]) => (
          <div key={key} className="card kpi"><div className="v">{k[key] ?? '…'}</div><div className="l">{l}</div></div>
        ))}
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Precisa da sua ação</h2>
          {manual.length === 0 ? <div className="muted">Nada pendente. {k.failed ? '' : ''}</div> : (
            <table><tbody>{manual.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/campanhas/${p.campaign_id}`}>{p.campaigns?.name}</Link><div className="small muted">{PLATFORMS[p.platform as keyof typeof PLATFORMS]?.name}</div></td>
                <td><StatusBadge s={p.status} /><div className="small muted">{p.error_message}</div></td>
              </tr>))}</tbody></table>
          )}
        </div>
        <div className="card">
          <h2>Próximas publicações</h2>
          {next.length === 0 ? <div className="muted">Nenhuma publicação agendada.</div> : (
            <table><tbody>{next.map((p) => (
              <tr key={p.id}>
                <td>{fmtDate(p.scheduled_at, profile.timezone)}</td>
                <td><Link to={`/campanhas/${p.campaign_id}`}>{p.campaigns?.name}</Link></td>
                <td>{PLATFORMS[p.platform as keyof typeof PLATFORMS]?.name} <span className="small muted">({p.mode === 'auto' ? 'automático' : 'assistido'})</span></td>
              </tr>))}</tbody></table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>O que é automático e o que depende de você</h2>
        <table>
          <thead><tr><th>Rede</th><th>Publicação automática</th><th>Sua conta</th><th>Link</th></tr></thead>
          <tbody>{PLATFORM_ORDER.map((code) => {
            const p = PLATFORMS[code];
            const acc = accounts.find((a) => a.platform === code);
            const on = profile.settings.auto_publish?.[code];
            return (
              <tr key={code}>
                <td><b>{p.name}</b></td>
                <td><span className="small">{AUTO_STATUS_LABEL[p.autoStatus]}</span>{p.autoStatus !== 'none' && <div className="small muted">{on ? 'Ativada nas configurações' : 'Desativada (aprovação manual)'}</div>}</td>
                <td>{p.autoStatus === 'none' ? <span className="badge t-gray">Assistido</span> : acc ? <span className={`badge ${acc.status === 'connected' ? 't-green' : 't-red'}`}>{acc.status === 'connected' ? 'Conectada' : 'Reconectar'}</span> : <span className="badge t-amber">Não conectada</span>}</td>
                <td className="small">{p.linkPlacement === 'bio' ? 'Link na bio (legenda não clicável)' : 'Clicável'}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div className="small muted">Estados: {Object.values(PUB_STATUS).map((s) => s.label).join(' · ')}</div>
    </div>
  );
}
