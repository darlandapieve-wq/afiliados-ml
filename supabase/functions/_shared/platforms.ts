// Matriz de recursos por plataforma — fonte única para frontend e worker.
// Revisada em 10/10/2026 com base na documentação oficial (ver docs/MATRIZ-PLATAFORMAS.md).

export type PlatformCode =
  | 'facebook' | 'instagram' | 'tiktok' | 'whatsapp' | 'pinterest' | 'youtube' | 'telegram';

/** Onde o link de afiliado fica e se ele é realmente clicável. */
export type LinkPlacement =
  | 'clickable_post'     // URL clicável no texto da publicação
  | 'button'             // botão com URL (ex.: botão inline do Telegram)
  | 'pin_link'           // link de destino do Pin (clicável)
  | 'message_link'       // URL clicável em mensagem (WhatsApp/Telegram)
  | 'bio'                // não clicável na legenda: usar link na bio / página intermediária
  | 'assisted_only';     // sem publicação automática

export const LINK_PLACEMENT_LABEL: Record<LinkPlacement, { label: string; clickable: boolean }> = {
  clickable_post: { label: 'Link clicável na publicação', clickable: true },
  button: { label: 'Link em botão clicável', clickable: true },
  pin_link: { label: 'Link de destino do Pin (clicável)', clickable: true },
  message_link: { label: 'Link clicável na mensagem', clickable: true },
  bio: { label: 'Não clicável na legenda — usar link na bio ou página intermediária', clickable: false },
  assisted_only: { label: 'Compartilhamento assistido (sem publicação automática)', clickable: false },
};

export type AutoStatus =
  | 'available'            // funciona assim que a conta for conectada
  | 'own_account_dev'      // funciona para contas próprias com o app em acesso padrão (sem App Review)
  | 'private_until_audit'  // API publica, mas fica PRIVADO até a auditoria da plataforma
  | 'sandbox_until_review' // só ambiente de teste até aprovação
  | 'none';                // não há API oficial adequada

export interface PlatformCapabilities {
  code: PlatformCode;
  name: string;
  autoStatus: AutoStatus;
  autoNote: string;
  images: boolean;
  video: boolean;
  requiresVideo: boolean;
  imageMime: 'image/jpeg' | 'image/png';
  linkPlacement: LinkPlacement;
  nativeScheduling: boolean;
  limits: { caption: number; title?: number; hashtags?: number; postsPerDay?: number };
  accountRequirement: string;
  permissions: string[];
  approval: string;
  verifyMethod: string;
  assisted: string;
  costs: string;
  recommendedTemplates: TemplateCode[];
}

export type TemplateCode = 'square' | 'portrait' | 'story' | 'pin' | 'thumb' | 'share';

export const TEMPLATES: Record<TemplateCode, { label: string; w: number; h: number }> = {
  square: { label: 'Post quadrado', w: 1080, h: 1080 },
  portrait: { label: 'Post vertical (4:5)', w: 1080, h: 1350 },
  story: { label: 'Story / Reels / Shorts (9:16)', w: 1080, h: 1920 },
  pin: { label: 'Pinterest Pin (2:3)', w: 1000, h: 1500 },
  thumb: { label: 'Miniatura de vídeo (16:9)', w: 1280, h: 720 },
  share: { label: 'WhatsApp / Telegram', w: 1200, h: 1200 },
};

export const PLATFORMS: Record<PlatformCode, PlatformCapabilities> = {
  telegram: {
    code: 'telegram', name: 'Telegram', autoStatus: 'available',
    autoNote: 'Bot API oficial: publica em canais/grupos onde o bot é administrador.',
    images: true, video: true, requiresVideo: false, imageMime: 'image/png',
    linkPlacement: 'button', nativeScheduling: false,
    limits: { caption: 1024 },
    accountRequirement: 'Bot criado no @BotFather e adicionado como administrador do canal.',
    permissions: ['Administrador do canal com "Publicar mensagens"'],
    approval: 'Nenhuma.', verifyMethod: 'Resposta da API contém message_id.',
    assisted: 'Copiar texto e imagem ou abrir t.me/share.', costs: 'Gratuito.',
    recommendedTemplates: ['share', 'square'],
  },
  facebook: {
    code: 'facebook', name: 'Facebook', autoStatus: 'own_account_dev',
    autoNote: 'Graph API publica em Páginas que você administra. Para as suas Páginas, o app Meta funciona em acesso padrão sem App Review.',
    images: true, video: true, requiresVideo: false, imageMime: 'image/jpeg',
    linkPlacement: 'clickable_post', nativeScheduling: true,
    limits: { caption: 63206 },
    accountRequirement: 'Página do Facebook (não perfil pessoal) e app Meta em que você tem função de administrador.',
    permissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
    approval: 'Somente para Páginas de terceiros: App Review + verificação da empresa.',
    verifyMethod: 'GET /{post-id}?fields=permalink_url', assisted: 'Abrir compartilhador do Facebook com o link.',
    costs: 'Gratuito.', recommendedTemplates: ['square', 'portrait'],
  },
  instagram: {
    code: 'instagram', name: 'Instagram', autoStatus: 'own_account_dev',
    autoNote: 'Content Publishing API: posts, carrosséis, Reels e Stories (Stories só em contas Business). Figurinha de link NÃO é suportada pela API.',
    images: true, video: true, requiresVideo: false, imageMime: 'image/jpeg',
    linkPlacement: 'bio', nativeScheduling: false,
    limits: { caption: 2200, hashtags: 30, postsPerDay: 100 },
    accountRequirement: 'Conta profissional (Comercial ou Criador) vinculada a uma Página do Facebook.',
    permissions: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'],
    approval: 'Somente para contas de terceiros: App Review.',
    verifyMethod: 'Status do contêiner (FINISHED) + media_publish + permalink.',
    assisted: 'Baixar a arte, copiar a legenda e publicar pelo app; link na bio.',
    costs: 'Gratuito.', recommendedTemplates: ['portrait', 'square', 'story'],
  },
  tiktok: {
    code: 'tiktok', name: 'TikTok', autoStatus: 'private_until_audit',
    autoNote: 'Content Posting API publica fotos e vídeos, mas apps não auditados só publicam como PRIVADO (contas privadas, até 5 usuários/24h).',
    images: true, video: true, requiresVideo: false, imageMime: 'image/jpeg',
    linkPlacement: 'bio', nativeScheduling: false,
    limits: { caption: 4000, title: 90 },
    accountRequirement: 'Conta TikTok; app no TikTok for Developers com Login Kit + Content Posting API.',
    permissions: ['user.info.basic', 'video.publish'],
    approval: 'Auditoria do TikTok para publicação pública. Fotos exigem verificação do prefixo de URL das imagens.',
    verifyMethod: 'POST /v2/post/publish/status/fetch/ até PUBLISH_COMPLETE.',
    assisted: 'Baixar vídeo/fotos e publicar pelo app; link na bio.',
    costs: 'Gratuito.', recommendedTemplates: ['story'],
  },
  youtube: {
    code: 'youtube', name: 'YouTube Shorts', autoStatus: 'private_until_audit',
    autoNote: 'videos.insert funciona, mas projetos não auditados têm todos os uploads travados como PRIVADO. Links na descrição de Shorts não são clicáveis.',
    images: false, video: true, requiresVideo: true, imageMime: 'image/png',
    linkPlacement: 'bio', nativeScheduling: true,
    limits: { caption: 5000, title: 100, postsPerDay: 100 },
    accountRequirement: 'Canal do YouTube; projeto Google Cloud com YouTube Data API v3.',
    permissions: ['https://www.googleapis.com/auth/youtube.upload'],
    approval: 'Auditoria de conformidade da YouTube API para vídeos públicos; verificação OAuth do Google.',
    verifyMethod: 'videos.list?part=status,processingDetails',
    assisted: 'Baixar o vídeo vertical e enviar pelo app do YouTube.',
    costs: 'Gratuito (cota padrão).', recommendedTemplates: ['story', 'thumb'],
  },
  pinterest: {
    code: 'pinterest', name: 'Pinterest', autoStatus: 'sandbox_until_review',
    autoNote: 'API v5 cria Pins com link de destino. Com acesso de teste (trial) a escrita é feita no sandbox; produção exige acesso padrão.',
    images: true, video: true, requiresVideo: false, imageMime: 'image/png',
    linkPlacement: 'pin_link', nativeScheduling: false,
    limits: { caption: 800, title: 100 },
    accountRequirement: 'Conta empresarial do Pinterest e pasta (board) de destino.',
    permissions: ['boards:read', 'pins:read', 'pins:write'],
    approval: 'Upgrade de trial para acesso padrão (revisão do app).',
    verifyMethod: 'GET /v5/pins/{id}', assisted: 'Abrir pinterest.com/pin/create com imagem e link.',
    costs: 'Gratuito.', recommendedTemplates: ['pin'],
  },
  whatsapp: {
    code: 'whatsapp', name: 'WhatsApp', autoStatus: 'none',
    autoNote: 'A WhatsApp Business Platform não publica em Status, grupos ou Canais. Somente compartilhamento assistido.',
    images: true, video: true, requiresVideo: false, imageMime: 'image/png',
    linkPlacement: 'message_link', nativeScheduling: false,
    limits: { caption: 4096 },
    accountRequirement: 'Nenhuma (compartilhamento pelo seu WhatsApp).',
    permissions: [], approval: 'Não se aplica.', verifyMethod: 'Confirmação manual do usuário.',
    assisted: 'Botão "Abrir no WhatsApp" (wa.me) ou compartilhamento do sistema com a imagem.',
    costs: 'Gratuito.', recommendedTemplates: ['share', 'story'],
  },
};

export const PLATFORM_ORDER: PlatformCode[] = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'pinterest', 'youtube', 'telegram'];

export function supportsAuto(code: PlatformCode): boolean {
  return PLATFORMS[code].autoStatus !== 'none';
}

export const AUTO_STATUS_LABEL: Record<AutoStatus, string> = {
  available: 'Automático disponível',
  own_account_dev: 'Automático (contas próprias)',
  private_until_audit: 'Automático, mas privado até auditoria',
  sandbox_until_review: 'Somente sandbox até aprovação',
  none: 'Somente assistido',
};
