import axios from "@/lib/axios";
import { Response } from "@/types";
import { IScheduleToday, IWeekScheduleItem } from "@/types";

export async function getTodaySchedule(): Promise<Response<IScheduleToday>> {
  try {
    const response = await axios.get("/schedule/today");
    return response.data;
  } catch (error) {
    console.error("Failed to fetch today schedule:", error);
    throw error;
  }
}

export async function getWeekSchedule(): Promise<Response<{ schedules: IWeekScheduleItem[] }>> {
  try {
    const response = await axios.get("/schedule/week");
    return response.data;
  } catch (error) {
    console.error("Failed to fetch week schedule:", error);
    throw error;
  }
}
