/** Message banner for owner pages, driven by ?msg= and ?err= in the URL. */
export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return err ? (
    <p role="alert" className="mb-4 border-l-4 border-destructive bg-destructive/5 p-3 text-sm text-destructive" data-testid="flash-error">
      {err}
    </p>
  ) : (
    <p role="status" className="mb-4 border-l-4 border-accent bg-muted p-3 text-sm" data-testid="flash-message">
      {msg}
    </p>
  );
}
