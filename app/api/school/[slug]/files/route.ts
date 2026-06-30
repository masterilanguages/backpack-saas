import { NextResponse } from "next/server";
import { getSchoolBySlug, getFiles, createFileRecord, deleteFileRecord, FILES_BUCKET } from "@/lib/queries";
import { supabaseAdmin } from "@/lib/supabase";
import { requireOrgRole } from "@/lib/supabase-ssr";

function deriveType(name: string, mime: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "Image";
  if (mime.startsWith("video/") || ["mp4", "mov", "webm", "avi"].includes(ext)) return "Video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg"].includes(ext)) return "Audio";
  if (ext === "pdf" || mime === "application/pdf") return "PDF";
  if (["xls", "xlsx", "csv"].includes(ext)) return "Sheet";
  if (["doc", "docx", "txt", "rtf", "ppt", "pptx"].includes(ext)) return "Doc";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "Archive";
  return "Doc";
}

function humanSize(bytes: number): string {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const files = await getFiles(school.id);
  // URL firmada para descargar (1h); el binario es privado.
  const withUrls = await Promise.all(
    files.map(async (f: any) => {
      let url: string | null = null;
      if (f.storage_path) {
        const { data } = await supabaseAdmin.storage
          .from(FILES_BUCKET)
          .createSignedUrl(f.storage_path, 3600);
        url = data?.signedUrl ?? null;
      }
      return { ...f, url };
    }),
  );
  return NextResponse.json(withUrls);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storage_path = `${school.id}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(FILES_BUCKET)
    .upload(storage_path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const rec = await createFileRecord(school.id, {
    name: file.name,
    type: deriveType(file.name, file.type || ""),
    size: humanSize(file.size),
    storage_path,
    owner: ctx.name || ctx.email,
  });
  return NextResponse.json(rec, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, storage_path } = await req.json();
  if (storage_path) {
    await supabaseAdmin.storage.from(FILES_BUCKET).remove([storage_path]);
  }
  await deleteFileRecord(id);
  return NextResponse.json({ ok: true });
}
