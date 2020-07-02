import { BaseEntity, Column, Entity, ManyToOne, ManyToMany } from "typeorm";
import Game from "./Game";

@Entity()
export default class Stats extends BaseEntity {

    @Column({ type: 'text', primary: true })
    id!: string;

    @Column({ type: 'integer', unsigned: true, default: 0 })
    games!: number;

    @Column({ type: 'integer', unsigned: true, default: 0 })
    shots!: number;

    @Column({ type: 'integer', unsigned: true, default: 0 })
    sips!: number;

    static async findOrCreate(user: string): Promise<Stats> {
        const existing = await Stats.findOne(user);
        if (existing) return existing;
        return Stats.create({ id: user }).save();
    }

}