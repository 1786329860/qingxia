export const reminderTemplates = {
  anniversary: {
    name: '并肩的年轮',
    category: '纪念日',
    occasion: '又一年，仍并肩',
    note: '双燕与金枝 · 适合相识、结婚和同行纪念',
    paper: '#f2e8d7',
    ink: '#292d25',
    accent: '#88462f',
    mark: 'ANNIVERSARY',
    layout: 'folio',
    closing: '把这一天，好好留着。',
    placeholder: '很高兴和你走到了这里。还想和你一起，去看看后面的日子。',
  },
  birthday: {
    name: '吹蜡烛以前',
    category: '生日',
    occasion: '生日快乐',
    note: '钴蓝、奶油和糖渍橙 · 给新一岁的礼物',
    paper: '#fff2d9',
    ink: '#152b53',
    accent: '#a63c2c',
    mark: 'BIRTHDAY',
    layout: 'cover',
    closing: '愿这一岁有许多好事。',
    placeholder: '愿新的一岁，有喜欢的事，也有慢慢享受的时间。',
  },
  thanks: {
    name: '把花送给你',
    category: '感谢',
    occasion: '多谢有你',
    note: '花束压印 · 写给愿意伸手的人',
    paper: '#f9ecd6',
    ink: '#183f34',
    accent: '#8c3742',
    mark: 'WITH GRATITUDE',
    layout: 'folio',
    closing: '这份心意，我一直记得。',
    placeholder: '那天你帮了我很多。这句谢谢，我想好好说给你听。',
  },
  congrats: {
    name: '好事登场',
    category: '祝贺',
    occasion: '为你喝彩',
    note: '红绸和纸花 · 送给毕业、升职与每一个新起点',
    paper: '#f8e8cf',
    ink: '#2f2235',
    accent: '#a02f29',
    mark: 'CONGRATULATIONS',
    layout: 'cover',
    closing: '今天值得庆祝。',
    placeholder: '知道这个好消息的时候，我也替你高兴。真想当面和你碰个杯！',
  },
  festival: {
    name: '灯下有团圆',
    category: '节日',
    occasion: '愿此时安好',
    note: '朱红纸灯与金月 · 写给节日里的家人和朋友',
    paper: '#faebcb',
    ink: '#40242b',
    accent: '#972c35',
    mark: 'SEASONAL WISHES',
    layout: 'cover',
    closing: '愿你和想念的人，灯下相聚。',
    placeholder: '节日到了。想起以前一起吃饭的那张桌子，也想起了你。',
  },
  letter: {
    name: '寄一片晴天',
    category: '问候',
    occasion: '见字如面',
    note: '蓝墨风景明信片 · 想念时就写',
    paper: '#edf1ed',
    ink: '#203c55',
    accent: '#325d71',
    mark: 'A NOTE FOR YOU',
    layout: 'folio',
    closing: '下次见面，再慢慢聊。',
    placeholder: '今天的天很蓝，忽然就想起了你。最近过得怎么样？',
  },
} as const;

export type ReminderTemplate = keyof typeof reminderTemplates;
export const defaultReminderTemplate: ReminderTemplate = 'anniversary';
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
