import fs from 'fs';
import path from 'path';
import { BaseEntity, BeforeInsert, BeforeUpdate, Column, DeepPartial, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { print } from '../../console';
import Effect from './Effect';
import Input from './Input';
import Like from './Like';
import { count } from './PlayedCard';

export enum Category {
    GAME = 'game',
    VIRUS = 'virus',
    NONE = 'none'
}

@Entity()
export default class Card extends BaseEntity {

    @PrimaryGeneratedColumn()
    id!: number;

    @OneToMany(() => Like, v => v.card, { onDelete: 'CASCADE' })
    likes!: Promise<Like[]>

    @Column({ type: 'text' })
    text!: string;

    @Column({ readonly: true, type: 'integer', default: 0 })
    requiredUsers!: number;

    @BeforeUpdate()
    @BeforeInsert()
    updateRequiredPlayers(): void {
        this.requiredUsers = count('$user', this.text);
    }

    @BeforeInsert()
    sortInputs(): void {
        Input.calculatePriorities(this.inputs);
    }

    @Column({ type: 'text', enum: Category, default: Category.NONE })
    category!: Category;

    @Column({ type: 'integer', default: false })
    nsfw!: boolean;

    @OneToMany(() => Effect, e => e.card, { eager: true, cascade: true })
    effects!: Effect[];

    @OneToMany(() => Input, e => e.card, { eager: true, cascade: true })
    inputs!: Input[];

}

export async function importCards(): Promise<void> {

    if(await Card.count() > 0) return;

    const dir = path.resolve(__dirname, '..', 'cards');
    const files = fs.readdirSync(dir);
    await Promise.all(files.filter(f => f.endsWith('.json')).map(async f => {
        const id = Number.parseInt(f.substring(0, f.length - 5));
        const json = fs.readFileSync(path.resolve(dir, f));

        const values = {
            inputs: [],
            effects: [],
            ...JSON.parse(json.toString())
        } as DeepPartial<Card>

        await Card.create({ ...values, id }).save();

    }).map((p, i) => p.catch(e => print('warning', `Card ${i} encountered error '${e.message}'`))))

    print('debug', 'Created Cards')

}