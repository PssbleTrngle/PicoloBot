import { User } from "discord.js";
import { BaseEntity, Column, Entity, ManyToOne, OneToOne, PrimaryGeneratedColumn, JoinColumn } from "typeorm";
import Bot, { IEmbed } from "../../bot";
import { UserError } from "../../commands";
import { print } from "../../console";
import Card, { Category } from "./Card";
import { ITarget, IValue, Types as EffectTypes } from "./Effect";
import Game from "./Game";
import Input, { TypeFunction, Types as InputTypes } from "./Input";
import Player from "./Player";

function fromArray(s?: any): string {
    if (!s) return '';
    if (Array.isArray(s)) return s.join('|')
    return s.toString();
}

function toArray(s?: any): string[] {
    if (!s) return [];
    if (Array.isArray(s)) return s;
    if (typeof s === 'string') return s.split('|').filter(s => s.length > 0)
    return [];
}

const arrayTransformer = {
    to: fromArray,
    from: toArray,
}

export function count(search: string | RegExp, text: string): number {
    const r = typeof search === 'string' ? new RegExp(search.replace('$', '\\$'), 'g') : search;
    return (text.match(r) ?? []).length;
}

@Entity()
export default class PlayedCard extends BaseEntity {

    @PrimaryGeneratedColumn()
    id!: number;

    @OneToOne(() => Game, g => g.currentCard, { eager: true, onDelete: 'CASCADE' })
    game!: Game;

    @ManyToOne(() => Card, { eager: true })
    card!: Card

    @Column({ type: 'text', transformer: arrayTransformer })
    users!: string[]

    @Column({ type: 'text', transformer: arrayTransformer })
    inputs!: string[]

    @Column({
        type: 'text', transformer: {
            from: v => toArray(v).map(s => Number.parseInt(s)),
            to: fromArray
        }
    })
    values!: number[]

    static async play(card: Card, game: Game): Promise<PlayedCard> {

        const requiredUsers = count('$user', card.text)
        const users = game.randomUsers(requiredUsers);

        const values = card.effects
            .filter(e => !!e.value)
            .map(e => e.value as IValue)
            .map(({ min, max }) => Math.floor(Math.random() * (max - min) + min))

        return PlayedCard.create({ card, game, users, values }).save();
    }

    conditionMet(condition?: string): boolean {
        if (!condition) return true;
        const match = condition.match(/\$input(?:\[(\d+)\])?/) ?? [];
        if (match) {
            const i = Number.parseInt(match[1] ?? '');
            const index = isNaN(i) ? 0 : i;
            return (this.inputs ?? [])[index] === 'true';
        }
        return false;
    }

    async cardInputs(): Promise<Input[]> {
        // Required because typeorm does not load the `PlayedCard` eager relations here :/
        if (!this.card) await this.reload();
        return this.card.inputs.filter(c => this.conditionMet(c.if))
    }

    /**
     * Checks if the card requires any more interaction or is done
     * @returns Wether the card is done
     */
    async check(): Promise<boolean> {
        const i = await this.cardInputs();
        print('debug', `Input [${this.inputs.length}/${i.length}]`);
        print('debug', JSON.stringify(this.inputs))
        return i.length <= this.inputs.length;
    }

    parseMention(mention?: string): string[] | null {
        const match = mention?.trim()?.match(/^\$([a-z]+)(?:\[([0-9]+)\])?$/i);
        print('debug', mention ?? '')

        if (match) {
            const id = match[1];
            const index = Number.parseInt(match[2])

            print('debug', `${id}[${index}]`)

            const us = (() => {
                switch (id) {
                    case 'user': return this.users;
                    case 'input': return this.inputs;
                    default: return [];
                }
            })();

            print('debug', `Found ${JSON.stringify(us)}`)

            if (isNaN(index)) return us;
            return [us[index]];

        } else return null;
    }

    parseSelection(selection?: string | string[]): (selected: User, by?: User) => boolean {
        const selections = Array.isArray(selection) ? selection : [selection];
        return selections.map(s => s?.trim() ?? 'other').map(s => (u: User, by?: User) => {
            switch (s) {
                case 'other': return u.id !== by?.id
                case 'self': return u.id === by?.id
                case 'all': return true
                default: {
                    const match = this.parseMention(s);
                    return (match ?? []).includes(u.id);
                }
            }
        }).reduce((a, b) => (u: User, by?: User) => a(u, by) || b(u, by), () => false);
    }

    async currentInput(): Promise<Input> {
        const i = await this.cardInputs();
        return i.sort((a, b) => a.index - b.index)[this.inputs?.length ?? 0];
    }

    async printInput(): Promise<void> {
        const nextInput = await this.currentInput();

        if (nextInput) {
            const [by] = this.parseMention(nextInput.by) ?? [];

            if (this.parseSelection(nextInput.selection).length === 0) {
                Bot.log('warning', `Invalid card **${this.card.id}** has no possible selection at input ${this.inputs.length}`)
            }

            Bot.sendMessage(this.game.channel, {
                title: nextInput.question ?? 'Waiting for your descision',
                user: await Bot.parseUser(by),
                level: 'info',
            })
        }
    }

    async handleInput(given: string, by: User): Promise<void> {

        await this.reload();
        const nextInput = await this.currentInput();

        if (nextInput) {

            print('debug', `Input ${this.inputs.length}: ${JSON.stringify(nextInput)}`)

            const { toString, parse } = InputTypes[nextInput.type] as TypeFunction<unknown>;

            if (!this.parseSelection(nextInput.by)(by))
                throw new UserError('You are not allowed to choose', true)

            const value = await parse(given, await Game.findOrError(this.game.channel))
            print('debug', `Card parsed input '${given} -> '${value}' with type ${nextInput.type}`);

            if (value instanceof User) {
                if (!this.parseSelection(nextInput.selection)(value, by))
                    throw new UserError(`You cannot choose ${value.username}`)
            }

            this.inputs.push(toString(value));

            Bot.sendMessage(this.game.channel, {
                title: value instanceof User ? `${value.username} has been chosen` : `You chose *${given}*`,
                user: by,
            })

            await this.printInput();
            await this.save();
        }
    }

    async format(): Promise<IEmbed> {

        const users = await Promise.all(this.users.map(u => Bot.parseUser(u)));
        if (users.includes(undefined)) throw new UserError('A required users has left the game')

        const types = this.card.effects.map(e => e.type)
            .filter((v, i, a) => a.indexOf(v) === i);

        const lastValues = types.reduce((o, t) => ({
            ...o,
            [t]: this.values[this.card.effects.reverse().findIndex(e => e.type === t)]
        }), {} as { [key: string]: number | undefined })

        const mulReg = /(\d+) ([a-z]+)s\*/i;

        /*
            Various text transformations, applied in order of the array
                1. Replace all values in the order given by the effects
                2. Replace any value text by the last value of the wanted type
                3. Replace all users by the mention of the choosen user
                4. Replace all plural mentions ('sips*') having a number in front with the correct singular/plural 
        */
        const transformers: ((s: string) => string)[] = [
            t => this.values.reduce((text, value, i) => text.replace(`$${this.card.effects[i].type}`, `${value}`), t),
            t => types.reduce((text: string, t) => text.split(`$${t}`).join(`${lastValues[t] ?? 42}`), t),
            t => this.users.reduce((text, user) => text.replace('$user', `<@${user}>`), t),
            t => new Array(count(mulReg, t)).fill(null).reduce((text: string) => {
                const [m, c, t] = text.match(mulReg) ?? [];
                return text.replace(m, `**${c}** ${t}${c === '1' ? '' : 's'}`);
            }, t)
        ]

        const text = transformers.reduce((text, t) => t(text), this.card.text);

        const Colors = {
            [Category.GAME]: 0x099c18,
            [Category.NONE]: 0x6379cf,
            [Category.VIRUS]: 0xcfae2b,
        }

        return {
            user: users.length === 1 ? users[0] : undefined,
            message: text,
            title: this.card.category === Category.NONE ? undefined : this.card.category.toUpperCase(),
            color: Colors[this.card.category],
        }
    }

    parseTarget(target?: ITarget): string[] {
        if (!target) return [];
        const targets = Array.isArray(target) ? target : [target];

        return targets.map(t => {
            if (typeof t === 'string') return this.parseMention(t) ?? [];
            else {
                return this.conditionMet(t.condition)
                    ? this.parseTarget(t.true)
                    : this.parseTarget(t.false)
            }
        }).reduce((a, b) => [...a, ...b], []);
    }

    async applyEffects(): Promise<void> {

        // Required because typeorm does not load the `PlayedCard` eager relations here :/
        if (!this.card.effects) await this.reload()

        const fields = await Promise.all(
            this.card.effects
                .filter(e => this.conditionMet(e.if))
                .map(async ({ target, type }, i) => {
                    const value = this.values[i];

                    const t = this.parseTarget(target);
                    const key = `${value} ${type}${value === 1 ? '' : 's'}`

                    await Promise.all(t.map(async id => {
                        const player = await Player.findOrCreate(id);
                        const s = EffectTypes[type].stat;
                        if (s) {
                            player.current[s]++;
                            await player.save();
                        }
                    }))

                    return { key, value: t?.map(t => `<@${t}>`).join('\n') }
                })
        );

        Bot.sendMessage(this.game.channel, {
            title: 'Card effects',
            level: 'info',
            fields
        })
    }

}