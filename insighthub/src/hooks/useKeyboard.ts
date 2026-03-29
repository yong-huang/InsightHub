import { useEffect } from 'react'
import { useSearchStore } from '@/stores/searchStore'

export function useKeyboard() {
  const openDialog = useSearchStore(s => s.openDialog)
  const closeDialog = useSearchStore(s => s.closeDialog)
  const showDialog = useSearchStore(s => s.showDialog)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K → open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (showDialog) {
          closeDialog()
        } else {
          openDialog()
        }
      }

      // Escape → close search dialog
      if (e.key === 'Escape' && showDialog) {
        closeDialog()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openDialog, closeDialog, showDialog])
}
