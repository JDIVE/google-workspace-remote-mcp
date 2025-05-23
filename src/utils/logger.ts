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

  private write(level: LogLevel, entry: Omit<LogEntry, 'timestamp' | 'level'>) {
    const log: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      ...entry,
    };
    console.log(JSON.stringify(log));
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
