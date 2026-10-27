"use client";
import { useState } from "react";
import type { WorkCard } from "@/lib/queries";
import { WorkGridList } from "./work-card";
import { cn } from "@/lib/utils";

type SeriesFilter = { id: string; title: string };

/** The portfolio grid with filters that do not leave the page. */
export function FilterableWorkGrid({ works, series }: { works: WorkCard[]; series: SeriesFilter[] }) {
  const [filter, setFilter] = useState<string>("all");
  const shown = works.filter((w) =>
    filter === "all" ? true : filter === "available" ? w.availability === "available" : w.seriesId === filter,
  );
  const chips: { id: string; label: string }[] = [
    { id: "all", label: "All" },
    ...series.map((s) => ({ id: s.id, label: s.title })),
    { id: "available", label: "Available" },
  ];
  return (
    <div>
      <div role="group" aria-label="Filter works" className="mb-5 flex flex-wrap gap-x-5 gap-y-1">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={cn(
              "min-h-11 border-b-2 text-sm tracking-wide transition-colors hover:text-accent",
              filter === c.id ? "border-foreground font-medium" : "border-transparent text-muted-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite" data-testid="grid-count">
        Showing {shown.length} {shown.length === 1 ? "work" : "works"}
      </p>
      {shown.length === 0 ? (
        <p className="py-12 text-muted-foreground">No works match this filter right now. Choose “All” to see everything.</p>
      ) : (
        <WorkGridList works={shown} />
      )}
    </div>
  );
}
