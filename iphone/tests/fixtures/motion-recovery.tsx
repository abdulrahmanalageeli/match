import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionPressButton, MotionReveal } from '../../src/motion/Reanimated';

// Exercise actual React render/commit recovery with the animation's browser
// dependency unavailable. This fixture is never imported by the application.
const fault = new URLSearchParams(location.search).get('fault') === 'effect' ? 'effect' : 'render';
const nativeMatchMedia = window.matchMedia.bind(window);
window.matchMedia = query => {
  if (fault === 'render') throw new Error('Injected motion render failure');
  const media = nativeMatchMedia(query);
  media.addEventListener = () => { throw new Error('Injected motion effect failure'); };
  return media;
};

function Fixture() {
  const action = useRef<HTMLButtonElement>(null);
  const [clicks, setClicks] = useState(0);
  const [result, setResult] = useState('Waiting for motion recovery');
  useEffect(() => {
    const verify = () => {
      const heading = document.getElementById('test-heading');
      if (heading?.dataset.motionEngine !== 'fallback' || action.current?.dataset.motionEngine !== 'fallback') return;
      const valid = heading.tagName === 'H1' && heading.textContent === 'Your account is available'
        && heading.getAttribute('aria-describedby') === 'test-description'
        && action.current.tagName === 'BUTTON' && action.current.type === 'button'
        && action.current.getAttribute('aria-label') === 'Continue safely'
        && action.current.id === 'test-action' && !action.current.disabled;
      setResult(valid ? `PASS: ${fault} failure preserved semantic content and button ref` : 'FAIL: fallback lost semantics');
    };
    const observer = new MutationObserver(verify);
    observer.observe(document.getElementById('root')!, { childList: true, subtree: true, attributes: true });
    verify();
    return () => observer.disconnect();
  }, []);
  return <main>
    <MotionReveal as="h1" id="test-heading" aria-describedby="test-description" distance={20} fromOpacity={0}>Your account is available</MotionReveal>
    <p id="test-description">Content remains visible when animation cannot initialize.</p>
    <MotionPressButton id="test-action" ref={action} aria-label="Continue safely" onClick={() => setClicks(value => value + 1)}>Continue</MotionPressButton>
    <output aria-label="Button callback count">{clicks}</output>
    <p role="status">{result}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
