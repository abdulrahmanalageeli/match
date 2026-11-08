import {
  createElement, forwardRef, useEffect,
  type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes,
} from 'react';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { useDevicePreferences, useSystemReducedMotion } from '../settings/preferences';

type Transform = Record<string, number | string>[];
type MotionStyle = Omit<CSSProperties, 'transform'> & { transform?: string | Transform };
type HostStyle = MotionStyle | readonly HostStyle[] | undefined;

// Reanimated updates HTMLElement styles directly on web. Its initial React
// render still uses RN transform arrays, so normalize those at the DOM boundary.
function domStyle(style: HostStyle): CSSProperties | undefined {
  if (!style) return undefined;
  const flat = (Array.isArray(style)
    ? Object.assign({}, ...style.map(item => domStyle(item))) : style) as MotionStyle;
  const { transform, ...rest } = flat;
  return {
    ...rest,
    ...(transform === undefined ? {} : {
      transform: typeof transform === 'string' ? transform : transform.map(operation =>
        Object.entries(operation).map(([name, value]) =>
          `${name}(${typeof value === 'number' && name.startsWith('translate') ? `${value}px` : value})`
        ).join(' ')
      ).join(' '),
    }),
  };
}

type Tag = 'div' | 'span' | 'p' | 'section' | 'article' | 'header' | 'h1' | 'h2' | 'h3';
type DomHostProps = Omit<HTMLAttributes<HTMLElement>, 'style'> & { as?: Tag; style?: HostStyle };
const DomHost = forwardRef<HTMLElement, DomHostProps>(function DomHost({ as = 'div', style, ...props }, ref) {
  return createElement(as, { ...props, ref, style: domStyle(style) });
});
const AnimatedHost = Animated.createAnimatedComponent(DomHost);

export type MotionRevealProps = HTMLAttributes<HTMLElement> & {
  as?: Tag;
  delay?: number;
  duration?: number;
  active?: boolean;
  axis?: 'x' | 'y';
  distance?: number;
  fromOpacity?: number;
};

/** A semantic DOM element whose entrance is driven by Reanimated shared values. */
export function MotionReveal({
  as = 'div', delay = 0, duration = 480, active = true,
  axis = 'y', distance = 10, fromOpacity = 0, style, ...props
}: MotionRevealProps) {
  const { value } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const reduced = value.reducedMotion || systemReduced;
  const progress = useSharedValue(active && !reduced && !document.hidden ? 0 : 1);
  useEffect(() => {
    const finish = () => { cancelAnimation(progress); progress.value = 1; };
    const visibility = () => { if (document.hidden) finish(); };
    if (!active || reduced || document.hidden) finish();
    else progress.value = withDelay(delay, withTiming(1, { duration, easing: Easing.bezier(.22, .78, .28, 1) }));
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      cancelAnimation(progress);
    };
  }, [active, reduced, delay, duration, progress]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fromOpacity + (1 - fromOpacity) * progress.value,
    transform: axis === 'x'
      ? [{ translateX: distance * (1 - progress.value) }]
      : [{ translateY: distance * (1 - progress.value) }],
  }), [progress, axis, distance, fromOpacity]);
  return <AnimatedHost {...props} as={as} data-motion-reveal="" data-motion-engine="reanimated" style={[style, animatedStyle]} />;
}

type ButtonHostProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & { style?: HostStyle };
const ButtonHost = forwardRef<HTMLButtonElement, ButtonHostProps>(function ButtonHost({ style, ...props }, ref) {
  return <button {...props} ref={ref} style={domStyle(style)} />;
});
const AnimatedButton = Animated.createAnimatedComponent(ButtonHost);

/** Native button semantics, with quiet 120ms Reanimated press compression. */
export const MotionPressButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function MotionPressButton({
  disabled, type = 'button', style, onPointerDown, onPointerUp, onPointerCancel,
  onPointerLeave, onKeyDown, onKeyUp, onBlur, ...props
}, ref) {
  const { value } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const reduced = value.reducedMotion || systemReduced;
  const scale = useSharedValue(1);
  const settle = () => {
    scale.value = reduced || disabled || document.hidden ? 1 : withTiming(1, { duration: 120 });
  };
  const press = () => {
    if (!disabled && !reduced && !document.hidden) scale.value = withTiming(.97, { duration: 120 });
  };
  useEffect(() => {
    const finish = () => { cancelAnimation(scale); scale.value = 1; };
    const visibility = () => { if (document.hidden) finish(); };
    if (reduced || disabled || document.hidden) finish();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      cancelAnimation(scale);
    };
  }, [disabled, reduced, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }), [scale]);
  return <AnimatedButton {...props} ref={ref} type={type} disabled={disabled}
    data-motion-press="" data-motion-engine="reanimated" style={[style, animatedStyle]}
    onPointerDown={event => { onPointerDown?.(event); if (!event.defaultPrevented && event.button === 0) press(); }}
    onPointerUp={event => { onPointerUp?.(event); settle(); }}
    onPointerCancel={event => { onPointerCancel?.(event); settle(); }}
    onPointerLeave={event => { onPointerLeave?.(event); settle(); }}
    onKeyDown={event => { onKeyDown?.(event); if (!event.defaultPrevented && !event.repeat && (event.key === ' ' || event.key === 'Enter')) press(); }}
    onKeyUp={event => { onKeyUp?.(event); if (event.key === ' ' || event.key === 'Enter') settle(); }}
    onBlur={event => { onBlur?.(event); settle(); }}
  />;
});
