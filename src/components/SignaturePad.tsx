import { useEffect, useRef, useState } from 'react';
import { Eraser, Check, X } from 'lucide-react';
import { cropToDataUrl, findOpaqueBox } from '../utils/signature';

interface SignaturePadProps {
    onSave: (dataUrl: string) => void;
    onCancel: () => void;
}

const INK_COLOR = '#0f172a';

/** Área para assinar com o dedo/caneta. Gera PNG transparente recortado só no traço. */
export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const [hasInk, setHasInk] = useState(false);

    // Ajusta a resolução do canvas à tela (traço nítido em celulares)
    useEffect(() => {
        const canvas = canvasRef.current!;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext('2d')!;
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = INK_COLOR;
        ctx.lineWidth = 2.5;
    }, []);

    const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        last.current = point(e);
        // Um toque sem arrastar vira um ponto
        const ctx = e.currentTarget.getContext('2d')!;
        ctx.beginPath();
        ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = INK_COLOR;
        ctx.fill();
        setHasInk(true);
    };

    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current || !last.current) return;
        const p = point(e);
        const ctx = e.currentTarget.getContext('2d')!;
        // Curva suave passando pelo ponto médio (evita traço "quebrado")
        const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last.current = p;
    };

    const end = () => {
        drawing.current = false;
        last.current = null;
    };

    const clear = () => {
        const canvas = canvasRef.current!;
        canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
        setHasInk(false);
    };

    const save = () => {
        const canvas = canvasRef.current!;
        const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        const box = findOpaqueBox(image);
        if (!box) return;
        onSave(cropToDataUrl(canvas, box));
    };

    return (
        <div className="space-y-3 w-full max-w-md">
            <div className="relative bg-white rounded-xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden">
                <canvas
                    ref={canvasRef}
                    className="w-full h-44 block cursor-crosshair"
                    style={{ touchAction: 'none' }}
                    onPointerDown={start}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                    onPointerLeave={end}
                />
                {/* Linha de base, como num papel */}
                <div className="pointer-events-none absolute left-6 right-6 bottom-10 border-b border-dashed border-slate-300" />
                {!hasInk && (
                    <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                        Assine aqui com o dedo
                    </p>
                )}
            </div>
            <div className="flex gap-2">
                <button type="button" onClick={onCancel} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <X size={16} /> Cancelar
                </button>
                <button type="button" onClick={clear} disabled={!hasInk} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 disabled:opacity-40">
                    <Eraser size={16} /> Limpar
                </button>
                <button type="button" onClick={save} disabled={!hasInk} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 active:scale-95 transition-all">
                    <Check size={16} /> Usar esta assinatura
                </button>
            </div>
        </div>
    );
}
