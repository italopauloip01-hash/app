import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/** Converte o valor de um catch (Error, string ou objeto de plugin do Capacitor) em Error. */
export function toError(caught: unknown): Error {
    if (caught instanceof Error) return caught
    if (typeof caught === 'string') return new Error(caught)
    const message = (caught as { message?: unknown } | null)?.message
    return new Error(typeof message === 'string' ? message : String(caught))
}
