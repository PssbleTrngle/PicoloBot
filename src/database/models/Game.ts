import { TextChannel, User } from 'discord.js';
import { BaseEntity, Column, Entity, JoinColumn, JoinTable, ManyToMany, OneToOne } from 'typeorm';
import Bot from '../../bot';
import { UserError } from '../../commands';
import Config from '../../config';
import { print } from '../../console';
import Card from './Card';
import PlayedCard from './PlayedCard';
import Player from './Player';

@Entity()
export default class Game extends BaseEntity {

    @Column({ type: 'text', primary: true })
    channel!: string;

    @ManyToMany(() => Player, { eager: true, cascade: true })
    @JoinTable()
    players?: Player[]

    @OneToOne(() => PlayedCard, c => c.game, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn()
    currentCard!: Promise<PlayedCard | undefined>;

    @Column({ type: 'integer', default: false })
    running!: boolean;

    @ManyToMany(() => Card)
    @JoinTable()
    recentCards!: Promise<Card[]> | Card[];


    getPlayers(): Player[] {
        return this.players ?? [];
    }

    playerProgress(): string {
        const c = this.getPlayers().length;
        const m = Config.minPlayers;
        return `[${c}/${m}]`;
    }

    async start(): Promise<void> {
        if (Config.minPlayers > this.getPlayers().length)
            throw new UserError(`Not enough players ${this.playerProgress()}`)

        this.running = true;
        await this.playNextCard();

        await this.save();
    }

    async join(user: User): Promise<void> {
        if (this.isPlaying(user))
            throw new UserError('You are already in this game');

        if (Config.playerRole) {
            Bot.forChannel(this.channel)?.addRole(user, Config.playerRole);
        }

        const player = await Player.findOrCreate(user.id);
        await player.updateStats();
        player.current.games = 1;
        this.getPlayers().push(player);
        await this.save();
    }

    async leave(user: User): Promise<void> {
        if (!this.isPlaying(user))
            throw new UserError('You are not in this game');

        this.players = this.getPlayers().filter(p => p.id === user.id);
        await this.save();

        const c = this.players.length;
        if (c <= 0 || (this.running && Config.minPlayers > c)) {

            Bot.sendMessage(this.channel, {
                title: 'The game has been disbanded because to many players have left',
                level: 'error',
            })
            await this.stop();

        } else if (Config.playerRole) {
            Bot.forChannel(this.channel)?.removeRole(user, Config.playerRole);
        }

    }

    async stop(): Promise<boolean> {
        print('debug', 'Game stopped')

        const { playerRole } = Config;
        if (playerRole) this.getPlayers().forEach(p =>
            Bot.forChannel(this.channel)?.removeRole(p.id, playerRole)
        );

        await Promise.all(this.getPlayers().map(p => p.updateStats()))

        await this.remove();
        return true;
    }

    static async attempCreate(channel: TextChannel, by?: User): Promise<Game> {
        if (await Game.findOne(channel.id)) throw new UserError('A game already exists in this channel')
        if (await Game.count() >= Config.maxGames) throw new UserError('Maximum games exceeded')

        const game = await Game.create({ channel: channel.id, players: by ? [by] : [] }).save()
        return game;
    }

    static async findOrError(channel: string): Promise<Game> {
        return super.findOneOrFail<Game>(channel).catch(() => {
            throw new UserError('No game in the current channel')
        })
    }

    isPlaying(user: User | string): boolean {
        const id = typeof user === 'string' ? user : user.id;
        return !!this.getPlayers().find(p => p.id === id);
    }

    randomUsers(count: number): string[] {
        if (this.getPlayers().length < count) throw new UserError('Not enough players')
        return this.getPlayers()
            .map(p => p.id)
            .sort(() => Math.random() - 0.5)
            .slice(0, count);
    }

    async playNextCard(): Promise<void> {
        if (!this.running) throw new UserError('Game has not started yet')

        const recent = await this.recentCards;
        const next = await this.nextCard(recent);
        const current = await this.currentCard;

        if (current?.check()) {
            await current.applyEffects();
        }

        await current?.remove();

        setTimeout(() => this.playCardNow(next).catch(e => Bot.logError(e)), Config.cardTimeout)
    }

    private async playCardNow(card: Card) {

        const next = await PlayedCard.play(card, this);

        await this.reload();
        await Promise.all([
            Bot.sendMessage(this.channel, await next.format()),
            next.printInput(),
        ]);

    }

    async nextCard(recent?: Card[]): Promise<Card> {

        const possiblities = await Card.createQueryBuilder()
            .where('requiredUsers <= :users', { users: this.getPlayers().length })
            .andWhere(() => 'id NOT IN (:...ids)', { ids: this.getPlayers().map(p => p.id) })
            .getMany();

        const played = recent ?? await this.recentCards;

        if (possiblities.length === 0) {
            if (played.length > 0) {
                this.recentCards = [];
                await this.save();
                return this.nextCard();
            } else {
                print('warning', `Could not find any card for a game of ${this.getPlayers().length} players, ${await Card.count()} cards available`)
                throw new UserError('Could not find any card for your game')
            }
        }

        return Card.findOneOrFail(possiblities.sort(() => Math.random() - 0.5)[0].id);
        //return Card.findOneOrFail(possiblities[0].id);
    }

    /**
     * @returns Wether a card existed or not
     */
    async skipCard(): Promise<boolean> {
        const current = await this.currentCard;
        await this.playNextCard();
        return !!current;
    }

}