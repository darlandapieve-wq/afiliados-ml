import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewCampaign from './pages/NewCampaign';
import Campaigns from './pages/Campaigns';
import CampaignDetail from './pages/CampaignDetail';
import Products from './pages/Products';
import Calendar from './pages/Calendar';
import Integrations from './pages/Integrations';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import TikTokShop from './pages/TikTokShop';
import TikTokShopDetail from './pages/TikTokShopDetail';
import Landing from './pages/Landing';
import Privacy from './pages/Privacy';
import { PrivacyPolicy, DataDeletion } from './pages/PublicPolicy';

export interface Profile {
  id: string; display_name: string | null; timezone: string;
  brand: { primary: string; secondary: string; text: string; font: string; logo_path: string | null; handle: string | null };
  settings: { approval_required: boolean; auto_publish: Record<string, boolean>; max_posts_per_day: number; min_minutes_between_posts: number; bio_link_url: string | null };
  privacy_accepted_at: string | null;
}

interface Ctx { session: Session; profile: Profile; reloadProfile: () => Promise<void> }
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

function Shell({ children }: { children: ReactNode }) {
  const nav = [
    ['/', 'Painel'], ['/nova', '+ Nova campanha'], ['/campanhas', 'Campanhas'], ['/produtos', 'Produtos'],
    ['/tiktok-shop', 'TikTok Shop'], ['/calendario', 'Calendário'], ['/integracoes', 'Integrações'], ['/relatorios', 'Relatórios'], ['/configuracoes', 'Configurações'],
  ];
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><span>ML</span> Afiliados</div>
        {nav.map(([to, l]) => <NavLink key={to} to={to} end={to === '/'}>{l}</NavLink>)}
        <div className="spacer" />
        <NavLink to="/privacidade">Privacidade</NavLink>
        <a href="#" onClick={(e) => { e.preventDefault(); supabase.auth.signOut(); }}>Sair</a>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function Authed() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const loc = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const reloadProfile = async () => {
    const { data } = await supabase.from('profiles').select('*').single();
    setProfile(data as Profile);
  };
  useEffect(() => { if (session) reloadProfile(); else setProfile(null); }, [session?.user.id]);

  if (session === undefined) return <div className="empty">Carregando…</div>;
  if (!session) return <Login />;
  if (!profile) return <div className="empty">Carregando perfil…</div>;
  if (!profile.privacy_accepted_at && loc.pathname !== '/privacidade') return <Navigate to="/privacidade" replace />;

  return (
    <AppCtx.Provider value={{ session, profile, reloadProfile }}>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/nova" element={<NewCampaign />} />
          <Route path="/campanhas" element={<Campaigns />} />
          <Route path="/campanhas/:id" element={<CampaignDetail />} />
          <Route path="/produtos" element={<Products />} />
          <Route path="/tiktok-shop" element={<TikTokShop />} />
          <Route path="/tiktok-shop/:id" element={<TikTokShopDetail />} />
          <Route path="/calendario" element={<Calendar />} />
          <Route path="/integracoes" element={<Integrations />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/configuracoes" element={<Settings />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Shell>
    </AppCtx.Provider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/p/:slug" element={<Landing />} />
        <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
        <Route path="/exclusao-de-dados" element={<DataDeletion />} />
        <Route path="/*" element={<Authed />} />
      </Routes>
    </BrowserRouter>
  );
}
