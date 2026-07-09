'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent
} from 'react';
import { createPortal } from 'react-dom';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SCALE = 2.5;
const SWIPE_CLOSE_PX = 72;

type OpenState = { src: string; alt: string };

type OpenPhotoFn = (src: string, alt: string, trigger: HTMLElement) => void;

const ChatPhotoLightboxContext = createContext<OpenPhotoFn | null>(null);

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function touchDistance(touches: React.TouchList) {
  if (touches.length < 2) return 0;
  const a = touches.item(0);
  const b = touches.item(1);
  if (!a || !b) return 0;
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function ChatPhotoLightboxViewer({
  open,
  onClose
}: {
  open: OpenState;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const lastTapRef = useRef(0);
  const swipeRef = useRef<{ y: number; active: boolean } | null>(null);

  const resetTransform = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setSwipeOffset(0);
  }, []);

  useEffect(() => {
    resetTransform();
    dialogRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open.src, resetTransform]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((s) => clamp(s * factor, MIN_SCALE, MAX_SCALE));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const canPan = scale > 1.02;

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canPan) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: translate.x,
      ty: translate.y
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setTranslate({
      x: d.tx + (e.clientX - d.x),
      y: d.ty + (e.clientY - d.y)
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onDoubleTap = (clientX: number, clientY: number) => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      setScale((s) => {
        if (s > 1.05) {
          setTranslate({ x: 0, y: 0 });
          return 1;
        }
        return DOUBLE_TAP_SCALE;
      });
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    void clientX;
    void clientY;
  };

  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = { dist: touchDistance(e.touches), scale };
      swipeRef.current = null;
      return;
    }
    if (e.touches.length === 1 && scale <= 1.05) {
      swipeRef.current = { y: e.touches[0].clientY, active: true };
    }
    if (e.touches.length === 1 && canPan) {
      dragRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        tx: translate.x,
        ty: translate.y
      };
    }
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dist = touchDistance(e.touches);
      const ratio = dist / pinchRef.current.dist;
      setScale(clamp(pinchRef.current.scale * ratio, MIN_SCALE, MAX_SCALE));
      return;
    }
    const swipe = swipeRef.current;
    if (swipe?.active && e.touches.length === 1 && scale <= 1.05) {
      const dy = e.touches[0].clientY - swipe.y;
      if (dy > 0) setSwipeOffset(dy);
      return;
    }
    const d = dragRef.current;
    if (d && e.touches.length === 1 && canPan) {
      setTranslate({
        x: d.tx + (e.touches[0].clientX - d.x),
        y: d.ty + (e.touches[0].clientY - d.y)
      });
    }
  };

  const onTouchEnd = (e: ReactTouchEvent) => {
    pinchRef.current = null;
    dragRef.current = null;
    if (swipeOffset >= SWIPE_CLOSE_PX && scale <= 1.05) {
      onClose();
      return;
    }
    setSwipeOffset(0);
    swipeRef.current = null;
    if (e.changedTouches.length === 1 && scale <= 1.05) {
      onDoubleTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  };

  const opacity = swipeOffset > 0 ? clamp(1 - swipeOffset / 240, 0.35, 1) : 1;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-[200] flex items-center justify-center outline-none"
      style={{ backgroundColor: `rgba(0,0,0,${0.92 * opacity})` }}
      onClick={onBackdropClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <p id={titleId} className="sr-only">
        {open.alt || '사진 원본 보기'}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/50 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/70"
        aria-label="닫기"
      >
        ✕
      </button>
      <div
        ref={viewportRef}
        className="flex max-h-full max-w-full touch-none items-center justify-center p-4"
        style={{
          transform: swipeOffset > 0 ? `translateY(${swipeOffset}px)` : undefined,
          transition: swipeRef.current ? 'none' : 'transform 0.2s ease'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={open.src}
          alt={open.alt}
          draggable={false}
          className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] select-none object-contain"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            cursor: canPan ? 'grab' : 'zoom-in'
          }}
          onDoubleClick={() => {
            setScale((s) => {
              if (s > 1.05) {
                setTranslate({ x: 0, y: 0 });
                return 1;
              }
              return DOUBLE_TAP_SCALE;
            });
          }}
        />
      </div>
    </div>
  );
}

export function ChatPhotoLightboxProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenState | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const openPhoto = useCallback<OpenPhotoFn>((src, alt, trigger) => {
    if (!src?.trim()) return;
    triggerRef.current = trigger;
    setOpen({ src, alt });
  }, []);

  const close = useCallback(() => {
    setOpen(null);
    requestAnimationFrame(() => {
      triggerRef.current?.focus({ preventScroll: true });
    });
  }, []);

  return (
    <ChatPhotoLightboxContext.Provider value={openPhoto}>
      {children}
      {open && typeof document !== 'undefined'
        ? createPortal(<ChatPhotoLightboxViewer open={open} onClose={close} />, document.body)
        : null}
    </ChatPhotoLightboxContext.Provider>
  );
}

type ChatPhotoThumbProps = {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
};

export function ChatPhotoThumb({ src, alt = '', className = '', imgClassName = '' }: ChatPhotoThumbProps) {
  const openPhoto = useContext(ChatPhotoLightboxContext);
  if (!src) return null;

  return (
    <button
      type="button"
      className={`block cursor-zoom-in border-0 bg-transparent p-0 text-left ${className}`}
      aria-label="사진 원본 보기"
      onClick={(e) => {
        if (openPhoto) openPhoto(src, alt, e.currentTarget);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={imgClassName} draggable={false} loading="lazy" />
    </button>
  );
}
