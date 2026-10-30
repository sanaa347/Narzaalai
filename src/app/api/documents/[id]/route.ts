import fs from "node:fs";
import { Readable } from "node:stream";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current";
import { getDocumentForDownload } from "@/lib/services/documents";

export const dynamic = "force-dynamic";

const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"]);

/** Authenticated document download. Unauthorized and missing documents are indistinguishable (both 404). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const actor = await getCurrentUser();
  const found = getDocumentForDownload(getDb(), actor, id);
  if (!found) return new Response("Not found", { status: 404 });
  const { doc, absPath } = found;
  const stat = fs.statSync(absPath);
  const stream = Readable.toWeb(fs.createReadStream(absPath)) as ReadableStream;
  const disposition = INLINE.has(doc.mime_type) ? "inline" : "attachment";
  return new Response(stream, {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Length": String(stat.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    },
  });
}
