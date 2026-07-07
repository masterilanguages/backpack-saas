-- ============================================================================
-- 0700_media_library_member_write.sql
-- ============================================================================
-- OBJETIVO
--   Permitir que CUALQUIER miembro de la organizacion (student, coach, admin,
--   owner) pueda AGREGAR / EDITAR / BORRAR videos de la Content Library
--   (tabla public.media_library), no solo admin/owner.
--
-- CONTEXTO / BUG QUE ARREGLA
--   0400_rls_reconcile trato media_library como CATALOGO GLOBAL y restringio la
--   ESCRITURA a `has_org_role(org_id,'admin') OR is_platform_admin()`. La UI de
--   /media, en cambio, muestra los botones Editar/Borrar/Agregar a TODOS los
--   usuarios (canEdit = canDelete = true). Resultado: un estudiante o coach
--   pulsa "Borrar" y ve el toast "Video deleted from library", pero nada se
--   borra. Motivo: un DELETE/UPDATE bloqueado por RLS afecta 0 filas SIN lanzar
--   error, y PostgREST devuelve exito -> la app lo interpreta como borrado OK.
--   (El INSERT si lanzaba error de RLS al agregar.)
--
-- CAMBIO
--   Reemplaza SOLO la policy de escritura `media_library_org_write` por una que
--   concede escritura a cualquier miembro de la org DUEÑA de la fila
--   (`org_id = ANY(my_org_ids())`) o a un platform admin.
--
--   Se MANTIENE el aislamiento multi-tenant:
--     * Un miembro de la org A NUNCA puede escribir filas de la org B
--       (su org_id no esta en my_org_ids()).
--     * El contenido GLOBAL de plataforma (org_id IS NULL) sigue reservado a
--       platform admin para escritura (org_id NULL NO entra en my_org_ids()).
--   La policy de LECTURA (`media_library_org_select`) NO se toca: el catalogo
--   global (org_id NULL) sigue siendo visible para todos.
--
--   INSERT: el trigger stamp_org_id() (0300) sella org_id = my_org_id() del
--   usuario, asi que el WITH CHECK pasa para cualquier miembro de su org.
-- ============================================================================

begin;

drop policy if exists media_library_org_write on public.media_library;

create policy media_library_org_write on public.media_library
  for all
  using (
    (org_id = any (select public.my_org_ids()))
    or public.is_platform_admin()
  )
  with check (
    (org_id = any (select public.my_org_ids()))
    or public.is_platform_admin()
  );

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (descomentar para revertir a "solo admin/owner de la org"):
-- ----------------------------------------------------------------------------
-- begin;
-- drop policy if exists media_library_org_write on public.media_library;
-- create policy media_library_org_write on public.media_library
--   for all
--   using (
--     ((org_id is null) or (org_id = any (select public.my_org_ids())) or public.is_platform_admin())
--     and (public.has_org_role(org_id, 'admin') or public.is_platform_admin())
--   )
--   with check (
--     ((org_id is null) or (org_id = any (select public.my_org_ids())) or public.is_platform_admin())
--     and (public.has_org_role(org_id, 'admin') or public.is_platform_admin())
--   );
-- commit;
