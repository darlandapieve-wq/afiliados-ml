import { useState } from 'react';
import { useApp } from '../App';
import { supabase } from '../lib/supabase';

export default function Privacy() {
  const { profile, reloadProfile } = useApp();
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    await supabase.from('profiles').update({ privacy_accepted_at: new Date().toISOString() }).eq('id', profile.id);
    await reloadProfile(); setBusy(false);
  };
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>Aviso de privacidade (LGPD)</h1>
      <div className="card stack">
        <p><b>Quem trata os dados:</b> o titular desta instalação (você), usando Supabase (banco de dados e arquivos, região São Paulo) como operador.</p>
        <p><b>Dados tratados:</b> seu e-mail de login; produtos, textos, artes e links de afiliado que você cadastra; identificadores e tokens das contas que você conectar (Facebook, Instagram, TikTok, YouTube, Pinterest, Telegram, Mercado Livre); registros de execução das publicações; e cliques anônimos na página intermediária (data, rede de origem informada no link e site de referência — sem IP, sem cookies de rastreamento).</p>
        <p><b>Finalidade:</b> preparar, agendar e publicar campanhas de divulgação e exibir relatórios. Base legal: execução do serviço solicitado pelo titular (art. 7º, V) e legítimo interesse para segurança e prevenção de abuso (art. 7º, IX).</p>
        <p><b>Segurança:</b> senhas de redes sociais nunca são solicitadas nem armazenadas. A conexão usa OAuth ou tokens oficiais, guardados criptografados (AES-256-GCM) e acessíveis apenas pelo servidor. Cada usuário só acessa os próprios dados (Row Level Security).</p>
        <p><b>Compartilhamento:</b> o conteúdo só é enviado às plataformas que você conectar, quando você agenda ou publica. Textos só vão para um provedor de IA se você ativar essa opção.</p>
        <p><b>Seus direitos:</b> em Configurações você pode exportar seus dados, desconectar integrações e excluir definitivamente a conta e todos os arquivos.</p>
        <p><b>Retenção:</b> os dados ficam armazenados até você excluí-los. Tarefas concluídas da fila são apagadas após 90 dias.</p>
        {!profile.privacy_accepted_at
          ? <button className="primary big" onClick={accept} disabled={busy}>Li e concordo</button>
          : <div className="alert ok">Aceito em {new Date(profile.privacy_accepted_at).toLocaleString('pt-BR')}.</div>}
      </div>
    </div>
  );
}
