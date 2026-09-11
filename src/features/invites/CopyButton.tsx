import { useState } from 'react'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-chip px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
    >
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}
