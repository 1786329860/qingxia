export type RandomFill = (array: Uint32Array) => Uint32Array;
const fillFromCrypto: RandomFill = (array) => crypto.getRandomValues(array);
const UINT32_SIZE = 0x100000000;

/** Unbiased integer in [0, maxExclusive), using the same rejection principle as developer-utils. */
export function secureRandomInt(maxExclusive: number, fill: RandomFill = fillFromCrypto): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_SIZE)
    throw new Error('随机范围应为 1～4294967296 之间的整数。');
  const limit = Math.floor(UINT32_SIZE / maxExclusive) * maxExclusive;
  const word = new Uint32Array(1);
  do fill(word);
  while (word[0] >= limit);
  return word[0] % maxExclusive;
}

export function parseNames(input: string, deduplicate = true) {
  if (input.length > 50000) throw new Error('名单过长，请控制在 50,000 个字符以内。');
  const original = input
    .split(/\r\n?|\n/)
    .map((name) => name.trim().normalize('NFC'))
    .filter(Boolean);
  if (!original.length) throw new Error('请先填写名单，每行一个名字。');
  if (original.length > 1000) throw new Error('一次最多支持 1,000 行名单。');
  if (original.some((name) => [...name].length > 80))
    throw new Error('每个名字最多 80 个字符，请缩短过长的行。');
  const unique = [...new Set(original)];
  return {
    names: deduplicate ? unique : original,
    originalCount: original.length,
    duplicateCount: original.length - unique.length,
  };
}

export function drawNames(
  names: readonly string[],
  count: number,
  withReplacement = false,
  fill: RandomFill = fillFromCrypto,
) {
  if (!names.length) throw new Error('签池已空，请重置签池或填写新名单。');
  if (!Number.isInteger(count) || count < 1 || count > 1000)
    throw new Error('抽取数量应为 1～1,000 之间的整数。');
  if (!withReplacement && count > names.length)
    throw new Error(`当前签池只有 ${names.length} 个名额，请减少数量或重置签池。`);
  const remaining = [...names];
  const chosen: string[] = [];
  for (let i = 0; i < count; i++) {
    const index = secureRandomInt(remaining.length, fill);
    chosen.push(remaining[index]);
    if (!withReplacement) remaining.splice(index, 1);
  }
  return { chosen, remaining };
}

export type WheelOption = { label: string; weight: number };
export type WheelSegment = WheelOption & { start: number; end: number; middle: number };
export function validateWheelOptions(options: readonly WheelOption[]): WheelOption[] {
  if (options.length < 2 || options.length > 24) throw new Error('转盘需要 2～24 个选项。');
  const normalized = options.map(({ label, weight }) => ({
    label: label.trim().normalize('NFC'),
    weight,
  }));
  if (normalized.some(({ label }) => !label || [...label].length > 40))
    throw new Error('请填写每个选项的名称，最多 40 个字符。');
  if (new Set(normalized.map(({ label }) => label)).size !== normalized.length)
    throw new Error('选项名称不能重复；同一个选项可通过增加权重调整机会。');
  if (normalized.some(({ weight }) => !Number.isInteger(weight) || weight < 1 || weight > 1000))
    throw new Error('每项权重应为 1～1,000 之间的整数。');
  return normalized;
}

export function wheelSegments(options: readonly WheelOption[]): WheelSegment[] {
  const valid = validateWheelOptions(options);
  const total = valid.reduce((sum, option) => sum + option.weight, 0);
  let cumulative = 0;
  return valid.map((option) => {
    const start = (cumulative / total) * 360;
    cumulative += option.weight;
    const end = (cumulative / total) * 360;
    return { ...option, start, end, middle: (start + end) / 2 };
  });
}

export function chooseWeighted(options: readonly WheelOption[], fill: RandomFill = fillFromCrypto) {
  const valid = validateWheelOptions(options);
  const total = valid.reduce((sum, option) => sum + option.weight, 0);
  const ticket = secureRandomInt(total, fill);
  let cumulative = 0;
  for (let index = 0; index < valid.length; index++) {
    cumulative += valid[index].weight;
    if (ticket < cumulative) return { index, option: valid[index], total };
  }
  throw new Error('转盘结果暂不可用，请重试。');
}

/** Positive clockwise SVG rotation that places the selected sector's centre at the top pointer. */
export function wheelTargetRotation(current: number, middle: number, turns = 5): number {
  const currentAngle = ((current % 360) + 360) % 360;
  const target = (360 - middle) % 360;
  return current + turns * 360 + ((target - currentAngle + 360) % 360);
}

export type CoinSide = 'heads' | 'tails';
export function flipCoins(count: number, fill: RandomFill = fillFromCrypto): CoinSide[] {
  if (!Number.isInteger(count) || count < 1 || count > 1000)
    throw new Error('连续次数应为 1～1,000 之间的整数。');
  return Array.from({ length: count }, () => (secureRandomInt(2, fill) === 0 ? 'heads' : 'tails'));
}

export const diceSides = [6, 8, 10, 12, 20] as const;
export function rollDice(
  count: number,
  sides: number,
  fill: RandomFill = fillFromCrypto,
): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 6)
    throw new Error('骰子数量应为 1～6 之间的整数。');
  if (!(diceSides as readonly number[]).includes(sides))
    throw new Error('请选择 6、8、10、12 或 20 面骰子。');
  return Array.from({ length: count }, () => secureRandomInt(sides, fill) + 1);
}

export type WheelHistoryEntry = { label: string; at: string };
export const wheelHistoryKey = 'qingxia:wheel-history';
export const wheelHistoryLimit = 20;
export function parseWheelHistory(raw: string | null): {
  history: WheelHistoryEntry[];
  corrupted: boolean;
} {
  if (!raw) return { history: [], corrupted: false };
  if (raw.length > 20000) return { history: [], corrupted: true };
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return { history: [], corrupted: true };
    const valid = data.filter((entry): entry is WheelHistoryEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const item = entry as Record<string, unknown>;
      return (
        typeof item.label === 'string' &&
        item.label.trim().length > 0 &&
        [...item.label].length <= 40 &&
        typeof item.at === 'string' &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item.at) &&
        Number.isFinite(Date.parse(item.at))
      );
    });
    const history = valid.slice(0, wheelHistoryLimit).map(({ label, at }) => ({ label, at }));
    return { history, corrupted: valid.length !== data.length };
  } catch {
    return { history: [], corrupted: true };
  }
}
