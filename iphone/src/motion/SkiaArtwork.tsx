import { useEffect, useMemo } from 'react';
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { cancelAnimation, Easing, useDerivedValue, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

export type SkiaArtworkProps = {
  width: number;
  height: number;
  variant: 'intro' | 'scene';
  animate: boolean;
  color?: string;
  secondColor?: string;
};

const curves = {
  scene: [
    ['M-30 248 C10 131 73 58 160 66 C200 71 213 90 226 116',
      'M-30 248 C10 130 100 40 190 70 C228 85 247 69 260 43'],
    ['M550 248 C510 131 447 58 360 66 C320 71 307 90 294 116',
      'M550 248 C510 130 420 40 330 70 C292 85 273 69 260 43'],
  ],
  intro: [
    ['M-52 350 C-45 90 100 5 225 151 C264 210 275 290 302 337',
      'M-52 350 C-45 73 118 -35 260 151 C356 269 401 335 520 365'],
    ['M572 350 C565 90 420 5 295 151 C256 210 245 290 218 337',
      'M572 350 C565 73 402 -35 260 151 C164 269 119 335 0 365'],
  ],
} as const;

/** Imported only after CanvasKit is initialized. Reanimated values update Skia
 * directly; no React render or DOM layout occurs on an animation frame. */
export default function SkiaArtwork({ width, height, variant, animate, color, secondColor }: SkiaArtworkProps) {
  const paths = useMemo(() => curves[variant].map(([from, to]) => ({
    from: Skia.Path.MakeFromSVGString(from)!,
    to: Skia.Path.MakeFromSVGString(to)!,
  })), [variant]);
  const first = useSharedValue(animate ? 0 : 1);
  const second = useSharedValue(animate ? 0 : 1);
  const shape = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    cancelAnimation(first);
    cancelAnimation(second);
    cancelAnimation(shape);
    if (!animate) {
      first.value = second.value = shape.value = 1;
      return;
    }
    first.value = second.value = shape.value = 0;
    const duration = variant === 'intro' ? 2350 : 1300;
    const easing = Easing.bezier(.22, .7, .25, 1);
    first.value = withDelay(50, withTiming(1, { duration, easing }));
    second.value = withDelay(150, withTiming(1, { duration, easing }));
    shape.value = withTiming(1, { duration: variant === 'intro' ? 2600 : 1450, easing });
    return () => {
      cancelAnimation(first);
      cancelAnimation(second);
      cancelAnimation(shape);
    };
  }, [animate, variant, first, second, shape]);

  // SkPath.interpolate weights this path at 1 and its argument at 0.
  const firstPath = useDerivedValue(() => paths[0].to.interpolate(paths[0].from, shape.value) ?? paths[0].to, [paths, shape]);
  const secondPath = useDerivedValue(() => paths[1].to.interpolate(paths[1].from, shape.value) ?? paths[1].to, [paths, shape]);
  const naturalHeight = variant === 'intro' ? 400 : 260;
  const scale = Math.max(width / 520, height / naturalHeight);
  const scaleX = variant === 'intro' ? width / 520 : scale;
  const scaleY = variant === 'intro' ? height / 400 : scale;
  const x = (width - 520 * scaleX) / 2;
  const y = (height - naturalHeight * scaleY) / 2;
  const strokeWidth = 1.35 / Math.max(.01, Math.sqrt(scaleX * scaleY));

  return <Canvas style={{ width, height }} pointerEvents="none" accessible={false}>
    <Group transform={[{ translateX: x }, { translateY: y }, { scaleX }, { scaleY }]}>
      <Path path={firstPath} style="stroke" color={color ?? '#fff9ec'} strokeWidth={strokeWidth} strokeCap="round" start={0} end={first} opacity={variant === 'intro' ? .88 : .8}/>
      <Path path={secondPath} style="stroke" color={secondColor ?? (variant === 'intro' ? '#fff9ec' : '#c6949c')} strokeWidth={strokeWidth} strokeCap="round" start={0} end={second} opacity={variant === 'intro' ? .88 : .36}/>
    </Group>
  </Canvas>;
}
