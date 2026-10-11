import { useEffect, useState } from 'react';
import { supabase, errMsg } from '../lib/supabase';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'newpass'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') setMode('newpass'); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        if (password.length < 10) throw new Error('Use uma senha com pelo menos 10 caracteres.');
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setMsg({ t: 'ok', m: 'Conta criada. Confirme pelo link enviado ao seu e-mail.' });
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setMsg({ t: 'ok', m: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.' });
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMsg({ t: 'ok', m: 'Senha alterada.' });
      }
    } catch (e) { setMsg({ t: 'err', m: errMsg(e) }); } finally { setBusy(false); }
  }

  return (
    <div className="landing">
      <div className="card stack">
        <h1>ML Afiliados</h1>
        <p className="muted">Campanhas de divulgação do Programa de Afiliados do Mercado Livre.</p>
        <form className="stack" onSubmit={submit}>
          {mode !== 'newpass' && (<div><label>E-mail</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>)}
          {mode !== 'reset' && (<div><label>{mode === 'newpass' ? 'Nova senha' : 'Senha'}</label><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div>)}
          <button className="primary big" disabled={busy}>{{ login: 'Entrar', signup: 'Criar conta', reset: 'Enviar link', newpass: 'Salvar senha' }[mode]}</button>
        </form>
        {msg && <div className={`alert ${msg.t}`}>{msg.m}</div>}
        <div className="row small">
          {mode !== 'login' && <a href="#" onClick={() => setMode('login')}>Entrar</a>}
          {mode !== 'signup' && <a href="#" onClick={() => setMode('signup')}>Criar conta</a>}
          {mode !== 'reset' && <a href="#" onClick={() => setMode('reset')}>Esqueci a senha</a>}
        </div>
      </div>
    </div>
  );
}
