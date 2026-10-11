import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, api, oauthStart, errMsg } from '../lib/supabase';
import { PLATFORMS, PLATFORM_ORDER, AUTO_STATUS_LABEL, LINK_PLACEMENT_LABEL, type PlatformCode } from '../../supabase/functions/_shared/platforms.ts';
import { fmtDate } from '../lib/labels';
import { useApp } from '../App';
import { CopyButton, Msg } from '../components/ui';

const PROVIDER: Record<string, string> = { facebook: 'meta', instagram: 'meta', tiktok: 'tiktok', youtube: 'google', pinterest: 'pinterest', mercadolivre: 'mercadolivre' };

export default function Integrations() {
  const { profile } = useApp();
  const [sp] = useSearchParams();
  const [status, setStatus] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [msg, setMsg] = useState<any>(sp.get('erro') ? { t: 'err', m: sp.get('erro') } : sp.get('ok') ? { t: 'ok', m: `Conectado (${sp.get('contas')} conta(s)). Use "Testar" para confirmar.` } : null);
  const [tg, setTg] = useState({ bot_token: '', chat_id: '' });
  const [busy, setBusy] = useState('');
  const [boards, setBoards] = useState<Record<string, any[]>>({});

  const load = async () => {
    const { data } = await supabase.from('connected_accounts').select('*').order('platform');
    setAccounts(data ?? []);
  };
  useEffect(() => { load(); api('integrations', { action: 'status' }).then(setStatus).catch((e) => setMsg({ t: 'err', m: errMsg(e) })); }, []);

  const run = async (label: string, fn: () => Promise<any>) => { setBusy(label); setMsg(null); try { await fn(); await load(); } catch (e) { setMsg({ t: 'err', m: errMsg(e) }); } finally { setBusy(''); } };
  const connect = (provider: string) => run('Abrindo autorização…', async () => { window.location.href = await oauthStart(provider); });
  const test = (a: any) => run('Testando…', async () => { const r = await api<any>('integrations', { action: 'test', account_id: a.id }); setMsg({ t: r.ok ? 'ok' : 'err', m: r.detail }); });
  const disconnect = (a: any) => run('Desconectando…', async () => {
    if (!confirm(`Desconectar ${a.display_name}? Os tokens serão apagados. Para revogar o acesso também na plataforma, remova o app nas configurações de segurança da sua conta.`)) return;
    const { error } = await supabase.from('connected_accounts').delete().eq('id', a.id); if (error) throw error;
  });
  const setMeta = (a: any, meta: any) => run('Salvando…', async () => { await api('integrations', { action: 'set_meta', account_id: a.id, meta }); });
  const loadBoards = (a: any) => run('Buscando pastas…', async () => { const r = await api<any>('integrations', { action: 'pinterest_boards', account_id: a.id }); setBoards({ ...boards, [a.id]: r.boards }); });
  const connectTg = () => run('Verificando bot…', async () => { const r = await api<any>('integrations', { action: 'connect_telegram', ...tg }); setMsg({ t: 'ok', m: r.detail }); setTg({ bot_token: '', chat_id: '' }); });

  const card = (code: PlatformCode | 'mercadolivre') => {
    const cap = code === 'mercadolivre' ? null : PLATFORMS[code];
    const accs = accounts.filter((a) => a.platform === code);
    const prov = PROVIDER[code];
    const configured = prov ? status?.providers?.[prov] : true;
    return (
      <div key={code} className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{cap ? cap.name : 'Mercado Livre (dados de produto)'}</h2>
          {cap && <span className="badge t-gray">{AUTO_STATUS_LABEL[cap.autoStatus]}</span>}
        </div>
        <div className="small muted">{cap ? cap.autoNote : 'Opcional: preenche título, preço, imagem e atributos pela API oficial de itens. Não gera links de afiliado (não há API oficial para isso).'}</div>
        {cap && <div className="small"><b>Link:</b> {LINK_PLACEMENT_LABEL[cap.linkPlacement].label}</div>}
        {cap && <div className="small"><b>Requisitos:</b> {cap.accountRequirement} <b>Aprovação:</b> {cap.approval}</div>}

        {accs.map((a) => (
          <div key={a.id} className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div><b>{a.display_name}</b> <span className={`badge ${a.status === 'connected' ? 't-green' : 't-red'}`}>{{ connected: 'Conectada', expired: 'Expirada', revoked: 'Revogada', error: 'Erro' }[a.status as string]}</span>
                <div className="small muted">Sincronizada {fmtDate(a.last_sync_at, profile.timezone)}{a.last_test_at && ` · testada ${fmtDate(a.last_test_at, profile.timezone)}`}</div>
                {a.scopes?.length > 0 && <div className="small muted">Permissões: {a.scopes.join(', ')}</div>}
                {a.last_test_result && <div className="small">{a.last_test_result}</div>}
              </div>
              <div className="row"><button onClick={() => test(a)}>Testar</button>{prov && <button onClick={() => connect(prov)}>Reconectar</button>}<button className="danger" onClick={() => disconnect(a)}>Desconectar</button></div>
            </div>
            {(code === 'tiktok' || code === 'youtube') && (
              <label className="check small" style={{ marginTop: 8 }}><input type="checkbox" checked={!!a.meta?.audited} onChange={(e) => setMeta(a, { audited: e.target.checked })} /> Meu app/projeto já foi aprovado na auditoria da plataforma (permite publicação pública)</label>
            )}
            {code === 'pinterest' && (
              <div className="stack small" style={{ marginTop: 8 }}>
                <label className="check"><input type="checkbox" checked={a.meta?.sandbox === false} onChange={(e) => setMeta(a, { sandbox: !e.target.checked })} /> Meu app tem acesso padrão (produção). Desmarcado = sandbox.</label>
                <div className="row">Pasta: <b>{a.meta?.board_name ?? 'não escolhida'}</b><button onClick={() => loadBoards(a)}>Escolher pasta</button>
                  {boards[a.id] && <select onChange={(e) => { const b = boards[a.id].find((x) => x.id === e.target.value); if (b) setMeta(a, { board_id: b.id, board_name: b.name }); }} defaultValue=""><option value="">Selecione…</option>{boards[a.id].map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
                </div>
              </div>
            )}
          </div>
        ))}

        {code === 'telegram' ? (
          <div className="stack">
            <div className="grid g2">
              <div><label>Token do bot</label><input type="password" value={tg.bot_token} onChange={(e) => setTg({ ...tg, bot_token: e.target.value })} placeholder="123456:ABC…" autoComplete="off" /></div>
              <div><label>Canal ou chat</label><input value={tg.chat_id} onChange={(e) => setTg({ ...tg, chat_id: e.target.value })} placeholder="@meucanal ou -100…" /></div>
            </div>
            <div className="small muted">Crie o bot no @BotFather, adicione-o como administrador do canal com permissão de publicar. O token fica criptografado no servidor.</div>
            <div><button className="primary" onClick={connectTg} disabled={!tg.bot_token || !tg.chat_id}>Conectar Telegram</button></div>
          </div>
        ) : code === 'whatsapp' ? (
          <div className="alert info small">Sem conexão necessária. Na campanha, use "Abrir no WhatsApp" ou baixe a arte para Status, grupos e canais.</div>
        ) : prov && (
          configured
            ? <div><button className="primary" onClick={() => connect(prov)}>{accs.length ? 'Conectar outra conta' : 'Conectar com login oficial'}</button></div>
            : <div className="alert warn small">Pendente de credenciais: o app de desenvolvedor ainda não foi configurado no servidor. Veja docs/INTEGRACOES.md (variáveis {({ meta: 'META_APP_ID/SECRET', tiktok: 'TIKTOK_CLIENT_KEY/SECRET', google: 'GOOGLE_CLIENT_ID/SECRET', pinterest: 'PINTEREST_APP_ID/SECRET', mercadolivre: 'ML_CLIENT_ID/SECRET' } as any)[prov]}).</div>
        )}
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Integrações</h1><div className="muted">Conexões oficiais (OAuth ou token do bot). Nenhuma senha de rede social é pedida ou guardada.</div></div></div>
      <Msg m={msg} />{busy && <div className="alert info">{busy}</div>}
      {status && <div className="card small">URL de redirecionamento OAuth para cadastrar nos apps de desenvolvedor: <code>{status.oauth_redirect}</code> <CopyButton text={status.oauth_redirect} /></div>}
      <div className="grid g2">{[...PLATFORM_ORDER, 'mercadolivre' as const].map(card)}</div>
    </div>
  );
}
