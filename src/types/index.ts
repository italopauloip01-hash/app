export interface Helper {
    id?: string;
    name: string;
    phone?: string;
    active: boolean;
}

export interface Client {
    id?: string;
    name: string;
    phone: string;
    address: string;
    email?: string;
    createdAt: Date;
}

export interface ServiceItem {
    type: string; // Updated from union to string for custom template support
    description: string;
    quantity: number;
    price: number;
}

export interface HelperEntry {
    id?: string;
    helperId: string;
    date: Date;
    type: 'work' | 'payment';
    amount: number;
    description?: string;
}

export interface Service {
    id?: string;
    clientId: string;
    date: Date; // Date of service
    // ... rest of the interface ...
    nextServiceDate: Date; // Calculated (date + 6 months)
    type: string; // Updated from union to string (Primary type for backward compat)
    description: string; // Primary description (for backward compat)
    items?: ServiceItem[]; // New: multiple items
    photos: string[]; // Legacy/General
    photosBefore?: string[];
    photosAfter?: string[];
    price: number; // Total price
    status: 'Agendado' | 'Concluído' | 'Pendente';
    paymentStatus: 'Pago' | 'Pendente';
    paymentMethod?: 'Dinheiro' | 'Cartão' | 'Pix' | 'Transferência';
}

export interface CompanySettings {
    id?: string;
    name: string;
    phone: string;
    pixKey: string;
    address?: string;
    cnpj?: string;
    email?: string;
    ownerName?: string;
    autoBackupEnabled?: boolean;
    lastAutoBackupTime?: string;
    darkMode?: boolean;
    signature?: string;
}

export interface ServiceReminder {
    id: string; // Service ID
    clientId: string;
    clientName: string;
    dueDate: Date;
    daysRemaining: number;
}

export interface ServiceTemplate {
    id?: string;
    name: string;
    description: string;
    price: number;
}
export interface Estimate {
    id?: string;
    clientId?: string;
    clientName: string;
    clientPhone: string;
    clientAddress: string;
    date: Date;
    validityDays: number;
    items: ServiceItem[];
    total: number;
    status: 'Pendente' | 'Aprovado' | 'Recusado';
}
