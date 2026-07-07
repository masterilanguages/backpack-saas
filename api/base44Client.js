"use client";

import { supabase } from './supabaseClient';

/**
 * Base44 -> Supabase compatibility shim.
 *
 * The entire frontend imports a single object: `import { base44 } from "@/api/base44Client"`.
 * This module reproduces the exact shape of the Base44 SDK that the app relies on, but every
 * method is implemented on top of @supabase/supabase-js.
 *
 * Conventions preserved (do NOT change):
 *  - Row ownership is by `created_by` = the user's EMAIL, stamped server-side by a trigger.
 *    NEVER set `created_by` client-side here.
 *  - System fields are `created_date` / `updated_date` (handled by DB defaults / triggers).
 *  - `user.role` is a plain string compared to 'admin' / 'coach'.
 *  - The app role lives in Supabase `app_metadata.user_role`.
 */

// ---------------------------------------------------------------------------
// Entity name (PascalCase, as used in code) -> Postgres table (snake_case).
// This is the single source of truth — entities are built by iterating it.
// ---------------------------------------------------------------------------
const ENTITY_TABLE = {
  Achievement: 'achievement',
  ActivityProgress: 'activity_progress',
  ChatMessage: 'chat_message',
  CoachAssignment: 'coach_assignment',
  CoachNote: 'coach_note',
  ConversationSession: 'conversation_session',
  DailySong: 'daily_song',
  Day: 'day',
  DayProgress: 'day_progress',
  FluentLead: 'fluent_lead',
  JournalEntry: 'journal_entry',
  LessonProgress: 'lesson_progress',
  MediaLibrary: 'media_library',
  PictureWord: 'picture_word',
  PracticeResult: 'practice_result',
  SingingProgress: 'singing_progress',
  SingingRecording: 'singing_recording',
  SingingSegment: 'singing_segment',
  SingingSong: 'singing_song',
  Song: 'song',
  SongProgress: 'song_progress',
  Story: 'story',
  StorySong: 'story_song',
  StudySession: 'study_session',
  TextEdit: 'text_edit',
  TodoItem: 'todo_item',
  TodoProgress: 'todo_progress',
  UserCoins: 'user_coins',
  UserProfile: 'user_profile',
  UserProgram: 'user_program',
  UserStoryProgress: 'user_story_progress',
  Video: 'video',
  VocabExposure: 'vocab_exposure',
  Word: 'word',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Throw on supabase error so callers can `.catch()` exactly as they did with Base44.
function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Write sanitizer.
// Base44 silently ignored payload fields that weren't part of an entity's
// schema. Supabase/PostgREST instead rejects the ENTIRE insert/update with a
// PGRST204 error ("Could not find the 'X' column of 'Y' in the schema cache").
// So UI-only fields spread into a write (e.g. a form's `...formData`) used to
// break the whole save — silently, when the caller didn't await/​catch it.
// We mirror Base44's leniency: drop the unknown column and retry, remembering
// rejected columns per-table so later writes pre-strip them without a round-trip.
// ---------------------------------------------------------------------------
const rejectedColumns = {};

function stripKnownBad(table, payload) {
  const bad = rejectedColumns[table];
  if (!bad || bad.size === 0) return payload;
  const clean = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const out = {};
    for (const k of Object.keys(obj)) if (!bad.has(k)) out[k] = obj[k];
    return out;
  };
  return Array.isArray(payload) ? payload.map(clean) : clean(payload);
}

function badColumnFromError(error) {
  const m = /Could not find the '([^']+)' column/.exec(error?.message || '');
  return m ? m[1] : null;
}

function payloadHasKey(payload, key) {
  return Array.isArray(payload)
    ? payload.some((row) => row && key in row)
    : !!payload && key in payload;
}

// Run a write builder (insert/update), auto-stripping unknown columns and
// retrying so a stray UI-only field never breaks the whole write.
async function writeSanitized(table, payload, build) {
  let body = stripKnownBad(table, payload);
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await build(body);
    if (!res.error) return res;
    const col = badColumnFromError(res.error);
    if (!col || !payloadHasKey(body, col)) return res; // a real error — let unwrap throw it
    (rejectedColumns[table] ||= new Set()).add(col);
    // eslint-disable-next-line no-console
    console.warn(`[base44 shim] dropped unknown column "${col}" for table "${table}"`);
    body = stripKnownBad(table, body);
  }
  return build(body);
}

// Apply a Base44-style sort string to a supabase query builder.
// "-created_date" => order by created_date desc; "created_date" => asc.
function applySort(query, sort) {
  if (!sort) return query;
  if (sort.startsWith('-')) {
    return query.order(sort.slice(1), { ascending: false });
  }
  return query.order(sort, { ascending: true });
}

// Apply a Base44-style filter criteria object: equality per key, or `.in` for arrays.
function applyCriteria(query, criteria) {
  let q = query;
  for (const [key, value] of Object.entries(criteria || {})) {
    if (Array.isArray(value)) {
      q = q.in(key, value);
    } else {
      q = q.eq(key, value);
    }
  }
  return q;
}

// Build the standard CRUD surface for a given table.
function makeEntity(table) {
  return {
    // list(sort, limit)
    async list(sort, limit) {
      let q = supabase.from(table).select('*');
      q = applySort(q, sort);
      if (limit != null) q = q.limit(limit);
      return unwrap(await q);
    },

    // filter(criteria, sort, limit)
    async filter(criteria, sort, limit) {
      let q = supabase.from(table).select('*');
      q = applyCriteria(q, criteria);
      q = applySort(q, sort);
      if (limit != null) q = q.limit(limit);
      return unwrap(await q);
    },

    // get(id) -> single row (or null)
    async get(id) {
      return unwrap(await supabase.from(table).select('*').eq('id', id).maybeSingle());
    },

    // create(data) -> created row
    // NOTE: never set created_by here — a DB trigger stamps it from the auth email.
    async create(data) {
      return unwrap(
        await writeSanitized(table, data, (body) =>
          supabase.from(table).insert(body).select().single()
        )
      );
    },

    // bulkCreate(rows) -> created rows
    async bulkCreate(rows) {
      return unwrap(
        await writeSanitized(table, rows, (body) =>
          supabase.from(table).insert(body).select()
        )
      );
    },

    // update(id, data) -> updated row. maybeSingle(): a zero-row update under RLS
    // (e.g. a non-owner editing a shared row) resolves to null — matching Base44's
    // lenient no-op — instead of throwing PGRST116.
    async update(id, data) {
      return unwrap(
        await writeSanitized(table, data, (body) =>
          supabase.from(table).update(body).eq('id', id).select().maybeSingle()
        )
      );
    },

    // delete(id)
    async delete(id) {
      return unwrap(await supabase.from(table).delete().eq('id', id));
    },
  };
}

// ---------------------------------------------------------------------------
// entities — one key per entity, built DRY from ENTITY_TABLE.
// ---------------------------------------------------------------------------
const entities = {};
for (const [name, table] of Object.entries(ENTITY_TABLE)) {
  entities[name] = makeEntity(table);
}

// The app also references `base44.entities.User` as if it were an entity
// (e.g. `base44.entities.User.list()` and `base44.entities.User.delete(id)`).
// Users are not a Postgres table here — they live in Supabase Auth — so these
// route through edge functions. (Edge functions are built later; called by name.)
entities.User = {
  // List all users (admin screens). Backed by a `list-users` edge function.
  async list(sort, limit) {
    const { data, error } = await supabase.functions.invoke('list-users', {
      body: { sort, limit },
    });
    if (error) throw error;
    // Edge function is expected to return an array of users with
    // { id, email, role, full_name }.
    return data;
  },
  // Delete a user by id. Backed by a `delete-user` edge function.
  async delete(id) {
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { id },
    });
    if (error) throw error;
    return data;
  },
};

// Query was re-exported by entities.js but is never invoked in the app.
// Provide a harmless stub so the import keeps resolving.
entities.Query = {
  async list() {
    return [];
  },
  async filter() {
    return [];
  },
};

// ---------------------------------------------------------------------------
// auth — mirrors the Base44 auth surface the app uses.
// ---------------------------------------------------------------------------
const auth = {
  // me() -> the current user in Base44's shape.
  async me() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) {
      // Base44 threw when unauthenticated; callers `.catch()` this.
      const err = new Error('Not authenticated');
      err.status = 401;
      throw err;
    }
    return {
      id: user.id,
      email: user.email,
      role: user.app_metadata?.user_role || 'user',
      full_name: user.user_metadata?.full_name,
    };
  },

  // Redirect-based login entry points. The app calls these (no args / with a
  // return url); we just send the browser to the login route.
  login() {
    if (typeof window !== 'undefined') window.location.href = '/login';
  },
  loginWithRedirect() {
    if (typeof window !== 'undefined') window.location.href = '/login';
  },
  redirectToLogin() {
    if (typeof window !== 'undefined') window.location.href = '/login';
  },

  // logout(redirectUrl?) — sign out then send the user to /login.
  // The app calls logout() with and without an argument.
  async logout() {
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') window.location.href = '/login';
  },

  // updateMyUserData(data) — update auth user_metadata.
  async updateMyUserData(data) {
    const { data: result, error } = await supabase.auth.updateUser({ data });
    if (error) throw error;
    return result;
  },

  // list() — admin listing of users (delegates to the User entity helper).
  async list(sort, limit) {
    return entities.User.list(sort, limit);
  },
};

// ---------------------------------------------------------------------------
// integrations.Core — LLM / image / file / email helpers.
// Each returns the SAME shape the callers destructure today.
// ---------------------------------------------------------------------------
const Core = {
  // InvokeLLM(args) -> the LLM result.
  // The `invoke-llm` edge function returns the parsed OBJECT when the caller
  // passes a `response_json_schema`, but `{ response: "<text>" }` for a plain
  // text prompt. Plain-prompt callers across the app treat the result as a
  // STRING — they render it directly, call `.trim()`, or store it as a word
  // `translation`. Returning the raw `{ response }` object to them rendered
  // "[object Object]" / crashed React ("Objects are not valid as a React child",
  // e.g. the Journal word translator) and poisoned saved translations with
  // `{"response":"..."}`. So unwrap `{ response }` to the bare string for the
  // no-schema case (matching Base44's InvokeLLM). Schema callers get the object
  // untouched.
  async InvokeLLM(args) {
    const { data, error } = await supabase.functions.invoke('invoke-llm', {
      body: args,
    });
    if (error) throw error;
    if (args && args.response_json_schema) return data;
    if (data && typeof data === 'object' && 'response' in data) return data.response;
    return data;
  },

  // GenerateImage(args) -> { url } (callers read result.url).
  async GenerateImage(args) {
    const { data, error } = await supabase.functions.invoke('generate-image', {
      body: args,
    });
    if (error) throw error;
    // Normalize so callers always get { url }.
    return { url: data?.url };
  },

  // UploadFile({ file }) -> { file_url } (callers destructure { file_url } / read .file_url).
  async UploadFile({ file }) {
    const ext =
      (file && file.name && file.name.includes('.')
        ? file.name.split('.').pop()
        : '') || 'bin';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('uploads').getPublicUrl(path);
    return { file_url: data.publicUrl };
  },

  // SendEmail(args) -> edge function result.
  async SendEmail(args) {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: args,
    });
    if (error) throw error;
    return data;
  },

  // SendSMS(args) -> edge function result. Exported but not currently called.
  async SendSMS(args) {
    const { data, error } = await supabase.functions.invoke('send-sms', {
      body: args,
    });
    if (error) throw error;
    return data;
  },

  // ExtractDataFromUploadedFile(args) -> edge function result. Exported but not currently called.
  async ExtractDataFromUploadedFile(args) {
    const { data, error } = await supabase.functions.invoke(
      'extract-data-from-uploaded-file',
      { body: args }
    );
    if (error) throw error;
    return data;
  },
};

const integrations = { Core };

// ---------------------------------------------------------------------------
// functions.invoke(name, body) -> the function's JSON body (Base44 returned
// an axios-like response; the app reads `.data` off some results, so we return
// the unwrapped `.data` from supabase.functions.invoke).
// ---------------------------------------------------------------------------
const functions = {
  async invoke(name, body) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw error;
    return data;
  },
};

// ---------------------------------------------------------------------------
// users.inviteUser(email, role) -> invite-user edge function.
// ---------------------------------------------------------------------------
const users = {
  async inviteUser(email, role) {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email, role },
    });
    if (error) throw error;
    return data;
  },
};

// ---------------------------------------------------------------------------
// appLogs.logUserInApp(page) -> fire-and-forget; must never throw.
// ---------------------------------------------------------------------------
const appLogs = {
  logUserInApp(page) {
    return Promise.resolve(
      supabase.functions.invoke('log-user-in-app', { body: { page } })
    ).catch(() => {});
  },
};

export const base44 = {
  entities,
  auth,
  integrations,
  functions,
  users,
  appLogs,
};

export default base44;
