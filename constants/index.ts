export const TIMEZONE = "Asia/Jakarta";

export const IMAGE_QUALITY = 0.5;
export const IMAGE_MAX_WIDTH = 1280;

export const DEFAULT_PAGE_SIZE = 10;

export const DEFAULT_WORK_HOURS = {
  checkin: 9,
  checkout: 17,
};

export const ATTENDANCE_WINDOW_HOURS = 8;

// Used to look up attendance_status by stable `code` rather than fragile UUID
export const ATTENDANCE_STATUS_CODE_CHECKIN = "checkin";

// Used to look up default ticket status by stable `code` rather than fragile UUID
export const TICKET_STATUS_CODE_OPEN = "open";

export const MAX_SITES_PROXIMITY = 50;

export const IMAGE_BASE_PATH = "/public/images/";
