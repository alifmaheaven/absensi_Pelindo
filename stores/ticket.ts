import { ITicket } from "@/types";
import { create } from "zustand";

type TicketStore = {
  ticket: ITicket | null;
  setTicket: (ticket: ITicket | null) => void;
};

export const useTicketStore = create<TicketStore>((set) => ({
  ticket: null,
  setTicket: (ticket: ITicket | null) => set({ ticket }),
}));
