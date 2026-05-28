import * as fs from 'fs';
import * as path from 'path';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

class Logger {
  private logFile: string;

  constructor() {
    const logDir = path.resolve(__dirname, '../reports/logs');
    fs.mkdirSync(logDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(logDir, `test-${timestamp}.log`);
  }

  private write(level: LogLevel, message: string): void {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] ${message}`;
    console.log(line);
    fs.appendFileSync(this.logFile, line + '\n');
  }

  info(msg: string)  { this.write('INFO',  msg); }
  warn(msg: string)  { this.write('WARN',  msg); }
  error(msg: string) { this.write('ERROR', msg); }
  debug(msg: string) { this.write('DEBUG', msg); }
}

export const logger = new Logger();
