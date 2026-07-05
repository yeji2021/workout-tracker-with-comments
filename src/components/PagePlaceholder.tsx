interface PagePlaceholderProps {
  title: string
  description: string
  hint?: string
}

/** Phase 0 뼈대용 임시 화면. 각 Phase에서 실제 내용으로 교체된다. */
export function PagePlaceholder({
  title,
  description,
  hint,
}: PagePlaceholderProps) {
  return (
    <div className="flex flex-col gap-3 px-5 py-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>
      <p className="text-sm text-[var(--color-text-dim)]">{description}</p>
      {hint && (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-center text-xs text-[var(--color-text-dim)]">
          {hint}
        </div>
      )}
    </div>
  )
}
