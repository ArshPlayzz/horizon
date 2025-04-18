import * as React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface RenameDialogProps {
  isOpen: boolean
  onClose: () => void
  onRename: (newName: string) => void
  itemName: string
  itemType: 'file' | 'folder'
}

export function RenameDialog({ isOpen, onClose, onRename, itemName, itemType }: RenameDialogProps) {
  const [newName, setNewName] = useState(itemName)
  
  // Reset the input when the dialog opens with a new item
  useEffect(() => {
    if (isOpen) {
      setNewName(itemName)
    }
  }, [isOpen, itemName])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newName && newName !== itemName) {
      onRename(newName)
    }
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename {itemType}</DialogTitle>
            <DialogDescription>
              Enter a new name for the {itemType} "{itemName}".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter new name"
              className="w-full"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
