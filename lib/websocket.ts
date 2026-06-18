import { getToken } from "./storage";
import { apiClient } from "./axios";

type MessageHandler = (data: any) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private reconnectAttempts = 0;
  private maxReconnect = 10;
  private baseDelay = 2000;
  private sendTo: Record<string, string> = {};
  private path = "/websockets";

  connect(sendTo: Record<string, string> = {}) {
    this.sendTo = sendTo;
    this.reconnectAttempts = 0;
    this._connect();
  }

  private async _connect() {
    try {
      const token = await getToken();
      if (!token) return;

      const baseUrl = apiClient.defaults.baseURL?.replace(/^http/, "ws") || "ws://localhost:3000";
      const params = new URLSearchParams({ token, ...this.sendTo }).toString();
      const url = `${baseUrl}${this.path}?${params}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.data) {
            this.handlers.forEach((h) => h(data.data));
          }
        } catch {
          // ignore
        }
      };

      this.ws.onclose = () => {
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnect) return;
    const delay = this.baseDelay * Math.pow(2, this.reconnectAttempts);
    setTimeout(() => {
      this.reconnectAttempts++;
      this._connect();
    }, delay);
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  offMessage(handler: MessageHandler) {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ send_to: this.sendTo, data }));
    }
  }

  disconnect() {
    this.reconnectAttempts = this.maxReconnect;
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WebSocketClient();
