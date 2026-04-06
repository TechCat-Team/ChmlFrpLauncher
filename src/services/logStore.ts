import { frpcManager, type LogMessage } from "./frpcManager";

type LogListener = (logs: LogMessage[]) => void;

class LogStore {
  private logs: LogMessage[] = [];
  private listeners: Set<LogListener> = new Set();
  private isListening = false;
  private maxLogs = 5000;

  async startListening() {
    if (this.isListening) {
      return;
    }

    this.isListening = true;

    await frpcManager.listenToLogs((log: LogMessage) => {
      this.logs.push(log);
      this.trimLogs();
      this.notifyListeners();
    });
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getLogs(): LogMessage[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.notifyListeners();
  }

  addLog(log: LogMessage) {
    this.logs.push(log);
    this.trimLogs();
    this.notifyListeners();
  }

  private notifyListeners() {
    const logsCopy = [...this.logs];
    this.listeners.forEach((listener) => {
      listener(logsCopy);
    });
  }

  private trimLogs() {
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }
}

// 导出单例
export const logStore = new LogStore();
