export const reminderTemplates = {
  birthday: {
    name: '烛光邮局',
    occasion: '生日快乐',
    note: '酒红与奶油色 · 一簇暖光',
    paper: '#f8e9d9',
    ink: '#5e2037',
    accent: '#963d54',
    placeholder: '愿新的一岁，有喜欢的事，也有慢慢享受的时间。',
  },
  anniversary: {
    name: '时间的两条线',
    occasion: '纪念日快乐',
    note: '苔绿与米白 · 两条交会的轨道',
    paper: '#ebefdf',
    ink: '#263c2d',
    accent: '#57704d',
    placeholder: '很高兴走到今天，也很期待我们还没去过的地方。',
  },
  letter: {
    name: '一封蓝色短笺',
    occasion: '一封写给你的信',
    note: '蓝墨与本白 · 一枚小小的邮戳',
    paper: '#f2f2fc',
    ink: '#273363',
    accent: '#4a56a1',
    placeholder: '今天忽然想起你。希望这封短笺能在对的时间抵达。',
  },
} as const;

export type ReminderTemplate = keyof typeof reminderTemplates;
export const reminderOptions = Object.keys(reminderTemplates) as ReminderTemplate[];
export const isReminderTemplate = (value: unknown): value is ReminderTemplate =>
  typeof value === 'string' && Object.hasOwn(reminderTemplates, value);

export type ReminderState =
  'awaiting' | 'queued' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'cancelled' | 'expired';
export interface Reminder {
  id: string;
  recipient: string;
  recipient_name: string;
  message: string;
  template: ReminderTemplate;
  due_at: string;
  state: ReminderState;
}
