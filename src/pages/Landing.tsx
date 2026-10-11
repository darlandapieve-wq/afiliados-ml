import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/** Página intermediária pública. O botão usa o link de afiliado exatamente como cadastrado. */
export default function Landing() {
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const [d, setD] = useState<any>(undefined);
  const [going, setGoing] = useState(false);

  useEffect(() => {
    supabase.rpc('get_landing', { p_slug: slug }).then(({ data }) => {
      setD(data ?? null);
      if (data?.title) document.title = data.title;
    });
  }, [slug]);

  const go = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Registra o clique e segue para o mesmo URL do href (sem alterá-lo). Falha no registro não bloqueia.
    e.preventDefault();
    if (going) return;
    setGoing(true);
    const via = sp.get('via');
    await Promise.race([
      supabase.rpc('register_click', { p_slug: slug, p_platform: via, p_referrer: document.referrer || null }),
      new Promise((r) => setTimeout(r, 1200)),
    ]).catch(() => {});
    window.location.href = d.affiliate_url;
  };

  if (d === undefined) return <div className="empty">Carregando…</div>;
  if (!d) return <div className="landing"><div className="card">Página não encontrada ou desativada.</div></div>;
  return (
    <div className="landing">
      <div className="card stack" style={{ textAlign: 'center' }}>
        {d.is_demo && <div className="badge t-violet">DEMONSTRAÇÃO</div>}
        {d.image && <img src={d.image} alt={d.title} style={{ width: '100%', borderRadius: 12 }} />}
        <h1>{d.title}</h1>
        {d.features?.length > 0 && <ul style={{ textAlign: 'left' }}>{d.features.slice(0, 6).map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>}
        <a className="btn primary big" style={{ justifyContent: 'center' }} href={d.affiliate_url} onClick={go} rel="sponsored noopener">Ver produto no Mercado Livre</a>
        <div className="small muted">Você será levado ao site oficial do Mercado Livre. Preço, estoque e condições são os exibidos lá.</div>
        <div className="small muted">Publicidade: este é um link de afiliado. Posso receber comissão por compras feitas por ele, sem custo extra para você.</div>
      </div>
    </div>
  );
}
