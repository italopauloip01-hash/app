/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#2563EB', // Blue-600 (Cor principal da referência)
                    hover: '#1D4ED8',
                    light: '#EFF6FF',   // Azul bem clarinho para fundos
                },
                secondary: {
                    DEFAULT: '#64748B', // Slate-500 (Icones/Texto secundário)
                    dark: '#0F172A',    // Slate-900 (Títulos)
                    light: '#F1F5F9',   // Slate-100 (Fundo Geral)
                },
                background: '#F8FAFC', // Slate-50 (Fundo bem claro)
                surface: '#FFFFFF',    // Branco puro para Cards/Sidebar
                text: {
                    primary: '#1E293B',   // Slate-800
                    secondary: '#64748B', // Slate-500
                    muted: '#94A3B8',     // Slate-400
                },
                success: '#10B981', // Verde
                warning: '#F59E0B', // Amarelo
                danger: '#EF4444',  // Vermelho

                // Cores específicas dos widgets
                widget: {
                    blue: '#EFF6FF',   // Fundo ícone clientes
                    blueText: '#3B82F6',
                    green: '#F0FDF4',  // Fundo ícone serviços
                    greenText: '#22C55E',
                    yellow: '#FEFCE8', // Fundo ícone lembretes
                    yellowText: '#EAB308',
                    purple: '#FAF5FF', // Fundo ícone faturamento
                    purpleText: '#A855F7',
                }
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
