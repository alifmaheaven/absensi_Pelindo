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

export interface IActiveOvernightAttendance {
  id: string;
  checkin: string;
  checkout: string | null;
  site_id?: string | null;
}

export interface IScheduleOvernightSession {
  attendance?: IActiveOvernightAttendance;
  attendance_id?: string | null;
  checkin?: string | null;
  schedule?: {
    id: string;
    shift_id: string;
    effective_from: string;
    effective_to?: string | null;
    work_days: number[];
  };
  shift: Ishift;
  shift_date?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  is_overdue: boolean;
  session_hours?: string;
}

export interface IScheduleToday {
  has_schedule: boolean;
  shift: Ishift | null;
  status: 'on_time' | 'late' | 'absent' | 'no_schedule';
  scheduled_start: string | null;
  scheduled_end: string | null;
  message: string;
  active_overnight_session?: IScheduleOvernightSession | null;
}

export interface IWeekScheduleItem {
  date: string;
  day_name: string;
  has_schedule: boolean;
  shift?: Ishift;
  is_today: boolean;
}
