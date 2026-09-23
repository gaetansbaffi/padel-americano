import { useEffect, useState } from 'react';
import { copyText } from './device';
import { useDialog } from './Dialog';

/** Copie un texte prêt à coller dans WhatsApp ; affiche le texte si la copie échoue. */
export default function ShareButton({
  label,
  getText,
  className = 'btn btn-block',
}: {
  label: string;
  getText: () => string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const choose = useDialog();

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function share() {
    const text = getText();
    if (await copyText(text)) {
      setCopied(true);
    } else {
      await choose({
        title: 'Copie impossible',
        message: `Sélectionnez et copiez le texte ci-dessous :\n\n${text}`,
        actions: [],
      });
    }
  }

  return (
    <button className={`${className} ${copied ? 'btn-copied' : ''}`} onClick={share}>
      {copied ? 'Copié ✓ — collez-le dans WhatsApp' : label}
    </button>
  );
}
