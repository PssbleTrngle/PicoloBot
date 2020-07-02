import { BaseEntity, Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import Card from "./Card";
import Stats from "./Stats";

export const Types = {
    sip: {
        value: true,
        stat: (s: Stats) => s.sips,
    },
    ex: {
        value: false,
    },
    shot: {
        value: true,
        stat: (s: Stats) => s.shots,
    },
}

export type Type = keyof typeof Types;

export type IValue = {
    min: number,
    max: number,
}

export interface ICondition {
    condition: string;
    true: string | string[];
    false: string | string[];
}

export type ITarget = string | ICondition | (string | ICondition)[];

@Entity()
export default class Effect extends BaseEntity {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'text', enum: Object.keys(Types) })
    type!: Type;

    @Column({ type: 'text', nullable: true })
    if?: string;

    @Column({
        type: 'text', nullable: true, transformer: {
            from: v => v ? JSON.parse(v) : v,
            to: v => {
                if (typeof v === 'number') return JSON.stringify({ min: v, max: v })
                if (typeof v === 'string') return JSON.stringify({ min: v.split('-')[0], max: v.split('-')[1] })
                if(typeof v === 'object') return JSON.stringify(v)
                return undefined;
            }
        }
    })
    value?: IValue;

    @Column({
        type: 'text', transformer: {
            to: s => JSON.stringify(s),
            from: s => JSON.parse(s),
        }
    })
    target?: ITarget;

    @ManyToOne(() => Card, c => c.effects)
    card!: boolean;

}