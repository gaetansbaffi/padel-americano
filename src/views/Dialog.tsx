// Boîte de dialogue intégrée à la page : remplace window.confirm/alert, qui
// sont bloqués dans certains environnements d'hébergement.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface DialogAction {
  label: string;
  value: string;
  variant?: 'primary' | 'danger' | 'default';
}

export interface DialogOptions {
  title: string;
  message?: string;
  actions: DialogAction[];
}

type Choose = (options: DialogOptions) => Promise<string | null>;

const DialogContext = createContext<Choose>(() => Promise.resolve(null));

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{ options: DialogOptions; resolve: (v: string | null) => void } | null>(null);
  const firstButton = useRef<HTMLButtonElement>(null);

  const choose = useCallback<Choose>(
    (options) => new Promise((resolve) => setRequest({ options, resolve })),
    [],
  );

  const close = (value: string | null) => {
    request?.resolve(value);
    setRequest(null);
  };

  useEffect(() => {
    if (!request) return;
    firstButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request]);

  return (
    <DialogContext.Provider value={choose}>
      {children}
      {request && (
        <div className="dialog-backdrop" onClick={() => close(null)}>
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="dialog-title">{request.options.title}</h2>
            {request.options.message && <p className="dialog-message">{request.options.message}</p>}
            <div className="dialog-actions">
              {request.options.actions.map((a, i) => (
                <button
                  key={a.value}
                  ref={i === 0 ? firstButton : undefined}
                  className={`btn ${a.variant === 'primary' ? 'btn-primary' : a.variant === 'danger' ? 'btn-danger-solid' : ''}`}
                  onClick={() => close(a.value)}
                >
                  {a.label}
                </button>
              ))}
              <button className="btn btn-ghost" onClick={() => close(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

/** Choix parmi plusieurs actions ; null si annulé. */
export function useDialog(): Choose {
  return useContext(DialogContext);
}

/** Confirmation simple : true si l'utilisateur valide. */
export function useConfirm() {
  const choose = useDialog();
  return useCallback(
    async (title: string, message: string, confirmLabel = 'Confirmer', danger = false) =>
      (await choose({
        title,
        message,
        actions: [{ label: confirmLabel, value: 'ok', variant: danger ? 'danger' : 'primary' }],
      })) === 'ok',
    [choose],
  );
}
