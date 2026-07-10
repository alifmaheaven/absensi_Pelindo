export interface IDailyRoutineItem {
  id: string;
  daily_routine_id: string;
  name: string;
  description: string;
  is_photo_required: boolean;
  sort_order: number;
}

export interface IDailyRoutine {
  id: string;
  name: string;
  description: string;
  site_id: string;
  company_id: string;
  is_active: boolean;
  items: IDailyRoutineItem[];
}

export interface IDailyRoutineLogItem {
  id: string;
  daily_routine_log_id: string;
  daily_routine_item_id: string;
  is_checked: boolean;
  checked_at: string | null;
  evidence_file: string | null;
  notes: string | null;
}

export interface IDailyRoutineLog {
  id: string;
  daily_routine_id: string;
  user_id: string;
  site_id: string;
  evidence_group_id: string;
  date: string;
  status: string;
  submitted_at: string | null;
}

export interface ITodayRoutineResponse {
  routine: IDailyRoutine | null;
  log: IDailyRoutineLog | null;
  log_items: IDailyRoutineLogItem[];
}
