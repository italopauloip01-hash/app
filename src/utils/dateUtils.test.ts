import { describe, it, expect } from 'vitest';
import { getYearMonth, getServicePrice, parseLocalDate, parseMonetaryValue } from './dateUtils';
import { normalizeRecord } from './normalize';

describe('somas por mês (fuso America/Sao_Paulo)', () => {
    const raw = [
        { id: 'a', date: '2026-10-01T03:00:00+00:00', price: '150.00', items: '[{"price":"100","quantity":"2"}]', status: 'Concluído' },
        { id: 'b', date: '2026-09-30T23:30:00.000Z', price: 80, status: 'Concluído' }, // 30/09 20:30 local
        { id: 'c', date: '2026-09-15', price: '1.250,50', status: 'Concluído' },
        { id: 'd', date: '2026-09-10 03:00:00+00', price: 300, items: [], status: 'Concluído' },
        { id: 'e', date: '2026-08-31T21:00:00', price: 50, status: 'Concluído' },
        { id: 'f', date: new Date(2026, 8, 1), price: 20, status: 'Concluído' }, // criado no aparelho
    ];
    const entries = [
        { id: 'h1', date: '2026-09-05T03:00:00+00:00', amount: '120', type: 'work' },
        { id: 'h2', date: '2026-10-01', amount: 90, type: 'work' },
    ];
    const services = raw.map(r => normalizeRecord(r as Record<string, unknown>));
    const helpers = entries.map(r => normalizeRecord(r as Record<string, unknown>));

    const revenue = (month: string) =>
        services.filter(s => getYearMonth(s.date) === month).reduce((a, s) => a + getServicePrice(s), 0);
    const cost = (month: string) =>
        helpers.filter(e => getYearMonth(e.date) === month).reduce((a, e) => a + parseMonetaryValue(e.amount), 0);

    it('cada serviço cai no mês certo, inclusive virada de mês', () => {
        expect(revenue('2026-08')).toBe(50);
        expect(revenue('2026-09')).toBe(80 + 1250.5 + 300 + 20);
        expect(revenue('2026-10')).toBe(200); // soma dos itens (100 x 2)
    });

    it('custo de ajudantes por mês', () => {
        expect(cost('2026-09')).toBe(120);
        expect(cost('2026-10')).toBe(90);
    });
});

describe('parseLocalDate', () => {
    it('"yyyy-MM-dd" é o dia local, não UTC (não volta para o dia anterior)', () => {
        const d = parseLocalDate('2026-10-01');
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 1]);
    });

    it('formato brasileiro dd/MM/yyyy', () => {
        const d = parseLocalDate('01/10/2026');
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 1]);
    });
});

describe('parseMonetaryValue', () => {
    it.each([
        ['R$ 1.250,50', 1250.5],
        ['150,00', 150],
        ['150.00', 150],
        [null, 0],
        ['abc', 0],
        [42, 42],
    ])('%s -> %s', (input, expected) => {
        expect(parseMonetaryValue(input)).toBe(expected);
    });
});
