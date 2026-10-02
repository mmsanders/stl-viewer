import * as Dialog from "@radix-ui/react-dialog";
import { Info, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

const onPages = import.meta.env.BASE_URL !== "/";

export function HelpDialog({ standalone }: { standalone: boolean }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className={buttonClass("quiet", "size-11 px-0")} aria-label="How to use Plinth">
          <Info className="size-5" aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/80" />
        <Dialog.Content className="dialog-card z-50 rounded-xl border border-border bg-surface p-4 outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-display text-xl font-medium tracking-tight text-fg">
              How to use Plinth
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={buttonClass("quiet", "size-11 px-0")} aria-label="Close">
                <X className="size-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-4 flex flex-col gap-4 text-sm leading-normal text-muted">
            <section>
              <h3 className="font-medium text-fg">Load</h3>
              <p className="mt-1">
                Tap Load STL and pick one or more files. .stl and .STL both work. The list shows every file,
                because iPhone otherwise greys STLs out. They stay on this phone. Nothing is uploaded.
              </p>
            </section>
            <section>
              <h3 className="font-medium text-fg">Orbit</h3>
              <p className="mt-1">
                One finger turns the view. Pinch to zoom. Two fingers slide to pan. On a computer, drag,
                scroll, and right-drag.
              </p>
            </section>
            <section>
              <h3 className="font-medium text-fg">Fly</h3>
              <p className="mt-1">
                Drag on the model to look. The stick, or W A S D, moves you. A is left, D is right. Rise and
                Drop, or E and Q, go up and down. Shift is faster.
              </p>
            </section>
            <section>
              <h3 className="font-medium text-fg">Shelf</h3>
              <p className="mt-1">
                Show or hide each file. Parts keep their saved coordinates, so an assembly still lines up.
                Z-up stands a print upright when the file used Z as vertical. Fit frames whatever is visible.
              </p>
            </section>
            <section>
              <h3 className="font-medium text-fg">Home Screen</h3>
              {standalone ? (
                <p className="mt-1">Plinth is already on your Home Screen. Files you load stay with this icon.</p>
              ) : (
                <>
                  <p className="mt-1">
                    Open this page in Safari, tap Share, then Add to Home Screen. The shelf comes with the
                    icon.
                  </p>
                  {onPages ? null : (
                    <a href="/?install=1&platform=ios" className={buttonClass("primary", "mt-3 w-full")}>
                      Step-by-step pictures
                    </a>
                  )}
                </>
              )}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
