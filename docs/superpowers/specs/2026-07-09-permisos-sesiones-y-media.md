# Permisos de sesiones (`day`) y saneamiento del modal de Media

**Fecha:** 2026-07-09
**Proyecto:** backpack-saas (Next.js 14 + Supabase + Tailwind + TypeScript)
**Estado:** Aplicado en producción — **con una decisión pendiente** (ver "Observación abierta")

## Problema

El campo **"Designate to Session (Day)"** del modal *Add Media to Library* (`/media`)
mostraba siempre el toast verde `Video added to Session N schedule!`, aunque no se
escribiera nada. Dos caminos fallaban en silencio:

1. **La sesión no existía.** El campo era un `<input type="number">` que invitaba a
   escribir 1-100, pero en la base solo existen las sesiones que alguien creó a mano
   (al momento de escribir: hebreo 1-3, español 1, **cero en inglés**). Con cualquier
   otro número, `Day.filter()` devolvía `[]`, el bucle no iteraba, y el toast de éxito
   salía igual.

2. **RLS bloqueaba la escritura.** La política `day_org_write` exigía
   `has_org_role(org_id, 'admin')`. Cuando RLS bloquea un UPDATE, PostgREST devuelve
   **cero filas sin error**, así que `Day.update()` resolvía a `null` (el shim usa
   `.select().maybeSingle()`) y el código seguía de largo.

Resultado: el usuario creía haber asignado un video a una sesión y no había pasado nada.

## Auditoría del estado previo

| Hallazgo | Ubicación |
|---|---|
| Toast de éxito incondicional | `app/(student)/media/page.tsx` (bloque `default_day`) |
| Mismo bug en la inyección por usuario asignado | idem, bucle `assigned_users` |
| `Day updated!` mentía bajo RLS | `app/(student)/learn/lessons/days/page.tsx` |
| `+ Add Day` era **mudo**: RLS rechaza el insert y no había `onError` | idem |
| El filtro de idioma de `/media` no seguía al `LanguageSwitcher` del sidebar | `media/page.tsx` (guard `&& !filterLanguage`) |
| "All Languages" caía al idioma del perfil en vez de mostrar todo | `media/page.tsx` (`effectiveLangFilter`) |

## Cambios

**Código** (PRs #16, #17, #18, todas en producción):

- Se cuentan los `Day.update()` que realmente devolvieron fila y se distinguen tres
  desenlaces: *la sesión no existe*, *no tenés permiso*, *listo*. Los mensajes de error
  aclaran que el video **sí quedó guardado en la biblioteca**.
- La auto-extracción de vocabulario ahora corre **solo si el video quedó pegado a la
  sesión**. Antes etiquetaba palabras como `Session N` para sesiones inexistentes.
- El campo numérico libre es ahora un **selector de las sesiones reales** del idioma
  elegido dentro del modal. Estado vacío explícito: *"No sessions exist for X — create
  them in Lessons → Days"*. Una sesión guardada que ya no existe para el idioma actual
  sigue listada y marcada, para poder limpiarla con `— None —`.
- El filtro de idioma de `/media` sigue al idioma de aprendizaje del sidebar, y
  "All Languages" muestra todos los idiomas de verdad.
- `Lessons → Days` reporta los fallos de create/update en vez de callarlos.

**Base de datos** (`supabase/migrations/0800_day_member_update.sql`, aplicada vía SQL Editor):

`day_org_write` era `FOR ALL` — una sola política gobernaba INSERT, UPDATE y DELETE con
la misma regla de admin/owner. Se partió en tres:

| Comando | Quién puede | Efecto |
|---|---|---|
| SELECT | miembros de la org | sin cambios |
| **UPDATE** | **cualquier miembro de la org** | habilita "Designate to Session" para estudiantes |
| INSERT | solo admin/owner | crear sesiones |
| DELETE | solo admin/owner | borrar sesiones |

No se arrastró la rama `org_id IS NULL` de la política vieja: ahí era inocua porque el
segundo conjunto (`has_org_role`) la rechazaba igual, pero en una política de UPDATE sin
ese conjunto dejaría escribir a cualquier usuario autenticado sobre una fila sin
organización.

El aislamiento entre tenants **no depende solo de estas políticas**: `trg_freeze_org_id`
lanza excepción ante cualquier intento de cambiar `org_id`, y `trg_stamp_org_id` lo
completa en el insert.

## Observación abierta: ¿quién debe poder agregar videos a una sesión?

**Hoy, cualquier estudiante puede.** Es una decisión deliberada de MVP ("todos deberían
poder agregar videos", pedido del cliente), pero conviene revisarla antes de crecer:

- El campo dice literalmente **"for all users"**. Cuando un estudiante pega un video en
  la Sesión 1 de hebreo, **se lo pega a todos los alumnos de hebreo de esa organización**.
  El plan de estudios compartido pasa a ser un muro colaborativo.
- Al momento de escribir hay **12 estudiantes, 2 coaches y 2 owners**. Antes escribían 2
  personas; ahora escriben 16.
- **Escrituras concurrentes se pisan.** El código lee `subsections`, le agrega el video y
  reescribe el array completo. Dos personas agregando a la misma sesión con segundos de
  diferencia → la segunda pisa a la primera y un video se pierde sin aviso.
- RLS **no sabe restringir por columna**. Con el UPDATE abierto, un miembro podría —con un
  request armado a mano, no desde la UI— renombrar una sesión, cambiarle el `day_number` o
  el `language`, o vaciarle las tareas. Si eso incomoda, se tapa con un trigger que congele
  esas columnas para quien no sea admin, igual que hace `freeze_org_id` con `org_id`.

**Alternativa ya construida y sin usar:** la tabla `user_program` (`user_email`,
`media_library_id`, `order`, `completed`) es exactamente "los videos de *este* alumno".
Existe la página `/home/my-program` que la renderiza — con **0 filas** y **sin ningún enlace
en la navegación**. Su RLS ya permite que cada alumno cree las suyas (`created_by =
app_email()`), sin tocar `day`. Si se decide que el currículum compartido vuelve a ser
territorio de coaches/owners, ese es el camino para que el estudiante siga armando *su*
programa: "Add to my program" en vez de "Designate to Session", y **sin necesidad de
revertir ni mantener el permiso abierto**.

## ¿Quién crea las sesiones (`day`)?

**Nadie automáticamente.** No hay seed al crear una organización (`lib/provisioning.ts`),
ni al registrarse un usuario (`lib/onboarding.ts`), ni en las migraciones. Las sesiones
existen solo si un humano las creó a mano.

Hay **dos botones distintos**, en dos páginas, que escriben en la misma tabla:

| Página | Botón | Visible si | Crea |
|---|---|---|---|
| Dashboard (`/home`) | "Create session" | `role === 'admin'` **y** `userProfile.is_new_user !== true` (`isMasterUser`) | `title: "Session N"`, con `order` |
| Schedule (`/learn/lessons/days`) | `+ Add Day` | `role === 'admin'` (`isAdmin`) | `title: "Day N"`, sin `order` |

Ambos calculan `N = max(day_number de ese idioma) + 1` y estampan
`language = el idioma de aprendizaje del propio admin`, tomado de su
`LanguageSwitcher` del sidebar.

Dos trampas que se desprenden de esto:

1. **Para crear las sesiones en inglés, el admin tiene que cambiar su propio idioma de
   aprendizaje a English primero.** Nada en pantalla lo dice. Es la razón por la que hay
   3 alumnos de inglés y cero sesiones en inglés.
2. **La visibilidad del botón y el permiso real no salen de la misma fuente.** El botón se
   muestra según `app_metadata.user_role`; el INSERT lo autoriza `has_org_role(org_id,
   'admin')`, que se resuelve contra la tabla `memberships` (`owner > admin > coach >
   student`). Si alguien tiene `user_role: 'admin'` pero en `memberships` figura como
   coach, ve el botón y el insert lo rechaza RLS. **Conviene unificar los dos chequeos en
   uno solo, leyendo `memberships`, que es el que manda de verdad.**

Además, los dos botones nombran la misma entidad distinto — `"Session N"` vs `"Day N"` —
y solo uno setea `order`.

## Riesgos conocidos, no abordados

- `canEdit = true` está hardcodeado en `media/page.tsx`. Además de agregar, **cualquier
  estudiante puede editar y borrar** cualquier video de la biblioteca compartida. Sin
  confirmar con el cliente si eso era la intención.
- El bloque que escribe en `day` corre **antes** de `MediaLibrary.create`. Si el guardado
  del video falla, la sesión queda con una tarea apuntando a un video inexistente.
- Hay **2 organizaciones y solo 1 tiene sesiones**. Una escuela nueva arranca sin currículum
  y sin forma obvia de sembrárselo. Falta un seed o un template clonable por tenant.
- **3 alumnos aprenden inglés y no existe ninguna sesión en inglés.** Crear sesiones sigue
  siendo de owner.

## Cómo revertir el permiso

```sql
begin;
drop policy if exists day_org_update on public.day;
drop policy if exists day_org_insert on public.day;
drop policy if exists day_org_delete on public.day;
create policy day_org_write on public.day
  for all
  using      ((org_id is null or org_id in (select my_org_ids()) or is_platform_admin())
              and (has_org_role(org_id,'admin') or is_platform_admin()))
  with check ((org_id is null or org_id in (select my_org_ids()) or is_platform_admin())
              and (has_org_role(org_id,'admin') or is_platform_admin()));
commit;
```
