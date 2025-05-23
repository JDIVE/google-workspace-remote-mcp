export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId: string;
  userId?: string;
  method?: string;
  duration?: number;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

export class Logger {
  constructor(private service = 'google-workspace-mcp') {}

  private safeStringify(obj: any): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
  }

  private write(level: LogLevel, entry: Omit<LogEntry, 'timestamp' | 'level'>) {
    const log: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      ...entry,
    };
    console.log(this.safeStringify(log));
  }

  debug(entry: Omit<LogEntry, 'timestamp' | 'level'>) {
    this.write('debug', entry);
  }

  info(entry: Omit<LogEntry, 'timestamp' | 'level'>) {
    this.write('info', entry);
  }

  warn(entry: Omit<LogEntry, 'timestamp' | 'level'>) {
    this.write('warn', entry);
  }

  error(entry: Omit<LogEntry, 'timestamp' | 'level'>) {
    this.write('error', entry);
  }
}
