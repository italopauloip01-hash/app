/**
 * Regra única do que o cliente deve: serviço não pago que já foi (ou está sendo) feito.
 * Agendado ainda não aconteceu e Cancelado não vai acontecer — nenhum dos dois é dívida.
 */
export function isOwed(service: { status?: string; paymentStatus?: string }): boolean {
    return service.paymentStatus !== 'Pago' && service.status !== 'Agendado' && service.status !== 'Cancelado';
}
