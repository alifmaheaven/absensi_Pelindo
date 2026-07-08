import { ITicket } from "@/types";
import { create } from "zustand";

type TicketStore = {
  ticket: ITicket | null;
  needsRefresh: boolean;
  setTicket: (ticket: ITicket | null) => void;
  setNeedsRefresh: (v: boolean) => void;
};

export const useTicketStore = create<TicketStore>((set) => ({
  ticket: null,
  needsRefresh: false,
  setTicket: (ticket: ITicket | null) => set({ ticket }),
  setNeedsRefresh: (v: boolean) => set({ needsRefresh: v }),
}));
