import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface DocumentPreviewProps {
    children: ReactNode;
    /** Largura real do documento (a imagem gerada usa 800px) */
    docWidth?: number;
}

/**
 * Mostra um documento (extrato, recibo) reduzido para caber na tela, exatamente como
 * vai sair na imagem. "Ampliar" mostra em tamanho real, com rolagem, para conferir os
 * detalhes. O documento continua no DOM normal, então a geração da imagem usa o mesmo
 * elemento que o usuário está vendo.
 */
export function DocumentPreview({ children, docWidth = 800 }: DocumentPreviewProps) {
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0.4);
    const [docHeight, setDocHeight] = useState(0);
    const [zoomed, setZoomed] = useState(false);

    useLayoutEffect(() => {
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner) return;
        const update = () => {
            setScale(Math.min(1, outer.clientWidth / docWidth));
            setDocHeight(inner.offsetHeight); // offsetHeight ignora o transform
        };
        update();
        // Recalcula ao girar a tela e quando imagens (QR Code, assinatura) terminam de carregar
        const observer = new ResizeObserver(update);
        observer.observe(outer);
        observer.observe(inner);
        return () => observer.disconnect();
    }, [docWidth]);

    const appliedScale = zoomed ? 1 : scale;

    return (
        <div>
            <div
                ref={outerRef}
                className={`rounded-xl border border-slate-200 bg-slate-100 shadow-inner ${zoomed ? 'overflow-auto max-h-[55vh]' : 'overflow-hidden'}`}
            >
                <div style={{ width: docWidth * appliedScale, height: docHeight * appliedScale }}>
                    <div
                        ref={innerRef}
                        style={{ width: docWidth, transform: `scale(${appliedScale})`, transformOrigin: 'top left' }}
                    >
                        {children}
                    </div>
                </div>
            </div>
            {/* Fora do documento, para não cobrir nenhuma parte dele */}
            <div className="flex items-center justify-between gap-2 mt-2">
                <p className="text-[11px] text-slate-400">
                    {zoomed ? 'Tamanho real: arraste para ver tudo.' : 'Assim vai ficar a imagem enviada.'}
                </p>
                <button
                    type="button"
                    onClick={() => setZoomed(z => !z)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-900 text-white text-xs font-bold shadow active:scale-95"
                >
                    {zoomed ? <><ZoomOut size={14} /> Ajustar</> : <><ZoomIn size={14} /> Ampliar</>}
                </button>
            </div>
        </div>
    );
}
