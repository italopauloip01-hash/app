/**
 * Sanitizes and formats a phone number for WhatsApp wa.me links.
 * Ensures the number has the 55 country code and no non-digit characters.
 */
export function formatWhatsAppNumber(phone: string): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // If it's already a full international number starting with 55
    if (cleaned.startsWith('55') && (cleaned.length === 12 || cleaned.length === 13)) {
        return cleaned;
    }

    // If it's a Brazilian number without the 55 prefix
    // Expected formats: 11988887777 (11 digits) or 1188887777 (10 digits)
    if (cleaned.length === 10 || cleaned.length === 11) {
        return `55${cleaned}`;
    }

    // Default fallback: just remove non-digits and hope for the best, 
    // but try to avoid adding 55 if it's already suspiciously long
    return cleaned.length > 11 ? cleaned : `55${cleaned}`;
}
