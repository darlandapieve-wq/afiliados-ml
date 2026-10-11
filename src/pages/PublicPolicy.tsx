// Páginas públicas exigidas pelas plataformas (Meta, TikTok, Google): política de privacidade e exclusão de dados.
export function PrivacyPolicy() {
  return (
    <div className="landing" style={{ maxWidth: 820 }}>
      <div className="card stack">
        <h1>Política de Privacidade — ML Afiliados</h1>
        <p className="muted small">Última atualização: 11/10/2026</p>
        <p><b>Quem somos.</b> O ML Afiliados é uma ferramenta de uso pessoal do seu titular para preparar, agendar e publicar campanhas de divulgação de produtos do Programa de Afiliados do Mercado Livre nas redes sociais do próprio titular.</p>
        <p><b>Dados que coletamos.</b> E-mail de login; produtos, textos, imagens e links cadastrados pelo usuário; identificadores, nomes e tokens de acesso das contas que o usuário conectar (Facebook, Instagram, TikTok, YouTube, Pinterest, Telegram, Mercado Livre); registros de publicação; e cliques anônimos na página intermediária (data, rede de origem informada no link e site de referência, sem endereço IP).</p>
        <p><b>Dados recebidos da Meta (Facebook/Instagram).</b> Lista de Páginas que o usuário administra, ID e nome de usuário da conta profissional do Instagram vinculada, e tokens de acesso da Página. Esses dados são usados exclusivamente para publicar o conteúdo que o próprio usuário criou e aprovou, e para confirmar o resultado da publicação. Não lemos mensagens, seguidores ou dados de terceiros e não vendemos nem compartilhamos dados com terceiros.</p>
        <p><b>Finalidade e base legal (LGPD).</b> Execução do serviço solicitado pelo titular (art. 7º, V) e legítimo interesse para segurança e prevenção de abuso (art. 7º, IX).</p>
        <p><b>Armazenamento e segurança.</b> Dados hospedados no Supabase (região São Paulo). Tokens são criptografados (AES-256-GCM) e acessíveis apenas pelo servidor. Senhas de redes sociais nunca são solicitadas nem armazenadas.</p>
        <p><b>Retenção.</b> Os dados ficam armazenados até o usuário excluí-los ou desconectar a integração.</p>
        <p><b>Seus direitos.</b> Acesso, correção, exportação e exclusão dos dados, a qualquer momento, pelo próprio aplicativo (Configurações) ou pelo contato abaixo. Veja também <a href="/exclusao-de-dados">Instruções de exclusão de dados</a>.</p>
        <p><b>Contato.</b> darlan.dapieve@ifpr.edu.br</p>
      </div>
    </div>
  );
}

export function DataDeletion() {
  return (
    <div className="landing" style={{ maxWidth: 820 }}>
      <div className="card stack">
        <h1>Instruções de exclusão de dados</h1>
        <p>Para excluir seus dados do ML Afiliados:</p>
        <ol>
          <li>Entre no aplicativo e abra <b>Configurações › Excluir conta e todos os dados</b>. A exclusão é imediata e remove produtos, campanhas, imagens, tokens e registros.</li>
          <li>Para remover apenas a conexão com Facebook/Instagram: <b>Integrações › Desconectar</b> (os tokens são apagados). Você também pode remover o app em Facebook › Configurações › Segurança e login › Integrações comerciais.</li>
          <li>Se não conseguir acessar, envie um e-mail para <b>darlan.dapieve@ifpr.edu.br</b> com o assunto "Exclusão de dados — ML Afiliados". Atendemos em até 15 dias.</li>
        </ol>
      </div>
    </div>
  );
}
