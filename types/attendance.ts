export interface IAttendance {
  id: string;
  company_id: string;
  contract_id: string;
  user_id: string;
  site_id: string;
  evidence_group_id: string;
  code: string;
  name: string;
  description: string;
  longitude: number;
  langitude: number;
  latitude: number;
  checkin: string | null;
  checkout: null | string;
  created_at: string;
  updated_at: string;
  deleted_at: null;
  x1: null;
  x2: null;
  x3: null;
  x4: null;
  x5: null;
  x6: null;
  x7: null;
  x8: null;
  x9: null;
  x10: null;
  x11: null;
  x12: null;
  x13: null;
  x14: null;
  x15: null;
  x16: null;
  x17: null;
  x18: null;
  x19: null;
  x20: null;
  attendance_status_id: string;
}

export interface IUpload {
  path: string;
  link: string;
}

export interface IAttendanceStatus {
  id: string;
  code: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  deleted_at: null;
  x1: null;
  x2: null;
  x3: null;
  x4: null;
  x5: null;
  x6: null;
  x7: null;
  x8: null;
  x9: null;
  x10: null;
  x11: null;
  x12: null;
  x13: null;
  x14: null;
  x15: null;
  x16: null;
  x17: null;
  x18: null;
  x19: null;
  x20: null;
}

export interface IGroupID {
  id: string;
  code: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  deleted_at: null;
  x1: null;
  x2: null;
  x3: null;
  x4: null;
  x5: null;
  x6: null;
  x7: null;
  x8: null;
  x9: null;
  x10: null;
  x11: null;
  x12: null;
  x13: null;
  x14: null;
  x15: null;
  x16: null;
  x17: null;
  x18: null;
  x19: null;
  x20: null;
}

export type TAttendance = {
  user_id: string;
  company_id: string;
  code: string;
  name: string;
  description: string;
  contract_id: string;
  site_id: string;
  attendance_status_id: string;
  evidence_group_id: string;
  checkin: string | null;
  checkout?: string | null;
  longitude: number | null;
  latitude: number | null;
};

export interface IAttendanceSite {
  id: string;
  company_id: string;
  contract_id: string;
  location_id: string;
  code: string;
  name: string;
  description: string;
  longitude: number;
  latitude: number;
  created_at: string;
  updated_at: string;
  deleted_at: null;
  x1: null;
  x2: null;
  x3: null;
  x4: null;
  x5: null;
  x6: null;
  x7: null;
  x8: null;
  x9: null;
  x10: null;
  x11: null;
  x12: null;
  x13: null;
  x14: null;
  x15: null;
  x16: null;
  x17: null;
  x18: null;
  x19: null;
  x20: null;
  tolerance: number;
}

export interface IAttendanceEvidGroupId {
  id: string;
  evidence_group_id: string;
  code: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  deleted_at: null;
  x1: null;
  x2: null;
  x3: null;
  x4: null;
  x5: null;
  x6: null;
  x7: null;
  x8: null;
  x9: null;
  x10: null;
  x11: null;
  x12: null;
  x13: null;
  x14: null;
  x15: null;
  x16: null;
  x17: null;
  x18: null;
  x19: null;
  x20: null;
  file: string;
}
