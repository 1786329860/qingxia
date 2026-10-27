import { describe, expect, it } from 'vitest';
import {
  chooseWeighted,
  drawNames,
  flipCoins,
  parseNames,
  parseWheelHistory,
  rollDice,
  secureRandomInt,
  validateWheelOptions,
  wheelSegments,
  wheelTargetRotation,
  type RandomFill,
} from '../src/lib/fun-random';

function words(values: number[]): RandomFill {
  let index = 0;
  return (array) => {
    array[0] = values[index++ % values.length];
    return array;
  };
}

describe('安全整数抽样', () => {
  it('拒绝取模偏差区，保留可接受值的上下界', () => {
    expect(secureRandomInt(6, words([0xffffffff, 0]))).toBe(0);
    expect(secureRandomInt(6, words([0xfffffffb]))).toBe(5);
    expect(secureRandomInt(0x100000000, words([0xffffffff]))).toBe(0xffffffff);
    expect(secureRandomInt(1, words([0xffffffff]))).toBe(0);
  });
  it('不接受空、超限或非整数范围', () => {
    for (const value of [0, -1, 1.2, Number.NaN, Infinity, 0x100000001])
      expect(() => secureRandomInt(value)).toThrow();
  });
});

describe('名单和抽签', () => {
  it('空行与首尾空格不占签，Unicode等价名字可去重', () => {
    expect(parseNames(' 小林 \r\n\r小林\n e\u0301\né\n')).toEqual({
      names: ['小林', 'é'],
      originalCount: 4,
      duplicateCount: 2,
    });
    expect(parseNames('小林\n小林', false).names).toEqual(['小林', '小林']);
  });
  it('拒绝空名单、过长行和过多名额', () => {
    expect(() => parseNames(' \n\t')).toThrow();
    expect(() => parseNames('人'.repeat(81))).toThrow();
    expect(() => parseNames(Array.from({ length: 1001 }, () => '人').join('\n'))).toThrow();
    expect(() => parseNames('x'.repeat(50001))).toThrow();
  });
  it('不放回时移出抽中名额，下一轮沿用剩余签池', () => {
    const first = drawNames(['甲', '乙', '丙'], 2, false, words([0, 1]));
    expect(first).toEqual({ chosen: ['甲', '丙'], remaining: ['乙'] });
    expect(drawNames(first.remaining, 1, false, words([0]))).toEqual({
      chosen: ['乙'],
      remaining: [],
    });
  });
  it('可放回时允许重复，同名未去重时仍以行作为名额', () => {
    expect(drawNames(['甲', '乙'], 3, true, words([1])).chosen).toEqual(['乙', '乙', '乙']);
    expect(drawNames(['甲', '甲'], 2, false, words([0])).chosen).toEqual(['甲', '甲']);
  });
  it('无效数量和人数不足给出错误', () => {
    for (const count of [0, -1, 1.5, 1001, Number.NaN])
      expect(() => drawNames(['甲'], count)).toThrow();
    expect(() => drawNames([], 1)).toThrow();
    expect(() => drawNames(['甲'], 2)).toThrow();
  });
});

describe('权重与指针', () => {
  const options = [
    { label: '甲', weight: 1 },
    { label: '乙', weight: 3 },
    { label: '丙', weight: 2 },
  ];
  it('每一个整数抽签区间都匹配真实权重边界', () => {
    expect(
      [0, 1, 2, 3, 4, 5].map((ticket) => chooseWeighted(options, words([ticket])).index),
    ).toEqual([0, 1, 1, 1, 2, 2]);
  });
  it('扇区角度按实际权重构造，最终旋转让选中中心对准指针', () => {
    const segments = wheelSegments(options);
    expect(segments.map(({ start, end }) => [start, end])).toEqual([
      [0, 60],
      [60, 240],
      [240, 360],
    ]);
    let rotation = 0;
    for (const segment of [...segments, ...segments]) {
      const next = wheelTargetRotation(rotation, segment.middle);
      expect(next).toBeGreaterThanOrEqual(rotation + 5 * 360);
      expect((next + segment.middle) % 360).toBeCloseTo(0);
      rotation = next;
    }
  });
  it('拒绝缺失、重复名称和无效权重', () => {
    expect(() => validateWheelOptions([{ label: '甲', weight: 1 }])).toThrow();
    for (const weight of [0, -1, 1.5, 1001, Infinity, Number.NaN])
      expect(() =>
        validateWheelOptions([
          { label: '甲', weight },
          { label: '乙', weight: 1 },
        ]),
      ).toThrow();
    expect(() =>
      validateWheelOptions([
        { label: '甲', weight: 1 },
        { label: ' 甲 ', weight: 1 },
      ]),
    ).toThrow();
    expect(() =>
      validateWheelOptions([
        { label: '', weight: 1 },
        { label: '乙', weight: 1 },
      ]),
    ).toThrow();
    expect(() =>
      validateWheelOptions(Array.from({ length: 25 }, (_, i) => ({ label: `${i}`, weight: 1 }))),
    ).toThrow();
  });
});

describe('硬币与骰子', () => {
  it('硬币每个输入整数对应明确面，批量次数准确', () => {
    expect(flipCoins(4, words([0, 1, 2, 3]))).toEqual(['heads', 'tails', 'heads', 'tails']);
    for (const count of [0, 1.5, 1001]) expect(() => flipCoins(count)).toThrow();
  });
  it('各面骰子的边界和1～6个骰子准确', () => {
    for (const sides of [6, 8, 10, 12, 20]) {
      expect(rollDice(2, sides, words([0, sides - 1]))).toEqual([1, sides]);
      expect(rollDice(6, sides, words([1]))).toHaveLength(6);
    }
    for (const count of [0, 7, 1.5]) expect(() => rollDice(count, 6)).toThrow();
    expect(() => rollDice(1, 7)).toThrow();
  });
});

describe('本机转盘历史', () => {
  const record = { label: '甲', at: '2026-10-27T00:00:00.000Z' };
  it('保留有效条目且只留最近20条，不信任额外字段', () => {
    const parsed = parseWheelHistory(
      JSON.stringify(Array.from({ length: 30 }, () => ({ ...record, extra: '不保留' }))),
    );
    expect(parsed.history).toHaveLength(20);
    expect(parsed.history[0]).toEqual(record);
  });
  it('损坏或过大存储降级为空，并标记损坏', () => {
    expect(parseWheelHistory(null)).toEqual({ history: [], corrupted: false });
    expect(parseWheelHistory('{bad}').corrupted).toBe(true);
    expect(parseWheelHistory('x'.repeat(20001)).corrupted).toBe(true);
    expect(parseWheelHistory(JSON.stringify([record, { label: '乙', at: 'bad' }]))).toEqual({
      history: [record],
      corrupted: true,
    });
  });
});
