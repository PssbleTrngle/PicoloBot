import { User } from "discord.js";
import { BaseEntity, Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import Bot, { IEmbed } from "../../bot";
import { UserError } from "../../commands";
import { print } from "../../console";
import Game from "../../game";
import Card, { Category } from "./Card";
import Input, { Types as InputTypes, TypeFunction } from "./Input";
import { IValue, ITarget } from "./Effect";
import { throws } from "assert";
import { config } from "dotenv/types";

const Colors = {
    [Category.GAME]: 0x099c18,
    [Category.NONE]: 0x6379cf,
    [Category.VIRUS]: 0xcfae2b,
}

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

    @ManyToOne(() => Card, { eager: true })
    card!: Card

    @Column({ type: 'text', unique: true })
    channel!: string

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

    static play(card: Card, game: Game): PlayedCard {
        const requiredUsers = count('$user', card.text)
        const users = game.getUsers(requiredUsers);
        const values = card.effects
            .filter(e => !!e.value)
            .map(e => e.value as IValue)
            .map(({ min, max }) => Math.floor(Math.random() * (max - min) + min))

        return PlayedCard.create({ card, channel: game.getChannel(), users, values });
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

    cardInputs(): Input[] {
        return this.card.inputs.filter(c => this.conditionMet(c.if))
    }

    /**
     * Checks if the card requires any more interaction or is done
     * @returns Wether the card is done
     */
    check(): boolean {
        print('debug', `Input [${this.inputs.length}/${this.cardInputs().length}]`);
        print('debug', JSON.stringify(this.inputs))
        return this.cardInputs().length <= this.inputs.length;
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

    currentInput(): Input {
        return this.cardInputs().sort((a, b) => a.index - b.index)[this.inputs?.length ?? 0];
    }

    async printInput(): Promise<void> {
        const nextInput = this.currentInput();

        if (nextInput) {
            const [by] = this.parseMention(nextInput.by) ?? [];

            if (this.parseSelection(nextInput.selection).length === 0) {
                Bot.log('warning', `Invalid card **${this.card.id}** has no possible selection at input ${this.inputs.length}`)
            }

            Bot.sendMessage(this.channel, {
                title: nextInput.question ?? 'Waiting for your descision',
                user: await Bot.parseUser(by),
                level: 'info',
            })
        }
    }

    async handleInput(given: string, by: User): Promise<void> {
        const nextInput = this.currentInput();
        if (nextInput) {

            print('debug', `Input ${this.inputs.length}: ${JSON.stringify(nextInput)}`)

            const { toString, parse } = InputTypes[nextInput.type] as TypeFunction<unknown>;

            if (!this.parseSelection(nextInput.by)(by))
                throw new UserError('You are not allowed to choose', true)

            const value = await parse(given, Game.findOrError(this.channel))
            print('debug', `Card parsed input '${given} -> '${value}' with type ${nextInput.type}`);

            if (value instanceof User) {
                if (!this.parseSelection(nextInput.selection)(value, by))
                    throw new UserError(`You cannot choose ${value.username}`)
            }

            this.inputs.push(toString(value));

            Bot.sendMessage(this.channel, {
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

        const transformers: ((s: string) => string)[] = [
            t => this.values.reduce((text, value, i) => text.replace(`$${this.card.effects[i].type}`, `${value}`), t),
            t => types.reduce((text, t) => text.split(`$${t}`).join(`${lastValues[t] ?? 42}`), t),
            t => this.users.reduce((text, user) => text.replace('$user', `<@${user}>`), t),
            t => new Array(count(mulReg, t)).fill(null).reduce((text: string) => {
                const [m, c, t] = text.match(mulReg) ?? [];
                return text.replace(m, `**${c}** ${t}${c === '1' ? '' : 's'}`);
            }, t)
        ]

        const text = transformers.reduce((text, t) => t(text), this.card.text);

        return {
            user: users.length === 1 ? users[0] : undefined,
            message: text,
            title: this.card.category?.toUpperCase(),
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

        const fields = this.card.effects
            .filter(e => this.conditionMet(e.if))
            .reduce((field, { target, type }, i) => {
                const value = this.values[i];

                const t = this.parseTarget(target);
                const key = `${value} ${type}${value === 1 ? '' : 's'}`

                return { ...field, [key]: t?.map(t => `<@${t}>`).join('\n') }
            }, {});

        Bot.sendMessage(this.channel, {
            title: 'Card effects',
            level: 'info',
            fields
        })
    }

}