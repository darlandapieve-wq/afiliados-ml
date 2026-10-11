import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CAMPAIGN_STATUS, fmtDate } from '../lib/labels';
import { useApp } from '../App';
import { StatusBadge } from '../components/ui';
import { PLATFORMS, type PlatformCode } from '../../supabase/functions/_shared/platforms.ts';

export default function Campaigns() {
  const { profile } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    supabase.from('campaigns').select('id, name, status, approval_status, created_at, is_demo, products(title), publications(platform, status)').order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => setRows(data ?? []));
  }, []);
  const list = rows.filter((r) => (!q || `${r.name} ${r.products?.title}`.toLowerCase().includes(q.toLowerCase())) && (!status || r.status === status));
  return (
    <div className="stack">
      <div className="page-head"><h1>Campanhas</h1><Link className="btn primary" to="/nova">+ Nova campanha</Link></div>
      <div className="row"><input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 220 }}><option value="">Todos os estados</option>{Object.entries(CAMPAIGN_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="card">
        {!list.length ? <div className="empty">Nenhuma campanha. <Link to="/nova">Criar a primeira</Link></div> : (
          <table><thead><tr><th>Campanha</th><th>Estado</th><th>Publicações</th><th>Criada</th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/campanhas/${r.id}`}><b>{r.name}</b></Link>{r.is_demo && <span className="badge t-violet" style={{ marginLeft: 6 }}>DEMO</span>}<div className="small muted">{r.products?.title}</div></td>
                <td><span className="badge t-blue">{CAMPAIGN_STATUS[r.status]}</span>{r.approval_status !== 'approved' && <div className="small muted">aprovação pendente</div>}</td>
                <td className="row">{(r.publications ?? []).slice(0, 6).map((p: any, i: number) => <span key={i} title={PLATFORMS[p.platform as PlatformCode].name}><StatusBadge s={p.status} /> <span className="small">{PLATFORMS[p.platform as PlatformCode].name}</span></span>)}</td>
                <td className="small">{fmtDate(r.created_at, profile.timezone)}</td>
              </tr>))}</tbody></table>)}
      </div>
    </div>
  );
}
