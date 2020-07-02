import dotenv from 'dotenv';
import chalk, { Chalk } from "chalk";
import { print } from './console';
dotenv.config({ path: './.env' });

/* eslint-disable no-console */
export const Levels = {
    error: [0xE5433D, chalk.red, console.error] as [number, Chalk, (m?: any) => void],
    warning: [0xFFCC33, chalk.yellow, console.warn] as [number, Chalk, (m?: any) => void],
    info: [0x4CC7E6, chalk.cyanBright, console.log] as [number, Chalk, (m?: any) => void],
    success: [0x4CE65B, chalk.greenBright, console.log] as [number, Chalk, (m?: any) => void],
    debug: [0x4CC7E6, chalk.bgGray.white, console.log] as [number, Chalk, (m?: any) => void],
}
/* eslint-enable no-console */

export type Level = keyof typeof Levels;

export function shouldLog(where: keyof IConfig['logLevel'], level: Level): boolean {
    const max = Config.logLevel[where];
    const [a, b] = [max, level].map(l => Object.keys(Levels).indexOf(l));
    return b <= a;
}

export function validLevel(string?: string): string is Level {
    return !!string && string in Levels;
}

export interface IConfig {
    logLevel: {
        channel: Level;
        console: Level;
    }
    logChannel?: string,
    prefix: string,
    token: string;
    debug: boolean;
    playerRole?: string;
    maxGames: number;
    minPlayers: number;
    maxPlayers: number;
    cardTimeout: number;
    sendInputErrors: boolean;
}

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) throw new Error('No bot token defined');

const {
    LOG_LEVEL_CONSOLE,
    LOG_LEVEL_CHANNEL,
    LOG_LEVEL,
    LOG_CHANNEL,
    PREFIX,
    NODE_ENV,
    PLAYER_ROLE,
    MAX_GAMES,
    MIN_PLAYERS,
    MAX_PLAYERS,
    CARD_TIMEOUT,
    SEND_INPUT_ERRORS,
} = process.env;

function number(s: string | undefined, def: number) {
    const n = Number.parseInt(s ?? '');
    return isNaN(n) ? def : n;
}

const Config: IConfig = {
    logLevel: {
        console: [LOG_LEVEL_CONSOLE, LOG_LEVEL].map(s => s?.toLowerCase()).find(validLevel) ?? 'info',
        channel: [LOG_LEVEL_CHANNEL, LOG_LEVEL].map(s => s?.toLowerCase()).find(validLevel) ?? 'warning',
    },
    logChannel: LOG_CHANNEL,
    prefix: PREFIX || 'p.',
    debug: NODE_ENV === 'development',
    playerRole: PLAYER_ROLE,
    maxGames: number(MAX_GAMES, Number.MAX_VALUE),
    minPlayers: number(MIN_PLAYERS, 2),
    maxPlayers: number(MAX_PLAYERS, Number.MAX_VALUE),
    token,
    cardTimeout: number(CARD_TIMEOUT, 2000),
    sendInputErrors: SEND_INPUT_ERRORS === 'true',
}

export default Config;