# Diseño: Función "Editar" en Students, Tasks y Notes

**Fecha:** 2026-06-23
**Proyecto:** backpack-saas (Next.js 14 + Supabase + Tailwind + TypeScript)
**Estado:** Aprobado

## Problema

En el panel admin, el menú de acciones (los "3 puntos") de varias tablas muestra
"View details", "Edit" y "Delete", pero son etiquetas sin función conectada. Solo
algunas acciones de borrado funcionan. El usuario no puede editar registros desde
la UI.

Decisiones tomadas en brainstorming:
- **Presentación:** modal centrado, reutilizando el `CreateModal` existente.
- **Acciones:** consolidar a solo "Editar" (se elimina "View details"; el modal de
  edición ya muestra toda la info).
- **Alcance:** solo las 3 secciones conectadas a Supabase — **Students, Tasks, Notes**.
  Lessons y Modules usan datos mock y quedan fuera de este alcance.

## Estado actual del backend (auditoría)

| Sección  | Ruta API              | Query de update                       | Notas / Bugs |
|----------|-----------------------|---------------------------------------|--------------|
| Students | GET, POST, DELETE     | falta `updateStudent`                 | Delete OK (llama API) |
| Tasks    | GET, POST, **PATCH**  | `updateTask` solo acepta status/priority | "Mark Done" usa PATCH |
| Notes    | GET, POST             | falta `updateNote` y `deleteNote`     | 🐛 Delete solo borra en pantalla (no llama API); 🐛 `company.name` indefinido rompe el build |

## Cambios

### 1. Componente compartido — `components/CreateModal.tsx`
Agregar prop opcional `initialValues?: Record<string, string>`.
- Si se provee → el estado `form` se inicializa con esos valores (modo Editar).
- Si no → comportamiento actual (modo Crear).
- Opcional: prop `submitLabel` para mostrar "Save" vs "Update".

Este único cambio habilita la edición en las 3 secciones (DRY).

### 2. Backend — `lib/queries.ts`
- `updateStudent(id, input)` — nuevo
- `updateTask(id, input)` — ampliar el tipo para aceptar todos los campos editables
  (title, assignee, due_date, priority, status, related), no solo status/priority
- `updateNote(id, input)` — nuevo
- `deleteNote(id)` — nuevo (para arreglar el delete roto)

### 3. Rutas API
- `app/api/school/[slug]/students/route.ts` → agregar handler `PATCH`
- `app/api/school/[slug]/notes/route.ts` → agregar handlers `PATCH` y `DELETE`
- `app/api/school/[slug]/tasks/route.ts` → ya tiene `PATCH` ✅ (sin cambios)

### 4. Páginas (UI)
- **`clients/page.tsx`** (Students): estado `editing`; agregar "Edit" al `ActionMenu`
  que abre `CreateModal` con `initialValues=student`; `onSubmit` hace PATCH y
  actualiza el estado local. Menú: **Editar + Eliminar**.
- **`tasks/page.tsx`**: agregar "Edit" al `ActionMenu`; modal pre-llenado; PATCH.
  Menú: **Editar + Mark Done**.
- **`notes/page.tsx`**: agregar "Edit" a cada `NoteCard`; modal pre-llenado; PATCH.
  Arreglar el "Delete" para que llame a `DELETE` de la API. Arreglar el bug de
  `company.name` (referencia indefinida). Menú: **Editar + Eliminar**.

## Flujo de datos (ejemplo: Editar estudiante)
```
Click "Edit"
  → CreateModal con initialValues = estudiante seleccionado
  → usuario edita → Save
  → PATCH /api/school/masteri/students { id, ...campos }
  → updateStudent() actualiza Supabase
  → estado local se actualiza → la tabla refleja el cambio
```

## Manejo de errores
- Las rutas API devuelven `{ error }` con status 500 si Supabase falla (patrón ya
  usado en `notes` POST).
- En la UI, si el PATCH falla, no se actualiza el estado local (se mantiene el valor
  previo). Mostrar feedback mínimo es opcional en esta iteración.

## Pruebas / verificación
- Editar un estudiante, tarea y nota; recargar la página y confirmar que el cambio
  persiste en Supabase.
- Borrar una nota y confirmar que ya no reaparece al recargar (bug corregido).
- Confirmar que el build de Next.js pasa (bug de `company.name` corregido).

## Fuera de alcance
- Lessons y Modules (datos mock → requieren migración a Supabase primero).
- Integración con Google Calendar y CRUD del calendario.
- "View details" como vista separada (consolidado en Editar).
