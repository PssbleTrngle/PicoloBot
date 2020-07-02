import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export default class Stats extends BaseEntity {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'text', unique: true })
    user!: string;

    @Column({ type: 'integer', unsigned: true, default: 0 })
    games!: number;

    @Column({ type: 'integer', unsigned: true, default: 0 })
    shots!: number;

    @Column({ type: 'integer', unsigned: true, default: 0 })
    sips!: number;

    static async findOrCreate(user: string): Promise<Stats> {
        const existing = await Stats.findOne({ user });
        if (existing) return existing;
        return Stats.create({ user }).save();
    }

}