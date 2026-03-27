import type { ClientMessage, ServerMessage } from '../types/network';

type RoomClientOptions = {
  url: string;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  onMessage?: (message: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onReconnectAttempt?: (attempt: number, delayMs: number) => void;
};

export class RoomClient {
  private socket: WebSocket | null = null;
  private readonly options: RoomClientOptions;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private manuallyClosed = false;

  constructor(options: RoomClientOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }

    this.manuallyClosed = false;
    this.clearReconnectTimer();

    this.socket = new WebSocket(this.options.url);
    this.socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.options.onOpen?.();
    });
    this.socket.addEventListener('close', (event) => {
      this.socket = null;
      this.options.onClose?.(event);
      if (!this.manuallyClosed && this.options.reconnect !== false) {
        this.scheduleReconnect();
      }
    });
    this.socket.addEventListener('error', (event) => this.options.onError?.(event));
    this.socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as ServerMessage;
        this.options.onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse realtime message', error);
      }
    });
  }

  disconnect(code?: number, reason?: string): void {
    this.manuallyClosed = true;
    this.clearReconnectTimer();
    this.socket?.close(code, reason);
    this.socket = null;
  }

  send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('Realtime socket is not open; dropping message', message.type);
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempts += 1;
    const baseDelay = this.options.reconnectDelayMs ?? 1000;
    const maxDelay = this.options.maxReconnectDelayMs ?? 10000;
    const delayMs = Math.min(baseDelay * 2 ** (this.reconnectAttempts - 1), maxDelay);
    this.options.onReconnectAttempt?.(this.reconnectAttempts, delayMs);
    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
