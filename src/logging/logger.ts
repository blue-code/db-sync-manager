/**
 * 로깅.
 *
 * 실행 SQL / 진행 / 에러를 구조화 기록으로 남긴다. 라인 포맷은 순수 함수,
 * 출력 대상은 LogSink 로 추상화해 메모리(테스트)·파일·콘솔을 갈아끼운다.
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  at: string;
  level: LogLevel;
  event: string;
  message: string;
  /** 실행 SQL(있으면). */
  sql?: string;
}

/** 로그 항목을 한 줄 텍스트로 포맷한다(순수). */
export function formatLogLine(entry: LogEntry): string {
  const base = `[${entry.at}] ${entry.level.toUpperCase()} ${entry.event} ${entry.message}`;
  return entry.sql ? `${base}\n  SQL> ${entry.sql}` : base;
}

/** 로그 출력 대상. */
export interface LogSink {
  write(entry: LogEntry): void | Promise<void>;
}

/** 메모리 싱크(테스트·미리보기용). */
export class MemorySink implements LogSink {
  entries: LogEntry[] = [];
  write(entry: LogEntry): void {
    this.entries.push(entry);
  }
  /** 누적된 로그를 한 텍스트로 합친다. */
  render(): string {
    return this.entries.map(formatLogLine).join("\n");
  }
}

/**
 * 한 번의 실행 흐름을 기록하는 로거.
 * clock 을 주입해 시각을 결정론적으로 만든다(테스트 용이).
 */
export class RunLogger {
  constructor(
    private sink: LogSink,
    private clock: () => Date,
  ) {}

  private async emit(
    level: LogLevel,
    event: string,
    message: string,
    sql?: string,
  ): Promise<void> {
    const entry: LogEntry = {
      at: this.clock().toISOString(),
      level,
      event,
      message,
    };
    if (sql !== undefined) entry.sql = sql;
    await this.sink.write(entry);
  }

  start(message: string): Promise<void> {
    return this.emit("info", "start", message);
  }
  statement(sql: string): Promise<void> {
    return this.emit("info", "sql", "문장 실행", sql);
  }
  complete(message: string): Promise<void> {
    return this.emit("info", "complete", message);
  }
  error(message: string, sql?: string): Promise<void> {
    return this.emit("error", "error", message, sql);
  }
}
