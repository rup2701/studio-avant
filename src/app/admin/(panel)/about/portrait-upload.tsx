"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Label } from "@/components/ui/label";

export function PortraitUpload() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setMsg({ ok: false, text: `${file.name}: only JPEG, PNG and WebP photos are allowed.` });
    if (file.size > 5 * 1024 * 1024) return setMsg({ ok: false, text: `${file.name}: larger than the 5 MB limit.` });
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/admin/portrait", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: body.warning ? `Portrait saved. ${body.warning}` : "Portrait saved." });
        router.refresh();
      } else setMsg({ ok: false, text: body.error ?? "The upload failed. Please try again." });
    } catch {
      setMsg({ ok: false, text: "The upload failed. Check your connection and try again." });
    }
    setBusy(false);
  }
  return (
    <div>
      <Label htmlFor="portrait-file">Upload a new portrait (JPEG, PNG or WebP, up to 5 MB)</Label>
      <input
        id="portrait-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        className="mt-1 block text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:border file:border-foreground file:bg-transparent file:px-4"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div role="status" aria-live="polite">
        {busy && <p className="mt-2 text-sm">Uploading…</p>}
        {msg && <p className={`mt-2 text-sm ${msg.ok ? "" : "text-destructive"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
