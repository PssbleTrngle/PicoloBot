import { ChannelResolvable, Client, DMChannel, Guild, GuildResolvable, Message, TextChannel, User, UserResolvable } from 'discord.js';
import { execute, UserError } from './Commands';
import Config, { Level, Levels, shouldLog } from './config';
import { print } from './console';
import Game from './game';
import PlayedCard from './database/models/PlayedCard';

export type IEmbed = {
    message?: string | string[],
    title?: string,
    user?: User,
    level?: Level,
    color?: number;
    fields?: {
        [key: string]: string
    }
}

function isDM(msg: Message): msg is Message & { channel: DMChannel } {
    return msg.channel.type === 'dm';
}

function isText(msg: Message): msg is Message & { channel: TextChannel } {
    return msg.channel.type === 'text';
}

class DiscordBot {

    private client = new Client();

    async isOnServer(id: string) {
        return this.client.guilds.cache.has(id) || !!this.client.guilds.resolve(id);
    }

    async run() {
        await this.client.login(this.token)
        this.updateActivity();
        this.log('success', 'Bot running!')
        this.log('debug', await this.invite())
    }

    async log(level: Level, title?: string, message?: string, consoleMessage?: string) {

        if (Config.logChannel && shouldLog('channel', level)) {
            const channel = this.client.channels.resolve(Config.logChannel);
            if (channel instanceof TextChannel) this.sendMessage(channel, { level, title, message });
        }

        const c = consoleMessage ?? message;
        if (title) print(level, title)
        if (c) print(level, c)
    }

    async logError(error: Error) {
        this.log('error', error.message, '```typescript\n' + error.stack + '\n```', error.stack);
    }

    async sendMessage(channel: ChannelResolvable, { message, title, user, level, fields, ...m }: IEmbed) {
        const color = m.color ?? Levels[level ?? 'success'][0];
        const description = Array.isArray(message) ? message.join('\n') : message;
        const author = user && { icon_url: user.avatarURL(), name: user.username };

        const c = this.client.channels.resolve(channel);

        if (c instanceof TextChannel || c instanceof DMChannel) c.send({
            embed: {
                title, description, color, author,
                fields: fields && Object.keys(fields).map(name => ({ name, inline: true, value: fields[name] }))
            }
        })
    }

    invite() {
        return this.client.generateInvite(8);
    }

    async updateActivity() {
        await this.client.user?.setActivity(`with alocohol. ${Config.prefix}help`);
    }

    getUser() {
        return this.client.user;
    }

    constructor(private token: string) {

        this.client.on('message', msg => {
            if (msg.author.bot) return;

            if (isDM(msg)) this.onDM(msg);
            else if (isText(msg)) this.onChannelMessage(msg);
        })

        const events = ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'uncaughtException'];
        events.forEach(e => process.on(e, () => {
            print('info', 'Going dark');
            this.client.user?.setActivity('')
            this.client.user?.setStatus('invisible')
        }));

    }

    async onChannelMessage(msg: Message & { channel: TextChannel }) {
        if (!msg.guild) throw new Error('Message without server information');
        if (!execute(msg)) {

            const game = Game.find(msg.channel);
            if (game) {
                const playedCard = await game.currentCard();

                if (playedCard) try {

                    await playedCard.handleInput(msg.content.trim(), msg.author)
                    if (playedCard.check()) {
                        await game.playNextCard();
                    }

                } catch (e) {
                    if (e instanceof UserError) {
                        if(!e.isInput || Config.sendInputErrors) this.sendMessage(msg.channel, { level: 'error', title: e.message,  user: msg.author})
                    } else {
                        this.logError(e);
                        this.sendMessage(msg.channel, { level: 'error', title: 'An error occured', })
                    }
                }
            }

        }
    }

    hasRole(guild: Guild, user: User, role: string) {
        return guild?.roles.resolve(role)?.members.has(user.id)
    }

    // eslint-disable-next-line
    async onDM(msg: Message & { channel: DMChannel }) { }

    async forGuild(guild: GuildResolvable) {
        const g = this.client.guilds.resolve(guild);
        if (g) return new GuildSpecific(this, g);
    }

    forChannel(channel: ChannelResolvable) {
        const c = this.client.channels.resolve(channel) as TextChannel;
        if (c) return new GuildSpecific(this, c.guild);
    }

    async parseUser(text?: string) {
        if(!text) return undefined;
        const id = text.match(/<@!*(.+)>/);
        if (id) return this.client.users.fetch(id[1]) ?? undefined;
        return this.client.users.resolve(text) ?? undefined;
    }

}

class GuildSpecific {
    constructor(private bot: DiscordBot, private guild: Guild) { }

    addRole(user: UserResolvable, role: string) {
        this.guild.members.resolve(user)?.roles.add(role);
    }

    removeRole(user: UserResolvable, role: string) {
        this.guild.members.resolve(user)?.roles.remove(role);
    }

}

const Bot = new DiscordBot(Config.token);
export default Bot;