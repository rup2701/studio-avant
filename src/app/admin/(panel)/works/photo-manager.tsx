"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { movePhoto, removePhoto, updatePhotoAlt } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Img = { id: string; url: string; alt: string; width: number; height: number };
type QueueItem = {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "error" | "done";
  error?: string;
  warnings: string[];
};

const MAX_PHOTOS = 8;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

function upload(url: string, file: File, onProgress: (n: number) => void) {
  return new Promise<{ ok: boolean; status: number; body: { error?: string; warnings?: string[] } }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, body: { error: "The connection was lost." } });
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export function PhotoManager(p: { productId: string; productName: string; images: Img[]; storageOk: boolean; storageMessage: string }) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [alts, setAlts] = useState<Record<string, string>>({});
  const endpoint = `/api/admin/works/${p.productId}/photos`;

  const patch = (id: string, v: Partial<QueueItem>) => setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...v } : i)));

  async function run(item: QueueItem) {
    patch(item.id, { status: "uploading", progress: 0, error: undefined });
    const res = await upload(endpoint, item.file, (n) => patch(item.id, { progress: n }));
    if (res.ok) {
      patch(item.id, { status: "done", progress: 100, warnings: res.body.warnings ?? [] });
      router.refresh();
    } else {
      const text =
        res.status === 401
          ? "Your session ended. Sign in again, then retry."
          : res.body.error ?? "The upload failed. You can retry it.";
      patch(item.id, { status: "error", error: text });
    }
  }

  function onFiles(files: FileList | null) {
    if (!files) return;
    setMessage(null);
    let room = MAX_PHOTOS - p.images.length - queue.filter((q) => q.status !== "error").length;
    const items: QueueItem[] = [];
    for (const file of Array.from(files)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let error: string | undefined;
      if (!TYPES.includes(file.type)) error = `${file.name}: only JPEG, PNG and WebP photos are allowed.`;
      else if (file.size > MAX_BYTES) error = `${file.name}: this photo is larger than the 5 MB limit (${(file.size / 1048576).toFixed(1)} MB). Please choose a smaller file.`;
      else if (room <= 0) error = `${file.name}: a work can have ${MAX_PHOTOS} photos at most. Remove one first.`;
      if (!error) room--;
      items.push({ id, file, progress: 0, status: error ? "error" : "uploading", error, warnings: [] });
    }
    setQueue((q) => [...q, ...items]);
    // One at a time, so photo positions are assigned in order.
    void (async () => {
      for (const it of items) if (it.status === "uploading") await run(it);
    })();
  }

  async function act(fn: () => Promise<{ ok: boolean; message?: string }>) {
    const res = await fn();
    setMessage(res.message ? { ok: res.ok, text: res.message } : null);
    router.refresh();
  }

  return (
    <section aria-labelledby="photos-heading" className="mt-10 border-t border-border pt-6" data-testid="photo-manager">
      <h2 id="photos-heading" className="font-serif text-2xl">Photos <span className="text-base text-muted-foreground">({p.images.length} of {MAX_PHOTOS})</span></h2>
      <p className="mt-1 text-sm text-muted-foreground">
        JPEG, PNG or WebP, up to 5 MB each. The first photo is the cover. Photos save as soon as they upload; they are not part of the Save button.
      </p>

      {!p.storageOk && (
        <p role="alert" className="mt-3 border-l-4 border-destructive bg-destructive/5 p-3 text-sm">{p.storageMessage}</p>
      )}

      <div className="mt-4">
        <Label htmlFor="photo-input">Add photos</Label>
        <input
          id="photo-input"
          data-testid="photo-input"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={!p.storageOk}
          className="mt-1 block w-full max-w-md text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:border file:border-foreground file:bg-transparent file:px-4"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {queue.length > 0 && (
        <ul className="mt-4 space-y-2" data-testid="upload-queue" aria-live="polite">
          {queue.map((q) => (
            <li key={q.id} className="border border-border p-3 text-sm" data-testid="upload-item" data-status={q.status}>
              <p className="font-medium">{q.file.name}</p>
              {q.status === "uploading" && (
                <progress className="mt-1 w-full" value={q.progress} max={100} aria-label={`Uploading ${q.file.name}`}>{q.progress}%</progress>
              )}
              {q.status === "done" && <p className="text-muted-foreground">Uploaded.</p>}
              {q.warnings.map((w) => (
                <p key={w} className="text-accent" data-testid="upload-warning">{w}</p>
              ))}
              {q.status === "error" && (
                <div role="alert" className="text-destructive">
                  <p data-testid="upload-error">{q.error}</p>
                  <div className="mt-2 flex gap-2">
                    {q.error && !q.error.includes("only JPEG") && !q.error.includes("larger than") && !q.error.includes("at most") && (
                      <Button type="button" size="sm" variant="outline" onClick={() => run(q)}>Retry</Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setQueue((x) => x.filter((i) => i.id !== q.id))}>Dismiss</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div role="status" aria-live="polite">
        {message && (
          <p className={`mt-3 text-sm ${message.ok ? "" : "text-destructive"}`} data-testid="photo-message">{message.text}</p>
        )}
      </div>

      {p.images.length === 0 ? (
        <p className="mt-6 text-muted-foreground">No photos yet. Shoppers see a neutral placeholder until you add one.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="photo-list">
          {p.images.map((img, i) => (
            <li key={img.id} className="border border-border p-3" data-testid="photo-item">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt} className="h-40 w-full bg-muted object-contain" />
                {i === 0 && <span className="absolute left-1 top-1 bg-primary px-2 py-0.5 text-xs text-primary-foreground" data-testid="cover-badge">Cover</span>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{img.width} × {img.height} px</p>
              <Label htmlFor={`alt-${img.id}`} className="mt-2 block text-xs">Alt text</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id={`alt-${img.id}`}
                  value={alts[img.id] ?? img.alt}
                  onChange={(e) => setAlts((a) => ({ ...a, [img.id]: e.target.value }))}
                  maxLength={200}
                />
                <Button type="button" size="sm" variant="outline" onClick={() => act(() => updatePhotoAlt(img.id, alts[img.id] ?? img.alt))}>Save</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {i > 0 && <Button type="button" size="sm" variant="outline" onClick={() => act(() => movePhoto(img.id, "cover"))}>Make cover</Button>}
                <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => act(() => movePhoto(img.id, "earlier"))} aria-label={`Move photo ${i + 1} earlier`}>←</Button>
                <Button type="button" size="sm" variant="ghost" disabled={i === p.images.length - 1} onClick={() => act(() => movePhoto(img.id, "later"))} aria-label={`Move photo ${i + 1} later`}>→</Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm("Remove this photo?")) void act(() => removePhoto(img.id));
                  }}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
