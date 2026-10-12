// Função autenticada única: /functions/v1/app/<rota>
import { handle, json, HttpError } from '../_shared/supa.ts';
import { handler as integrations } from './routes/integrations.ts';
import { handler as mlLookup } from './routes/ml-lookup.ts';
import { handler as aiText } from './routes/ai-text.ts';
import { handler as account } from './routes/account.ts';
import { handler as tts } from './routes/tts.ts';

const routes: Record<string, (req: Request) => Promise<Response>> = {
  integrations, 'ml-lookup': mlLookup, 'ai-text': aiText, account, tts,
};

Deno.serve(handle(async (req) => {
  const seg = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
  const r = routes[seg];
  if (!r) throw new HttpError(404, 'Rota não encontrada');
  return r(req);
}));
