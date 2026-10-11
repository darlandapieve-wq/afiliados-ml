import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PUB_STATUS, fmtDate } from '../lib/labels';
import { useApp } from '../App';
import { PLATFORMS, type PlatformCode } from '../../supabase/functions/_shared/platforms.ts';
import { StatusBadge } from '../components/ui';

type View = 'month' | 'week' | 'day';
const DAY = 86400e3;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function Calendar() {
  const { profile } = useApp();
  const [view, setView] = useState<View>('month');
  const [ref, setRef] = useState(startOfDay(new Date()));
  const [pubs, setPubs] = useState<any[]>([]);

  let from: Date, to: Date;
  if (view === 'month') {
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    from = new Date(first.getTime() - first.getDay() * DAY);
    to = new Date(from.getTime() + 42 * DAY);
  } else if (view === 'week') {
    from = new Date(ref.getTime() - ref.getDay() * DAY); to = new Date(from.getTime() + 7 * DAY);
  } else { from = ref; to = new Date(ref.getTime() + DAY); }

  useEffect(() => {
    supabase.from('publications').select('id, platform, status, mode, scheduled_at, campaign_id, campaigns(name)')
      .gte('scheduled_at', from.toISOString()).lt('scheduled_at', to.toISOString()).order('scheduled_at')
      .then(({ data }) => setPubs(data ?? []));
  }, [view, ref.getTime()]);

  const move = (dir: number) => {
    const d = new Date(ref);
    if (view === 'month') d.setMonth(d.getMonth() + dir); else d.setDate(d.getDate() + dir * (view === 'week' ? 7 : 1));
    setRef(startOfDay(d));
  };
  const days = Array.from({ length: Math.round((to.getTime() - from.getTime()) / DAY) }, (_, i) => new Date(from.getTime() + i * DAY));
  const todayKey = startOfDay(new Date()).getTime();
  const tone = (s: string) => `t-${PUB_STATUS[s]?.tone ?? 'gray'}`;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Calendário</h1>
        <div className="row">
          {(['day', 'week', 'month'] as View[]).map((v) => <button key={v} className={view === v ? 'primary' : ''} onClick={() => setView(v)}>{{ day: 'Dia', week: 'Semana', month: 'Mês' }[v]}</button>)}
          <button onClick={() => move(-1)}>‹</button><button onClick={() => setRef(startOfDay(new Date()))}>Hoje</button><button onClick={() => move(1)}>›</button>
        </div>
      </div>
      <div className="muted">{view === 'month' ? ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : `${from.toLocaleDateString('pt-BR')} – ${new Date(to.getTime() - DAY).toLocaleDateString('pt-BR')}`} · fuso {profile.timezone}</div>

      {view === 'day' ? (
        <div className="card">{!pubs.length ? <div className="empty">Nada neste dia.</div> : <table><tbody>{pubs.map((p) => (
          <tr key={p.id}><td>{fmtDate(p.scheduled_at, profile.timezone).slice(-5)}</td><td><Link to={`/campanhas/${p.campaign_id}`}>{p.campaigns?.name}</Link></td><td>{PLATFORMS[p.platform as PlatformCode].name} · {p.mode === 'auto' ? 'automático' : 'assistido'}</td><td><StatusBadge s={p.status} /></td></tr>))}</tbody></table>}</div>
      ) : (
        <>
          <div className="cal">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="small muted" style={{ textAlign: 'center' }}>{d}</div>)}</div>
          <div className="cal">{days.map((d) => {
            const items = pubs.filter((p) => startOfDay(new Date(p.scheduled_at)).getTime() === d.getTime());
            return (
              <div key={d.getTime()} className={`d ${view === 'month' && d.getMonth() !== ref.getMonth() ? 'out' : ''} ${d.getTime() === todayKey ? 'today' : ''}`} style={view === 'week' ? { minHeight: 260 } : undefined}>
                <div className="row" style={{ justifyContent: 'space-between' }}><b>{d.getDate()}</b><a href="#" className="small" onClick={(e) => { e.preventDefault(); setRef(d); setView('day'); }}>ver</a></div>
                {items.slice(0, view === 'week' ? 12 : 4).map((p) => (
                  <Link key={p.id} to={`/campanhas/${p.campaign_id}`} className={`ev badge ${tone(p.status)}`} title={`${p.campaigns?.name} — ${PUB_STATUS[p.status]?.label}`}>
                    {new Date(p.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: profile.timezone })} {PLATFORMS[p.platform as PlatformCode].name}
                  </Link>))}
                {items.length > (view === 'week' ? 12 : 4) && <div className="small muted">+{items.length - 4}</div>}
              </div>
            );
          })}</div>
        </>
      )}
      <div className="small muted">Para reagendar, cancelar ou pausar, abra a campanha. A execução é feita pelo servidor a cada minuto.</div>
    </div>
  );
}
