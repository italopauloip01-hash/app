/**
 * Pix Utility for generating BRCode (EMV QRCPS) payloads
 * Standard defined by Banco Central do Brasil
 */

export function generatePixPayload(key: string, amount: number, merchantName: string, merchantCity: string = 'BRASILIA') {
    // Helper to format EMV tag (ID + Length + Value)
    const formatTag = (id: string, value: string) => {
        const len = value.length.toString().padStart(2, '0');
        return `${id}${len}${value}`;
    };

    // Sanitize Key: if it looks like a phone, ensure it has +55
    let sanitizedKey = key.trim();
    if (/^\d{10,11}$/.test(sanitizedKey.replace(/\D/g, ''))) {
        const digits = sanitizedKey.replace(/\D/g, '');
        sanitizedKey = `+55${digits}`;
    }

    // 00: Payload Format Indicator
    let payload = formatTag('00', '01');

    // 26: Merchant Account Information - Pix
    const gui = formatTag('00', 'br.gov.bcb.pix');
    const pixKey = formatTag('01', sanitizedKey);
    payload += formatTag('26', `${gui}${pixKey}`);

    // 52: Merchant Category Code
    payload += formatTag('52', '0000');

    // 53: Transaction Currency (986 = BRL)
    payload += formatTag('53', '986');

    // 54: Transaction Amount
    payload += formatTag('54', amount.toFixed(2));

    // 58: Country Code
    payload += formatTag('58', 'BR');

    // 59: Merchant Name
    // Remove special characters and non-alphanumeric (except space)
    const sanitizedName = merchantName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9 ]/gi, '')
        .toUpperCase();
    payload += formatTag('59', sanitizedName.substring(0, 25) || 'MERCHANT');

    // 60: Merchant City
    const sanitizedCity = merchantCity
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9 ]/gi, '')
        .toUpperCase();
    payload += formatTag('60', sanitizedCity.substring(0, 15) || 'BRASILIA');

    // 62: Additional Data Field Template
    payload += formatTag('62', formatTag('05', '***'));

    // 63: CRC16 Tag (ID + Length 04)
    payload += '6304';

    // Calculate CRC16 CCITT (XMODEM)
    const crc = calculateCRC16(payload);
    payload += crc.toUpperCase();

    return {
        copyAndPaste: payload,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`
    };
}

function calculateCRC16(str: string): string {
    let crc = 0xFFFF;
    const polynomial = 0x1021;

    for (let i = 0; i < str.length; i++) {
        crc ^= (str.charCodeAt(i) << 8);
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ polynomial) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }

    return crc.toString(16).padStart(4, '0').toUpperCase();
}
