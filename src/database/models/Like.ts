import { BaseEntity, Entity, Column, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm"
import Card from "./Card";

@Entity()
export default class Like extends BaseEntity {

    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Card, c => c.likes)
    card!: Promise<Card>

    @Column({ type: 'text', unique: true })
    user!: string;

}