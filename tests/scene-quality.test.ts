import { describe, expect, it } from 'vitest';
import { chooseSceneQuality, sceneIsOverBudget } from '../src/lib/scene-quality';

const desktop = { width: 1200, pixelRatio: 3, cores: 8, memory: 8, reducedMotion: false };

describe('decorative scene budget', () => {
  it('limits resolution and mobile particle density without downgrading the content', () => {
    expect(chooseSceneQuality(desktop)).toMatchObject({
      quality: 'full',
      particles: 30,
      pixelRatio: 1.75,
    });
    expect(chooseSceneQuality({ ...desktop, width: 390 })).toMatchObject({
      quality: 'compact',
      particles: 18,
      pixelRatio: 1.25,
    });
    expect(chooseSceneQuality({ ...desktop, cores: undefined }).quality).toBe('compact');
  });

  it('uses a complete static composition for reduced motion, save data and small devices', () => {
    for (const overrides of [
      { reducedMotion: true },
      { saveData: true },
      { cores: 4 },
      { memory: 2 },
    ]) {
      expect(chooseSceneQuality({ ...desktop, ...overrides }).quality).toBe('static');
    }
  });

  it('requires sustained misses and ignores incomplete or invalid timing windows', () => {
    expect(sceneIsOverBudget(Array(59).fill(90))).toBe(false);
    expect(sceneIsOverBudget([...Array(59).fill(16), 200])).toBe(false);
    expect(sceneIsOverBudget([...Array(30).fill(50), ...Array(30).fill(16)])).toBe(true);
    expect(sceneIsOverBudget(Array(60).fill(Number.NaN))).toBe(false);
  });
});
