export type EvidenceType = "none" | "photo" | "file" | "both";

export interface IDailyRoutineItem {
  id: string;
  daily_routine_id: string;
  name: string;
  description: string;
  is_photo_required: boolean;
  evidence_type?: EvidenceType;
  sort_order: number;
}

export interface IDailyRoutineDeviceItem {
  id: string;
  daily_routine_id: string;
  daily_routine_item_id: string;
  device_id: string;
  device_name?: string;
  is_photo_required: boolean;
  evidence_type?: EvidenceType;
}

export interface IDailyRoutine {
  id: string;
  name: string;
  description: string;
  site_id: string;
  company_id: string;
  is_active: boolean;
  frequency?: "daily" | "weekly";
  work_days?: number[] | null;
  items: IDailyRoutineItem[];
  device_items?: IDailyRoutineDeviceItem[];
}

export interface IDailyRoutineLogItem {
  id: string;
  daily_routine_log_id: string;
  daily_routine_item_id: string;
  device_id?: string | null;
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

export interface ITodayRoutinesAllResponse {
  site_id: string;
  routines: ITodayRoutineResponse[];
}

export interface IDailyRoutineSubmitItem {
  daily_routine_item_id: string;
  device_id?: string | null;
  is_checked: boolean;
  evidence_file?: string;
  evidence_type?: EvidenceType;
  notes?: string;
}
