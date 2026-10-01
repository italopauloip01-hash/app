import { describe, it, expect } from 'vitest';
import {
    estimateDuration, itemDuration, dayBlocks, findConflicts, suggestSlots, freeRanges,
    bookedMinutes, toMinutes, fromMinutes, formatDuration,
} from './schedule';

const svc = (id: string, startTime: string, items: { type: string; quantity?: number }[], extra = {}) => ({
    id, date: new Date(2026, 9, 5), startTime, items, status: 'Agendado', ...extra,
});

describe('duração estimada', () => {
    it('usa regra pelo tipo quando o serviço padrão não tem tempo', () => {
        expect(itemDuration({ type: 'Instalação Split 12000' })).toBe(180);
        expect(itemDuration({ type: 'Desinstalação' })).toBe(90); // não confunde com instalação
        expect(itemDuration({ type: 'Limpeza' })).toBe(60);
        expect(itemDuration({ type: 'Outro qualquer' })).toBe(60);
    });

    it('serviço padrão com tempo definido tem prioridade', () => {
        expect(itemDuration({ type: 'Instalação 9k' }, [{ name: 'instalação 9k', durationMinutes: 150 }])).toBe(150);
    });

    it('soma itens x quantidade', () => {
        expect(estimateDuration([{ type: 'Instalação', quantity: 2 }, { type: 'Limpeza', quantity: 1 }])).toBe(420);
    });
});

describe('agenda do dia', () => {
    // Duas instalações: 08:00-11:00 e 13:00-16:00
    const services = [
        svc('a', '08:00', [{ type: 'Instalação' }]),
        svc('b', '13:00', [{ type: 'Instalação' }]),
        svc('c', '10:00', [{ type: 'Limpeza' }], { status: 'Cancelado' }), // não ocupa
        svc('d', '09:00', [{ type: 'Limpeza' }], { date: new Date(2026, 9, 6) }), // outro dia
        { id: 'e', date: new Date(2026, 9, 5), items: [{ type: 'Limpeza' }], status: 'Agendado' }, // sem horário
    ];
    const blocks = dayBlocks(services, '2026-10-05');

    it('considera só os serviços com horário, do dia e não cancelados', () => {
        expect(blocks.map(b => b.service.id)).toEqual(['a', 'b']);
        expect(blocks.map(b => [fromMinutes(b.start), fromMinutes(b.end)])).toEqual([['08:00', '11:00'], ['13:00', '16:00']]);
    });

    it('detecta choque de horário, incluindo o deslocamento', () => {
        expect(findConflicts(blocks, toMinutes('10:00'), 60).map(b => b.service.id)).toEqual(['a']);
        // 11:00 encosta no fim da instalação: sem os 30 min de deslocamento, choca
        expect(findConflicts(blocks, toMinutes('11:00'), 60).map(b => b.service.id)).toEqual(['a']);
        expect(findConflicts(blocks, toMinutes('11:30'), 60)).toEqual([]);
        // limpeza de 1h às 12:00 termina 13:00: sem folga para chegar na instalação das 13:00
        expect(findConflicts(blocks, toMinutes('12:00'), 60).map(b => b.service.id)).toEqual(['b']);
    });

    it('sugere horários livres onde o serviço cabe', () => {
        expect(suggestSlots(blocks, 60)).toEqual(['11:30', '16:30', '17:00']);
        expect(suggestSlots(blocks, 180)).toEqual([]); // outra instalação não cabe mais
    });

    it('faixas livres e tempo ocupado', () => {
        expect(freeRanges(blocks).map(r => [fromMinutes(r.start), fromMinutes(r.end)])).toEqual([['11:30', '12:30'], ['16:30', '18:00']]);
        expect(bookedMinutes(blocks)).toBe(180 + 180 + 30);
    });

    it('ao editar, o próprio serviço não conta como choque', () => {
        const without = dayBlocks(services, '2026-10-05', [], 'a');
        expect(findConflicts(without, toMinutes('08:00'), 180)).toEqual([]);
    });
});

describe('formatação', () => {
    it('formata duração', () => {
        expect(formatDuration(45)).toBe('45 min');
        expect(formatDuration(180)).toBe('3h');
        expect(formatDuration(150)).toBe('2h30');
    });
});
