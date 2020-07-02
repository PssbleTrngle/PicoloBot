import { Channel, TextChannel, User } from "discord.js";
import Config from "./config";
import Bot from "./bot";
import PlayedCard from "./database/models/PlayedCard";
import Card from "./database/models/Card";
import { UserError } from "./Commands";
import { print } from "./console";

export default class Game {

    private static MAP = new Map<string, Game>();
    private players = new Set<string>();
    private running = false;
    private played = new Set<number>();
    private currentTimeout?: NodeJS.Timeout

    public isRunning(): boolean {
        return this.running;
    }

    getChannel(): string {
        return this.channel;
    }

    private constructor(
        private channel: string,
    ) {
        Game.MAP.set(channel, this);
    }

    playerProgress(): string {
        const c = this.players.size;
        const m = Config.minPlayers;
        return `[${c}/${m}]`;
    }

    async start(): Promise<void> {
        if (Config.minPlayers > this.players.size) throw new UserError(`Not enough players ${this.playerProgress()}`)

        await this.playNextCard();

        this.running = true;
    }

    async join(user: User): Promise<void> {
        if (this.players.has(user.id)) throw new UserError('You are already in this game');
        this.players.add(user.id);

        if (Config.playerRole) {
            Bot.forChannel(this.channel)?.addRole(user, Config.playerRole);
        }
    }

    async leave(user: User): Promise<void> {
        if (!this.players.has(user.id)) throw new UserError('You are not in this game');
        this.players.delete(user.id);

        const c = this.players.size;
        if (c <= 0 || (this.running && Config.minPlayers > c)) {

            Bot.sendMessage(this.channel, {
                title: 'The game has been disbanded because to many players have left',
                level: 'error',
            })
            this.stop();

        } else if (Config.playerRole) {
            Bot.forChannel(this.channel)?.removeRole(user, Config.playerRole);
        }
    }

    static async create(channel: TextChannel, by?: User): Promise<Game> {
        if (Game.MAP.has(channel.id)) throw new UserError('A game already exists in this channel')
        if (Game.MAP.size >= Config.maxGames) throw new UserError('Maximum games exceeded')

        const game = new Game(channel.id);
        if (by) game.join(by);

        return game;
    }

    static find(channel: Channel | string): Game | undefined {
        const id = typeof channel === 'string' ? channel : channel.id;
        return Game.MAP.get(id);
    }

    static findOrError(channel: Channel | string): Game {
        const g = Game.find(channel);
        if (!g) throw new UserError('No game in the current channel');
        return g;
    }

    async stop(): Promise<boolean> {
        const { playerRole } = Config;
        if (playerRole) this.players.forEach(p =>
            Bot.forChannel(this.channel)?.removeRole(p, playerRole)
        );

        Game.MAP.delete(this.channel);
        await PlayedCard.delete({ channel: this.getChannel() })
        return true;
    }

    async transfer(to: TextChannel): Promise<void> {
        if (Game.MAP.has(to.id)) throw new UserError('There is already another game in this channel')
        Game.MAP.delete(this.channel);
        this.channel = to.id;
        Game.MAP.set(to.id, this);
    }

    isPlaying(user: User | string): boolean {
        const id = typeof user === 'string' ? user : user.id;
        return this.players.has(id);
    }

    getUsers(count: number): string[] {
        if (this.players.size < count) throw new UserError('Not enough players')
        return Array.from(this.players)
            .sort((a, b) => Math.random() - 0.5)
            .slice(0, count);
    }

    async currentCard(): Promise<PlayedCard | undefined> {
        return PlayedCard.findOne({ channel: this.getChannel() });
    }

    async playNextCard(): Promise<void> {
        if (this.currentTimeout !== undefined) return;

        print('debug', `Next card played in ${this.getChannel()}`);

        const next = await this.nextCard();
        const current = await this.currentCard()
    
        if(current?.check()) {
            await current.applyEffects();
        }

        await current?.remove();

        this.currentTimeout = setTimeout(() => (async () => {
            
            const played = await PlayedCard.play(next, this).save()
            await Bot.sendMessage(this.getChannel(), await played.format())
            await played.printInput();
            this.currentTimeout = undefined;

        })().catch(e => Bot.logError(e)), Config.cardTimeout)
    }

    async nextCard(): Promise<Card> {
        const possiblities = await Card.createQueryBuilder()
            .where('requiredUsers <= :users', { users: this.players.size })
            .andWhere(() => 'id NOT IN (:...ids)', { ids: Array.from(this.played) })
            .getMany();

        if (possiblities.length === 0) {
            if (this.played.size > 0) {
                this.played.clear();
                return this.nextCard();
            } else {
                print('warning', `Could not find any card for a game of ${this.players.size} players, ${await Card.count()} cards available`)
                throw new UserError('Could not find any card for your game')
            }
        }

        return Card.findOneOrFail(possiblities.sort(() => Math.random() - 0.5)[0].id);
        //return Card.findOneOrFail(possiblities[0].id);
    }

    async skipCard(): Promise<void> {
        const current = await this.currentCard();
        if(!current) throw new UserError('There is no card to be skipped');
        await this.playNextCard();
    }

}