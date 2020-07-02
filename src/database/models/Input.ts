import { User } from "discord.js";
import { BaseEntity, Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import Bot from "../../bot";
import { UserError } from "../../commands";
import Card from "./Card";
import Game from "./Game";

const YES = ['positive', 'positiv', 'true', 'yes', 'yup', 'jap', 'ja']
const NO = ['negativ', 'negative', 'false', 'no', 'nope', 'nah']

export type TypeFunction<R> = {
    parse(s: string, g: Game): R | Promise<R>,
    toString(r: R): string,
}

export const Types = {
    boolean: {
        parse: (s: string) => {
            if (YES.includes(s.toLowerCase())) return true;
            if (NO.includes(s.toLowerCase())) return false;
            throw new UserError(`${s} is not a valid answer`, true)
        },
        toString: (b: boolean) => `${b}`,
    } as TypeFunction<boolean>,
    user: {
        async parse(s: string, g: Game): Promise<User> {
            const u = await Bot.parseUser(s);
            if (!u) throw new UserError(`Invalid user ${s}`);
            if (!g.isPlaying(u)) throw new UserError(`${u.username} is not playing`, true)
            return u;
        },
        toString: (u: User) => u.id,
    } as TypeFunction<User>,
}

export type Type = keyof typeof Types;


@Entity({ orderBy: { 'index': 'ASC' } })
export default class Input extends BaseEntity {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'text', enum: Object.keys(Types) })
    type!: Type;

    @Column({ type: 'text', nullable: true })
    by?: string;

    @Column({ type: 'text', nullable: true })
    question?: string;

    @Column({ type: 'text', nullable: true })
    if?: string;

    @Column({ type: 'integer', unsigned: true })
    index!: number;

    @Column({
        type: 'text', nullable: true, transformer: {
            to: s => JSON.stringify(s),
            from: s => JSON.parse(s),
        }
    })
    selection?: string | string[];

    @ManyToOne(() => Card, c => c.inputs)
    card!: boolean;

    static calculatePriorities(inputs: Input[]): void {
        inputs.forEach((input, i) => input.index = i);
    }

}