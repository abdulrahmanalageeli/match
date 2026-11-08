import { Component, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import canvasKitUrl from 'canvaskit-wasm/bin/full/canvaskit.wasm?url';
import type { SkiaArtworkProps } from './SkiaArtwork';

let artwork: Promise<ComponentType<SkiaArtworkProps>> | undefined;
function loadArtwork() {
  // CanvasKit must be initialized before the renderer module is evaluated.
  return artwork ??= import('@shopify/react-native-skia/lib/module/web').then(async ({ LoadSkiaWeb }) => {
    await LoadSkiaWeb({ locateFile: () => canvasKitUrl });
    return (await import('./SkiaArtwork')).default;
  });
}

class ArtworkBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** A decorative enhancement: loading or unavailable graphics never blocks signup. */
export function SkiaSurface({ variant, animate, className, fallback }: {
  variant: SkiaArtworkProps['variant']; animate: boolean; className?: string; fallback: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [Artwork, setArtwork] = useState<ComponentType<SkiaArtworkProps> | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [colors, setColors] = useState<{ color?: string; secondColor?: string }>({});
  useEffect(() => {
    let mounted = true;
    void loadArtwork().then(renderer => { if (mounted) setArtwork(() => renderer); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const style = getComputedStyle(node);
    setColors({ color: style.getPropertyValue('--nf-scene-stroke').trim() || undefined,
      secondColor: style.getPropertyValue('--nf-scene-second-stroke').trim() || undefined });
    const measure = () => {
      const width = Math.round(node.clientWidth), height = Math.round(node.clientHeight);
      setSize(current => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const ready = Artwork && size.width > 0 && size.height > 0;
  return <div ref={host} className={className} aria-hidden="true" data-artwork-engine={ready ? 'skia' : 'loading'}>
    {ready ? <ArtworkBoundary fallback={fallback}><Artwork {...size} {...colors} variant={variant} animate={animate}/></ArtworkBoundary> : fallback}
  </div>;
}
