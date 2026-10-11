import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errMsg } from '../lib/supabase';
import { fmtDate } from '../lib/labels';
import { formatBRL } from '../../supabase/functions/_shared/text.ts';
import { CopyButton, Msg } from '../components/ui';
import { productImageSrc } from '../lib/campaign';
import { useApp } from '../App';

export default function Products() {
  const { profile } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState<any>(null);
  const load = () => supabase.from('products').select('*, affiliate_links(id, url, validation_status, created_at, source), campaigns(id)').order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const del = async (p: any) => {
    if (!confirm(`Excluir "${p.title}"?`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    setMsg(error ? { t: 'err', m: error.message.includes('foreign') ? 'Este produto tem campanhas; arquive-as ou exclua-as primeiro.' : errMsg(error) } : { t: 'ok', m: 'Produto excluído.' });
    load();
  };
  const updatePrice = async (p: any) => {
    const v = prompt('Preço conferido agora no Mercado Livre (R$):', p.price ?? '');
    if (v === null) return;
    const n = v.trim() ? Number(v.replace(',', '.')) : null;
    if (n != null && !Number.isFinite(n)) return setMsg({ t: 'err', m: 'Valor inválido.' });
    await supabase.from('products').update({ price: n, price_checked_at: n != null ? new Date().toISOString() : null, price_source: 'manual' }).eq('id', p.id);
    load();
  };
  return (
    <div className="stack">
      <div className="page-head"><h1>Produtos</h1><Link className="btn primary" to="/nova">+ Novo produto</Link></div>
      <Msg m={msg} />
      <div className="grid g2">{rows.map((p) => {
        const img = productImageSrc(p);
        return (
          <div key={p.id} className="card stack">
            <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              {img && <img src={img} alt="" style={{ width: 84, height: 84, objectFit: 'contain', borderRadius: 8, background: '#fff', border: '1px solid var(--border)' }} />}
              <div><b>{p.title}</b>{p.is_demo && <span className="badge t-violet" style={{ marginLeft: 6 }}>DEMO</span>}
                <div className="small muted">{p.category ?? 'Sem categoria'} · {p.campaigns?.length ?? 0} campanha(s) · dados: {p.data_source === 'ml_api' ? 'API oficial' : 'manual'}</div>
                <div className="small">{p.price != null ? <>{formatBRL(p.price)} <span className="muted">(visto em {fmtDate(p.price_checked_at, profile.timezone)})</span></> : <span className="muted">Preço não informado</span>}</div>
              </div>
            </div>
            {(p.affiliate_links ?? []).map((l: any) => (
              <div key={l.id} className="small"><span className={`badge ${l.validation_status === 'valid' ? 't-green' : 't-amber'}`}>{l.validation_status === 'valid' ? 'Afiliado' : 'Conferir'}</span> <code style={{ wordBreak: 'break-all' }}>{l.url}</code> <CopyButton text={l.url} /></div>
            ))}
            <div className="row">
              <Link className="btn primary" to={`/nova?produto=${p.id}`}>Nova campanha</Link>
              <button onClick={() => updatePrice(p)}>Atualizar preço</button>
              {p.original_url && <a className="btn" href={p.original_url} target="_blank" rel="noreferrer">Abrir anúncio ↗</a>}
              <button className="danger" onClick={() => del(p)}>Excluir</button>
            </div>
          </div>
        );
      })}</div>
      {!rows.length && <div className="empty">Nenhum produto salvo.</div>}
    </div>
  );
}
