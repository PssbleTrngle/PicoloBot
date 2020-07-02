import { TextChannel, User, Channel } from 'discord.js';
import { BaseEntity, Column, Entity, JoinTable, ManyToMany, DeepPartial, OneToMany, OneToOne, ObjectType } from 'typeorm';
import Bot from '../../bot';
import { UserError } from '../../commands';
import Config from '../../config';
import Card from './Card';
import Stats from './Stats';
import PlayedCard from './PlayedCard';
import { print } from '../../console';

@Entity()
export default class Game extends BaseEntity {

    @Column({ type: 'text', primary: true })
    channel!: string;

    @ManyToMany(() => Stats, { eager: true })
    players!: Stats[]

    @OneToOne(() => PlayedCard, c => c.game, { nullable: true, onDelete: 'CASCADE' })
    currentCard: Promise<PlayedCard | undefined> | PlayedCard | undefined;

    @Column({ type: 'integer', default: false })
    running!: boolean;

    @ManyToMany(() => Card)
    @JoinTable()
    recentCards!: Promise<Card[]> | Card[];

    playerProgress(): string {
        const c = this.players.length;
        const m = Config.minPlayers;
        return `[${c}/${m}]`;
    }

    async start(): Promise<void> {
        if (Config.minPlayers > this.players.length) throw new UserError(`Not enough players ${this.playerProgress()}`)

        await this.playNextCard();

        this.running = true;
        await this.save();
    }

    async join(user: User): Promise<void> {
        if (this.isPlaying(user))
            throw new UserError('You are already in this game');

        if (Config.playerRole) {
            Bot.forChannel(this.channel)?.addRole(user, Config.playerRole);
        }

        this.players.push(await Stats.findOrCreate(user.id));
        await this.save();
    }

    async leave(user: User): Promise<void> {
        if (!this.isPlaying(user))
            throw new UserError('You are not in this game');

        this.players = this.players.filter(p => p.id === user.id);
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
        const { playerRole } = Config;
        if (playerRole) this.players.forEach(p =>
            Bot.forChannel(this.channel)?.removeRole(p.id, playerRole)
        );

        await this.remove();
        return true;
    }

    static async attempCreate(channel: TextChannel, by?: User): Promise<Game> {
        if (await Game.findOne(channel.id)) throw new UserError('A game already exists in this channel')
        if (await Game.count() >= Config.maxGames) throw new UserError('Maximum games exceeded')

        const game = await Game.create({ channel: channel.id }).save()
        if (by) await game.join(by);
        return game;
    }

    static async findOrError(channel: string): Promise<Game> {
        return super.findOneOrFail<Game>(channel).catch(() => {
            throw new UserError('No game in the current channel')
        })
    }

    isPlaying(user: User | string): boolean {
        const id = typeof user === 'string' ? user : user.id;
        return !!this.players.find(p => p.id === id);
    }

    randomUsers(count: number): string[] {
        if (this.players.length < count) throw new UserError('Not enough players')
        return this.players
            .map(p => p.id)
            .sort(() => Math.random() - 0.5)
            .slice(0, count);
    }

    async playNextCard(): Promise<void> {

        print('debug', `Next card played in ${this.channel}`);

        const recent = await this.recentCards;
        const next = await this.nextCard(recent);
        const current = await this.currentCard;

        if (current?.check()) {
            await current.applyEffects();
        }

        await current?.remove();

        setTimeout(() => PlayedCard.play(next, this).save().then(async played => await Promise.all([

            Bot.sendMessage(this.channel, await played.format()),
            played.printInput(),

        ])).catch(e => Bot.logError(e)), Config.cardTimeout)
    }

    async nextCard(recent?: Card[]): Promise<Card> {

        const possiblities = await Card.createQueryBuilder()
            .where('requiredUsers <= :users', { users: this.players.length })
            .andWhere(() => 'id NOT IN (:...ids)', { ids: this.players.map(p => p.id) })
            .getMany();

        const played = recent ?? await this.recentCards;

        if (possiblities.length === 0) {
            if (played.length > 0) {
                this.recentCards = [];
                await this.save();
                return this.nextCard();
            } else {
                print('warning', `Could not find any card for a game of ${this.players.length} players, ${await Card.count()} cards available`)
                throw new UserError('Could not find any card for your game')
            }
        }

        return Card.findOneOrFail(possiblities.sort(() => Math.random() - 0.5)[0].id);
        //return Card.findOneOrFail(possiblities[0].id);
    }

    async skipCard(): Promise<void> {
        const current = await this.currentCard;
        if(!current) throw new UserError('There is no card to be skipped');
        await this.playNextCard();
    }

}