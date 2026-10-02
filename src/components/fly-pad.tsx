import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

type FlyPadProps = {
  onStick: (x: number, y: number) => void;
  onLift: (value: number) => void;
};

export function FlyPad({ onStick, onLift }: FlyPadProps) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  function update(clientX: number, clientY: number) {
    const rect = pad.current?.getBoundingClientRect();
    if (!rect) return;
    const max = rect.width / 2;
    let x = (clientX - (rect.left + rect.width / 2)) / max;
    let y = -((clientY - (rect.top + rect.height / 2)) / max);
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    const dead = 0.14;
    setKnob({ x, y });
    onStick(Math.abs(x) < dead ? 0 : x, Math.abs(y) < dead ? 0 : y);
  }

  function endStick() {
    setKnob({ x: 0, y: 0 });
    onStick(0, 0);
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-end justify-between px-3">
      <div className="pointer-events-auto flex items-end gap-3">
        <div
          ref={pad}
          role="group"
          aria-label="Move"
          className="relative size-28 touch-none rounded-full border border-border bg-surface"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            update(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              update(event.clientX, event.clientY);
            }
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            endStick();
          }}
          onPointerCancel={endStick}
        >
          <span
            className="absolute top-1/2 left-1/2 size-11 rounded-full bg-primary"
            style={{
              transform: `translate(-50%, -50%) translate(${knob.x * 32}px, ${-knob.y * 32}px)`,
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <HoldButton label="Rise" onHold={(down) => onLift(down ? 1 : 0)}>
            <ArrowUp className="size-5" aria-hidden="true" />
          </HoldButton>
          <HoldButton label="Drop" onHold={(down) => onLift(down ? -1 : 0)}>
            <ArrowDown className="size-5" aria-hidden="true" />
          </HoldButton>
        </div>
      </div>
      <p className="pointer-events-none max-w-28 pb-2 text-right text-xs text-muted">Drag to look</p>
    </div>
  );
}

function HoldButton({
  label,
  onHold,
  children,
}: {
  label: string;
  onHold: (down: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="press inline-flex size-11 items-center justify-center rounded-md border border-border bg-surface text-fg"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
    >
      {children}
    </button>
  );
}
