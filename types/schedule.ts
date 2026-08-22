export interface Ishift {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  grace_late: number;
  grace_early: number;
  reminder_minutes?: number;
  is_overnight: boolean;
  color: string;
}

export interface IScheduleToday {
  has_schedule: boolean;
  shift: Ishift | null;
  status: 'on_time' | 'late' | 'absent' | 'no_schedule';
  scheduled_start: string | null;
  scheduled_end: string | null;
  message: string;
}

export interface IWeekScheduleItem {
  date: string;
  day_name: string;
  has_schedule: boolean;
  shift?: Ishift;
  is_today: boolean;
}
