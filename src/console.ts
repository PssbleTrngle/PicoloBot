import { Level, Levels, shouldLog } from './config';

export function print(level: Level, line: string): void {
    if (shouldLog('console', level)) {
        const [, chalk, log] = Levels[level];
        log(chalk(`[${level.toUpperCase()}] ${line}`));
    }
}

export function printLine(level?: Level): void {
    // eslint-disable-next-line no-console
    if (!level || shouldLog('console', level)) console.log();
}