import {
  Component, createElement, forwardRef, useEffect,
  type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode,
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

// Decorative motion must not make the underlying page or action unavailable.
// Keep all animation hooks inside this boundary so commit-phase failures recover too.
class MotionBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export type MotionRevealProps = HTMLAttributes<HTMLElement> & {
  as?: Tag;
  delay?: number;
  duration?: number;
  active?: boolean;
  axis?: 'x' | 'y';
  distance?: number;
  fromOpacity?: number;
  fromScale?: number;
};

/** A semantic DOM element whose entrance is driven by Reanimated shared values. */
function AnimatedMotionReveal({
  as = 'div', delay = 0, duration = 240, active = true,
  axis = 'y', distance = 6, fromOpacity = .82, fromScale = 1, style, ...props
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
    transform: [axis === 'x' ? { translateX: distance * (1 - progress.value) }
      : { translateY: distance * (1 - progress.value) }, { scale: fromScale + (1 - fromScale) * progress.value }] as Transform,
  }), [progress, axis, distance, fromOpacity, fromScale]);
  return <AnimatedHost {...props} as={as} data-motion-reveal="" data-motion-engine="reanimated" style={[style, animatedStyle]} />;
}

function RevealFallback({
  as = 'div', delay: _delay, duration: _duration, active: _active,
  axis: _axis, distance: _distance, fromOpacity: _fromOpacity, fromScale: _fromScale, ...props
}: MotionRevealProps) {
  return createElement(as, { ...props, 'data-motion-reveal': '', 'data-motion-engine': 'fallback' });
}

export function MotionReveal(props: MotionRevealProps) {
  return <MotionBoundary fallback={<RevealFallback {...props}/>}><AnimatedMotionReveal {...props}/></MotionBoundary>;
}

/** The WebView handles presses directly, including scroll cancellation and keyboard activation. */
export const MotionPressButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function MotionPressButton({
  type = 'button', ...props
}, ref) {
  return <button {...props} ref={ref} type={type} data-motion-press=""/>;
});
