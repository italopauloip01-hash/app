import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in application:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mb-4 border border-red-500/30">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Ops! Ocorreu um erro temporário</h2>
          <p className="text-sm text-slate-400 max-w-md mb-6">
            O aplicativo encontrou um dado inesperado, mas seus dados continuam salvos com segurança.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.href = "/"}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 font-bold rounded-xl text-sm transition-all"
            >
              Voltar ao Início
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 font-bold rounded-xl text-sm border border-slate-700 transition-all"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
