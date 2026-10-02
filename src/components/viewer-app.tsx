import { useEffect, useRef, useState } from "react";
import { Crosshair, Layers } from "lucide-react";
import { FlyPad } from "@/components/fly-pad";
import { HelpDialog } from "@/components/help-dialog";
import { ModelPanel } from "@/components/model-panel";
import { Button } from "@/components/ui/button";
import { formatDim, formatTris } from "@/viewer/format";
import type { Session } from "@/viewer/session";
import {
  DEFAULT_VIEW,
  type CameraMode,
  type ModelView,
  type SceneStats,
  type StatusNote,
  type UpAxis,
  type ViewOptions,
} from "@/viewer/types";

if (typeof window !== "undefined") {
  void import("@/viewer/session");
}

const EMPTY_STATS: SceneStats = { triangles: 0, size: null, visibleCount: 0 };

export function ViewerApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<ModelView[]>([]);
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);
  const [view, setView] = useState<ViewOptions>(DEFAULT_VIEW);
  const [status, setStatus] = useState<StatusNote>(null);
  const [booted, setBooted] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const signal = { dead: false };
    let session: Session | null = null;
    void import("@/viewer/session").then(async ({ startSession }) => {
      if (signal.dead) return;
      try {
        const next = await startSession(
          host,
          {
            onModels: setModels,
            onStats: setStats,
            onView: setView,
            onStatus: setStatus,
            onReady: () => setBooted(true),
          },
          signal,
        );
        if (signal.dead) next.dispose();
        else {
          session = next;
          sessionRef.current = next;
        }
      } catch (error) {
        if (!signal.dead) {
          setStatus({
            tone: "error",
            text: error instanceof Error ? error.message : "Couldn't open the viewer.",
          });
          setBooted(true);
        }
      }
    });
    return () => {
      signal.dead = true;
      session?.dispose();
      sessionRef.current = null;
    };
  }, []);

  const sample = models.find((model) => model.ephemeral);
  const run = (action: (session: Session) => void) => {
    const session = sessionRef.current;
    if (session) action(session);
  };

  function openFiles() {
    inputRef.current?.click();
  }

  function takeFiles(files: File[]) {
    if (files.length === 0) return;
    setSheet(false);
    void sessionRef.current?.loadFiles(files);
  }

  return (
    <main
      className="flex h-dvh min-h-0 flex-col bg-bg text-fg"
      onDragOver={(event) => {
        if (![...event.dataTransfer.types].includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        takeFiles([...event.dataTransfer.files]);
      }}
    >
      <header className="safe-top safe-x flex items-center gap-2 border-b border-border bg-surface px-3 pb-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight font-medium tracking-tight">Plinth</p>
          <p className="truncate text-xs text-muted">STL shelf</p>
        </div>
        <HelpDialog standalone={standalone} />
        <button
          type="button"
          className="press relative inline-flex size-11 items-center justify-center rounded-md text-fg md:hidden"
          aria-label="Shelf"
          aria-expanded={sheet}
          onClick={() => setSheet((open) => !open)}
        >
          <Layers className="size-5" aria-hidden="true" />
          <span className="absolute top-1 right-1 min-w-4 rounded-sm bg-primary px-1 text-center text-xs font-medium text-primary-fg tabular-nums">
            {models.length}
          </span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
          <Panel
            models={models}
            view={view}
            booted={booted}
            onUpAxis={(id, axis) => run((session) => void session.setUpAxis(id, axis))}
            onRest={(sessionAction) => run(sessionAction)}
          />
        </aside>
        <div className="relative min-w-0 flex-1">
          <div ref={hostRef} className="stage-host absolute inset-0" />
          <div className="pointer-events-none absolute inset-0">
            <div className="safe-x absolute top-3 right-3 left-3">
              <p className="font-mono text-xs text-muted tabular-nums">
                {stats.size
                  ? `${formatDim(stats.size[0])} × ${formatDim(stats.size[1])} × ${formatDim(stats.size[2])}`
                  : booted
                    ? "Nothing visible"
                    : "Opening shelf"}
                {stats.size ? (
                  <span className="text-subtle">
                    {" "}
                    units · {formatTris(stats.triangles)} tris
                  </span>
                ) : null}
              </p>
              {status ? (
                <div
                  role="status"
                  className="pointer-events-auto mt-2 flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  <p className={status.tone === "error" ? "text-danger" : "text-fg"}>{status.text}</p>
                  <button
                    type="button"
                    className="shrink-0 text-muted"
                    onClick={() => sessionRef.current?.clearStatus()}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </div>
            {dragging ? (
              <div className="absolute inset-3 rounded-xl border border-accent" />
            ) : null}
            {booted && models.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-border bg-surface p-5">
                  <h2 className="font-display text-xl font-medium tracking-tight">Your shelf is empty</h2>
                  <p className="mt-2 text-sm leading-normal text-muted">
                    Load an STL from this phone. It stays here, including after you pin Plinth to your Home
                    Screen.
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    <Button variant="primary" onClick={openFiles} disabled={!booted}>
                      Load STL
                    </Button>
                    <Button onClick={() => void sessionRef.current?.loadSample()}>Use the sample bracket</Button>
                  </div>
                </div>
              </div>
            ) : null}
            {view.mode === "fly" && models.length > 0 ? (
              <FlyPad
                onStick={(x, y) => sessionRef.current?.setStick(x, y)}
                onLift={(value) => sessionRef.current?.setLift(value)}
              />
            ) : null}
          </div>
          {sheet ? (
            <div className="absolute inset-0 z-20 flex flex-col justify-end md:hidden">
              <button
                type="button"
                aria-label="Close shelf"
                className="absolute inset-0 bg-bg/70"
                onClick={() => setSheet(false)}
              />
              <div className="sheet-in relative z-10 flex h-1/2 min-h-0 flex-col overflow-hidden rounded-t-xl border border-border bg-surface">
                <Panel
                  models={models}
                  view={view}
                  booted={booted}
                  onUpAxis={(id, axis) => run((session) => void session.setUpAxis(id, axis))}
                  onRest={(sessionAction) => run(sessionAction)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {sample ? (
        <div className="safe-x flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
          <p className="min-w-0 flex-1 text-sm text-fg">
            Sample bracket <span className="text-muted">is not saved yet</span>
          </p>
          <Button variant="primary" onClick={() => void sessionRef.current?.keepSample()}>
            Keep
          </Button>
          <Button onClick={() => sessionRef.current?.dismissSample()}>Dismiss</Button>
        </div>
      ) : null}

      <footer className="safe-bottom safe-x flex items-center gap-2 border-t border-border bg-surface px-3 pt-2">
        <Button variant="primary" className="min-w-0 flex-1" disabled={!booted} onClick={openFiles}>
          Load STL
        </Button>
        <div className="flex shrink-0 rounded-md bg-bg p-1">
          <ModeButton
            current={view.mode}
            mode="orbit"
            label="Orbit"
            onSelect={(mode) => sessionRef.current?.setMode(mode)}
          />
          <ModeButton
            current={view.mode}
            mode="fly"
            label="Fly"
            onSelect={(mode) => sessionRef.current?.setMode(mode)}
          />
        </div>
        <Button
          className="shrink-0 px-3"
          disabled={stats.visibleCount === 0}
          onClick={() => sessionRef.current?.fit()}
        >
          <Crosshair className="size-4" aria-hidden="true" />
          Fit
        </Button>
      </footer>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          takeFiles(files);
        }}
      />
    </main>
  );
}

function ModeButton({
  current,
  mode,
  label,
  onSelect,
}: {
  current: CameraMode;
  mode: CameraMode;
  label: string;
  onSelect: (mode: CameraMode) => void;
}) {
  const on = current === mode;
  return (
    <button
      type="button"
      aria-pressed={on}
      className={
        on
          ? "h-11 rounded-sm bg-primary px-3 text-sm font-medium text-primary-fg"
          : "h-11 rounded-sm px-3 text-sm font-medium text-muted"
      }
      onClick={() => onSelect(mode)}
    >
      {label}
    </button>
  );
}

function Panel({
  models,
  view,
  booted,
  onUpAxis,
  onRest,
}: {
  models: ModelView[];
  view: ViewOptions;
  booted: boolean;
  onUpAxis: (id: string, axis: UpAxis) => void;
  onRest: (action: (session: Session) => void) => void;
}) {
  return (
    <ModelPanel
      models={models}
      view={view}
      booted={booted}
      onToggle={(id) => onRest((session) => void session.toggleVisible(id))}
      onSolo={(id) => onRest((session) => void session.solo(id))}
      onColor={(id) => onRest((session) => void session.cycleColor(id))}
      onUpAxis={onUpAxis}
      onRename={(id, name) => onRest((session) => void session.rename(id, name))}
      onRemove={(id) => onRest((session) => void session.remove(id))}
      onFrame={(id) => onRest((session) => void session.frame(id))}
      onAll={(visible) => onRest((session) => void session.setAllVisible(visible))}
      onGrid={(on) => onRest((session) => session.setGrid(on))}
      onWire={(on) => onRest((session) => session.setWireframe(on))}
      onSmooth={(on) => onRest((session) => session.setSmooth(on))}
      onSample={() => onRest((session) => void session.loadSample())}
    />
  );
}
