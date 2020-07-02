import { Message, TextChannel } from "discord.js";
import Bot, { IEmbed } from "./bot";
import Config from "./config";
import Stats from "./database/models/Stats";
import Game from "./database/models/Game";

interface Parameters {
    [key: string]: {
        description: string,
        optional?: boolean,
    };
}

type CommandReturn = string | IEmbed;

interface Command {
    help?: () => string | string[];
    parameters?: Parameters;
    execute: (params: any, message: Message & { channel: TextChannel }) => Promise<CommandReturn> | CommandReturn
}

function helpMessage({ help, parameters }: Command, identifier: string): CommandReturn {
    const params = parameters ? Object.keys(parameters).map(p => `*${p}*`).join(' ') : '';
    const usage = `Usage: ${Config.prefix}${identifier} ${params}`
    const h = help ? help() : undefined;
    return { title: usage, message: h, level: 'info' }
}

function getCommand({ content, mentions }: Message) {
    const bot = Bot.getUser()?.id;
    if (bot && mentions.users.has(bot)) {
        return content.replace(new RegExp(`<@!*${bot}>`), '').trim();
    } else if (content.startsWith(Config.prefix)) {
        return content.substring(Config.prefix.length, content.length);
    }

    return null;
}

export class UserError extends Error {
    readonly isUserError = true;
    constructor(message: string, public readonly isInput?: boolean) {
        super(message);
    }
}

async function callCommand(message: Message & { channel: TextChannel }, command: Command, args: string[]) {
    const { author, channel } = message;

    const parameters = command.parameters ?? {};

    try {
        const parsedArgs = Object.keys(parameters)
            .map((key, i) => {
                const param = parameters[key];
                const value = args[i];
                if (!value && !param.optional) throw new UserError(`Missing argument *${key}*`)
                return { key, value };
            })
            .reduce((o, { key, value }) => ({ ...o, [key]: value }), {});

        const feedback = await command.execute(parsedArgs, message);
        if (typeof feedback === 'string') Bot.sendMessage(channel, { level: 'success', title: feedback })
        else Bot.sendMessage(channel, { level: 'success', ...feedback })

    } catch (e) {
        if(!e.isInput || Config.sendInputErrors)  Bot.sendMessage(channel, { level: 'error', title: e.message, user: author });
        else {
            Bot.sendMessage(channel, { level: 'error', title: 'An error has occured', user: author });
            Bot.logError(e);
        }
    }
}

export function execute(message: Message & { channel: TextChannel }): boolean {
    const { channel, author } = message;

    const cmd = getCommand(message);

    if (cmd) {

        const [identifier, ...args] = cmd.split(' ').map(s => s.trim());
        const command = Commands[identifier];

        if (command) {
            Bot.log('debug', `**${author.tag}** executed command ${cmd}`)
            callCommand(message, command, args).catch(e => Bot.logError(e));
        }
        else Bot.sendMessage(channel, { level: 'error', title: 'Unknown command', user: author });

        return true;
    }

    return false;
}

const Commands: { [key: string]: Command } = {
    help: {
        parameters: {
            command: {
                description: 'The command you want help with',
                optional: true,
            }
        },
        execute: async ({ command }) => {
            if (!command) return {
                level: 'info',
                title: 'I can stop anytime I want',
                fields: {
                    'Info    :book:': '[More Information](https://github.com/PssbleTrngle/PicoloBot/blob/master/README.md)',
                    'Bot    :door:': `[Invite me to your own server](${await Bot.invite()})`,
                }
            };

            const c = Commands[command];
            if (!c) throw new UserError(`Unkown command '${command}'`);
            return helpMessage(c, command)
        }
    },
    commands: {
        help: () => 'List all commands',
        execute: () => ({
            title: 'Available commands',
            message: Object.keys(Commands).map(k => Config.prefix + k),
            level: 'info',
        }),
    },
    join: {
        help: () => 'Join a game',
        execute: async (_, { channel, author }) => {
            const game = await Game.findOrError(channel.id);
            
            await game.join(author);
            return {
                title: `${author.username} joined the game ${game.playerProgress()}`,
                user: author,
            }
        }
    },
    force: {
        help: () => 'Force a player to join a game',
        parameters: {
            user: {
                description: 'The User to force'
            }
        },
        execute: async ({ user }, { channel, author, guild }) => {
            if (guild?.ownerID !== author.id) throw new UserError('You do not have this permission')

            const game = await Game.findOrError(channel.id);

            const target = await Bot.parseUser(user);
            if (!target) throw new UserError(`*${user}* could not be found`)

            if (!game) throw new UserError('There is no game in this channel')
            await game.join(target);
            return {
                title: `${target.username} joined the game ${game.playerProgress()}`,
                user: target,
            }
        }
    },
    leave: {
        help: () => 'Leave a game',
        execute: async (_, { channel, author }) => {
            const game = await Game.findOrError(channel.id);

            await game.leave(author);
            return {
                title: `${author.username} left the game ${game.playerProgress()}`,
                user: author,
                level: 'warning'
            }
        }
    },
    create: {
        help: () => 'Create a game',
        execute: async (_, { channel, author }) => {
            await Game.attempCreate(channel, author)

            return {
                title: `${author.username} has created a game`,
                user: author,
            }
        }
    },
    start: {
        help: () => 'Start the game',
        execute: async (_, { channel, author }) => {
            const game = await Game.findOrError(channel.id);
            await game.start();

            return {
                title: `${author.username} started the game`,
                user: author,
            }
        }
    },
    stats: {
        parameters: {
            user: {
                description: 'The user you want information about',
                optional: true,
            }
        },
        help: () => 'Get statistics about a user',
        execute: async ({ user }, { author }) => {

            const u = user ? await Bot.parseUser(user) : author;
            if (!u) throw new UserError(`Unkown user *${user}*`)

            const stats = await Stats.findOrCreate(u.id);

            return {
                title: 'Statists',
                user: u,
                fields: {
                    'Games Played': `:game_die: ${stats.games}`,
                    'Shots taken': `:beer: ${stats.shots}`,
                },
            }
        }
    },
    skip: {
        help: () => 'Skips the current card',
        execute: async (_, { channel, author, guild }) => {
            if (guild?.ownerID !== author.id) throw new UserError('You do not have this permission')

            const game = await Game.findOrError(channel.id);
            await game.skipCard();

            return {
                title: 'You skipped the current card'
            }
        }
    }
}