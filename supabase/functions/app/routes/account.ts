// Exclusão completa da conta e dos dados (LGPD): arquivos do Storage + usuário (cascata no banco).
import { admin, handle, json, requireUser, HttpError } from '../../_shared/supa.ts';

export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const { action, confirm } = await req.json();
  if (action !== 'delete' || confirm !== 'EXCLUIR') throw new HttpError(400, 'Confirmação necessária: envie confirm = "EXCLUIR".');
  const db = admin();
  // Remove arquivos do usuário (pasta <uid>/...)
  for (let round = 0; round < 50; round++) {
    const { data: files } = await db.storage.from('media').list(user.id, { limit: 1000 });
    if (!files?.length) break;
    // subpastas por campanha
    const paths: string[] = [];
    for (const f of files) {
      if (f.id) paths.push(`${user.id}/${f.name}`);
      else {
        const { data: inner } = await db.storage.from('media').list(`${user.id}/${f.name}`, { limit: 1000 });
        for (const i of inner ?? []) paths.push(`${user.id}/${f.name}/${i.name}`);
      }
    }
    if (!paths.length) break;
    await db.storage.from('media').remove(paths);
  }
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) throw new HttpError(500, error.message);
  return json(req, { ok: true });
});
