import { useEffect, useRef } from 'react';
import { chooseSceneQuality, sceneIsOverBudget } from '../lib/scene-quality';
import './breathing-box.css';

const faces = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;

export default function BreathingBox() {
  const element = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const target = element.current;
    const paint = canvas.current;
    if (!target || !paint) return;
    const root = target;
    const surface = paint;
    const context = surface.getContext('2d', { alpha: true });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const capabilities = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const interactionArea =
      root.closest<HTMLElement>('.hero-section, .home-hero, [data-hero]') || root.parentElement;
    let width = 1;
    let height = 1;
    let visible = true;
    let stopped = false;
    let animation = 0;
    let lastDraw = 0;
    let lastFrame = 0;
    let clock = 0;
    let renderedFrames = 0;
    let lightTheme = document.documentElement.dataset.theme === 'light';
    let performanceFallback = false;
    let frameWindow: number[] = [];
    let pointerX = 0;
    let pointerY = 0;
    let currentX = 0;
    let currentY = 0;
    let scrollProgress = 0;
    let settings = chooseSceneQuality({
      width: innerWidth,
      pixelRatio: devicePixelRatio,
      reducedMotion: media.matches,
    });

    const draw = (time: number) => {
      if (!context) return;
      const ratio = settings.pixelRatio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      root.dataset.sceneFrames = String(++renderedFrames);
      const scale = Math.min(width / 500, height / 440);
      const cx = width * 0.5;
      const cy = height * 0.47;
      const color = lightTheme ? '38,102,71' : '187,243,159';
      const stable = root.dataset.sceneState === 'static';
      const progress = stable ? 0 : time;
      for (let index = 0; index < settings.particles; index++) {
        const lane = index % 3;
        const angle = (index / settings.particles) * Math.PI * 2 + progress * (0.12 + lane * 0.025);
        const radius = (150 + lane * 14) * scale;
        const x = cx + Math.cos(angle) * radius + Math.sin(angle * 2) * 5 * scale + currentX * 2;
        const y =
          cy +
          Math.sin(angle) * radius * (0.25 + lane * 0.035) +
          Math.cos(angle) * 33 * scale +
          currentY * 2;
        const depth = (Math.sin(angle) + 1) / 2;
        const opacity = (lightTheme ? 0.23 : 0.24) + depth * 0.48;
        const size = (index % 8 === 0 ? 2.2 : 0.7 + depth * 0.55) * scale;
        context.beginPath();
        context.fillStyle = `rgba(${color},${opacity})`;
        context.arc(x, y, Math.max(0.45, size), 0, Math.PI * 2);
        context.fill();
        if (index % 8 === 0) {
          context.beginPath();
          context.strokeStyle = `rgba(${color},${opacity * 0.2})`;
          context.lineWidth = 0.65;
          context.moveTo(x - 5 * scale, y);
          context.lineTo(x + 5 * scale, y);
          context.moveTo(x, y - 5 * scale);
          context.lineTo(x, y + 5 * scale);
          context.stroke();
        }
      }
    };

    const cancel = () => {
      if (animation) cancelAnimationFrame(animation);
      animation = 0;
      lastFrame = 0;
      lastDraw = 0;
      frameWindow = [];
    };
    const setTransform = () => {
      root.style.setProperty('--breathing-pointer-x', `${currentX.toFixed(3)}deg`);
      root.style.setProperty('--breathing-pointer-y', `${currentY.toFixed(3)}deg`);
      root.style.setProperty('--breathing-scroll', `${(scrollProgress * -14).toFixed(2)}px`);
      root.style.setProperty('--breathing-light-x', `${50 + currentX * 4}%`);
    };
    const tick = (now: number) => {
      if (stopped || root.dataset.sceneState !== 'running') return;
      if (lastFrame) frameWindow.push(now - lastFrame);
      lastFrame = now;
      if (frameWindow.length >= 90) {
        if (sceneIsOverBudget(frameWindow)) {
          performanceFallback = true;
          updateState();
          return;
        }
        frameWindow = [];
      }
      // The decoration has a 30fps draw budget; controls remain on the browser's native cadence.
      if (!lastDraw || now - lastDraw >= 1000 / 30) {
        const elapsed = lastDraw ? Math.min(100, now - lastDraw) : 0;
        clock += elapsed / 1000;
        lastDraw = now;
        currentX += (pointerX - currentX) * 0.1;
        currentY += (pointerY - currentY) * 0.1;
        setTransform();
        draw(clock);
      }
      animation = requestAnimationFrame(tick);
    };
    function updateState() {
      if (stopped) return;
      cancel();
      settings = chooseSceneQuality({
        width: innerWidth,
        pixelRatio: devicePixelRatio,
        cores: capabilities.hardwareConcurrency,
        memory: capabilities.deviceMemory,
        saveData: capabilities.connection?.saveData,
        reducedMotion: media.matches,
      });
      const isStatic = settings.quality === 'static' || performanceFallback || !context;
      root.dataset.sceneMode = isStatic ? 'static' : 'animated';
      root.dataset.sceneQuality = isStatic ? 'static' : settings.quality;
      root.dataset.sceneParticles = String(settings.particles);
      root.dataset.sceneDpr = String(settings.pixelRatio);
      root.dataset.sceneReason = performanceFallback
        ? 'frame-budget'
        : !context
          ? 'canvas-unavailable'
          : settings.reason;
      root.dataset.sceneState = isStatic
        ? 'static'
        : !visible || document.hidden
          ? 'paused'
          : 'running';
      if (isStatic) {
        currentX = currentY = pointerX = pointerY = scrollProgress = 0;
        setTransform();
      }
      const ratio = settings.pixelRatio;
      surface.width = Math.round(width * ratio);
      surface.height = Math.round(height * ratio);
      draw(clock);
      if (root.dataset.sceneState === 'running') animation = requestAnimationFrame(tick);
    }
    const resize = () => {
      const bounds = root.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      updateState();
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || root.dataset.sceneState !== 'running') return;
      const bounds = root.getBoundingClientRect();
      pointerX =
        Math.max(
          -1,
          Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2)),
        ) * 5;
      pointerY =
        Math.max(
          -1,
          Math.min(1, (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2)),
        ) * -4;
    };
    const leave = () => {
      pointerX = pointerY = 0;
    };
    const scroll = () => {
      if (root.dataset.sceneState !== 'running') return;
      const bounds = root.getBoundingClientRect();
      scrollProgress = Math.max(0, Math.min(1, -bounds.top / Math.max(1, bounds.height)));
    };
    const theme = new MutationObserver(() => {
      lightTheme = document.documentElement.dataset.theme === 'light';
      if (root.dataset.sceneState !== 'running') draw(clock);
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const resizer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    resizer?.observe(root);
    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting;
              updateState();
            },
            { threshold: 0.03 },
          )
        : null;
    observer?.observe(root);
    document.addEventListener('visibilitychange', updateState);
    media.addEventListener('change', updateState);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true });
    interactionArea?.addEventListener('pointermove', pointer, { passive: true });
    interactionArea?.addEventListener('pointerleave', leave);
    resize();

    return () => {
      stopped = true;
      cancel();
      observer?.disconnect();
      resizer?.disconnect();
      theme.disconnect();
      document.removeEventListener('visibilitychange', updateState);
      media.removeEventListener('change', updateState);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', scroll);
      interactionArea?.removeEventListener('pointermove', pointer);
      interactionArea?.removeEventListener('pointerleave', leave);
      context?.clearRect(0, 0, surface.width, surface.height);
      surface.width = surface.height = 1;
    };
  }, []);

  return (
    <div
      ref={element}
      className="breathing-scene"
      aria-hidden="true"
      data-scene-state="static"
      data-scene-quality="static"
    >
      <div className="breathing-floor" />
      <div className="breathing-orbit breathing-orbit-far" />
      <canvas className="breathing-particles" ref={canvas} />
      <div className="breathing-camera">
        <div className="breathing-lift">
          <div className="breathing-assembly">
            <div className="breathing-core">
              {faces.map((face) => (
                <span key={face} className={`breathing-core-face breathing-face-${face}`} />
              ))}
            </div>
            <div className="breathing-glass">
              {faces.map((face) => (
                <span key={face} className={`breathing-glass-face breathing-face-${face}`}>
                  {face === 'front' && (
                    <span className="breathing-etch">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="breathing-lid">
              {faces.map((face) => (
                <span key={face} className={`breathing-lid-face breathing-face-${face}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="breathing-orbit breathing-orbit-near" />
      <div className="breathing-coordinate breathing-coordinate-left">
        <span />
        <span />
      </div>
      <div className="breathing-coordinate breathing-coordinate-right">
        <span />
        <span />
      </div>
    </div>
  );
}
