import { BaseEntity, Column, Entity } from "typeorm";
import Stats from "./Stats";

@Entity()
export default class Player extends BaseEntity {

    @Column({ type: 'text', primary: true })
    id!: string;

    @Column(() => Stats)
    total!: Stats;

    @Column(() => Stats)
    current!: Stats;

    async updateStats(): Promise<void> {
        Object.keys(this.current).map(k => k as keyof Stats).forEach(key => {
            this.total[key] += this.current[key]
            this.current[key] = 0;
        });
        await this.save();
    }

    static async findOrCreate(user: string): Promise<Player> {
        const existing = await Player.findOne(user);
        if (existing) return existing;
        return Player.create({ id: user }).save();
    }

}