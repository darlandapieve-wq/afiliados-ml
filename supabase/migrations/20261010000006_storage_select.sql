-- Upload com upsert no Storage exige também permissão de leitura (SELECT) na pasta do usuário.
create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
