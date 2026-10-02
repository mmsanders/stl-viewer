import { useState } from "react";
import { Crosshair, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatTris } from "@/viewer/format";
import type { ModelView, UpAxis, ViewOptions } from "@/viewer/types";

type ModelPanelProps = {
  models: ModelView[];
  view: ViewOptions;
  booted: boolean;
  onToggle: (id: string) => void;
  onSolo: (id: string) => void;
  onColor: (id: string) => void;
  onUpAxis: (id: string, axis: UpAxis) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onFrame: (id: string) => void;
  onAll: (visible: boolean) => void;
  onGrid: (on: boolean) => void;
  onWire: (on: boolean) => void;
  onSmooth: (on: boolean) => void;
  onSample: () => void;
};

export function ModelPanel(props: ModelPanelProps) {
  const { models, view, booted } = props;
  const allOn = models.length > 0 && models.every((model) => model.visible);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div>
          <h2 className="text-sm font-medium text-fg">Shelf</h2>
          <p className="text-xs text-muted">Stored on this phone</p>
        </div>
        {models.length > 1 ? (
          <Button variant="quiet" className="px-2" onClick={() => props.onAll(!allOn)}>
            {allOn ? "Hide all" : "Show all"}
          </Button>
        ) : null}
      </div>
      <div className="scroll-pane flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {!booted ? (
          <p className="px-1 py-6 text-sm text-muted">Opening shelf</p>
        ) : models.length === 0 ? (
          <p className="px-1 py-6 text-sm text-muted">No files yet.</p>
        ) : (
          models.map((model) => {
            const solo =
              model.visible && models.every((item) => item.id === model.id || !item.visible);
            return (
              <article key={model.id} className="rounded-lg border border-border bg-bg p-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={`Color for ${model.name}`}
                    className="size-11 shrink-0 rounded-sm border border-border"
                    style={{ backgroundColor: model.color }}
                    onClick={() => props.onColor(model.id)}
                  />
                  <div className="min-w-0 flex-1">
                    {editing === model.id ? (
                      <input
                        autoFocus
                        value={draft}
                        aria-label="Rename"
                        className="h-11 w-full rounded-sm border border-border bg-surface px-2 text-sm text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => {
                          props.onRename(model.id, draft);
                          setEditing(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            props.onRename(model.id, draft);
                            setEditing(null);
                          }
                          if (event.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="block max-w-full truncate text-left text-sm font-medium text-fg"
                        onClick={() => {
                          setEditing(model.id);
                          setDraft(model.name);
                        }}
                      >
                        {model.name}
                      </button>
                    )}
                    <p className="mt-1 text-xs text-muted tabular-nums">
                      {formatTris(model.triangles)} tris · {formatBytes(model.byteLength)}
                      {model.ephemeral ? " · not saved" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={model.visible}
                    aria-label={model.visible ? `Hide ${model.name}` : `Show ${model.name}`}
                    className="press inline-flex size-11 items-center justify-center rounded-md text-fg"
                    onClick={() => props.onToggle(model.id)}
                  >
                    {model.visible ? (
                      <Eye className="size-5" aria-hidden="true" />
                    ) : (
                      <EyeOff className="size-5 text-subtle" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="quiet"
                    className="px-2"
                    onClick={() => props.onUpAxis(model.id, model.upAxis === "y" ? "z" : "y")}
                  >
                    {model.upAxis === "y" ? "Y-up" : "Z-up"}
                  </Button>
                  <Button variant="quiet" className="px-2" onClick={() => props.onFrame(model.id)}>
                    <Crosshair className="size-4" aria-hidden="true" />
                    Frame
                  </Button>
                  {models.length > 1 ? (
                    <Button variant="quiet" className="px-2" onClick={() => props.onSolo(model.id)}>
                      {solo ? "Show all" : "Solo"}
                    </Button>
                  ) : null}
                  <Button
                    variant={confirmId === model.id ? "danger" : "quiet"}
                    className="px-2"
                    onClick={() => {
                      if (confirmId === model.id) {
                        props.onRemove(model.id);
                        setConfirmId(null);
                      } else {
                        setConfirmId(model.id);
                      }
                    }}
                  >
                    {confirmId === model.id ? "Remove" : "Delete"}
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-border p-3">
        <div className="grid grid-cols-3 gap-2">
          <Toggle on={view.grid} label="Grid" onClick={() => props.onGrid(!view.grid)} />
          <Toggle on={view.wireframe} label="Wire" onClick={() => props.onWire(!view.wireframe)} />
          <Toggle on={view.smooth} label="Smooth" onClick={() => props.onSmooth(!view.smooth)} />
        </div>
        {booted && models.length > 0 && !models.some((model) => model.ephemeral) ? (
          <Button variant="ghost" onClick={props.onSample}>
            Add sample bracket
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={
        on
          ? "press h-11 rounded-md bg-primary text-sm font-medium text-primary-fg"
          : "press h-11 rounded-md border border-border bg-surface-2 text-sm font-medium text-fg"
      }
    >
      {label}
    </button>
  );
}
