import { Column } from "typeorm";

export default class Stats {

    @Column({ type: 'integer', unsigned: true, default: 0 })
    games!: number;

    @Column({ type: 'integer', unsigned: true, default: 0 })
    shots!: number;

    @Column({ type: 'integer', unsigned: true, default: 0 })
    ex!: number;

    @Column({ type: 'integer', unsigned: true, default: 0 })
    sips!: number;

}