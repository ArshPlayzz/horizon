import * as React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CreateDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (newName: string) => void
  itemType: 'file' | 'folder'
  directoryPath: string
}

export function CreateDialog({ isOpen, onClose, onCreate, itemType, directoryPath }: CreateDialogProps) {
  const [newName, setNewName] = useState("")
  
  useEffect(() => {
    if (isOpen) {
      setNewName("")
      console.log(`CreateDialog opened with itemType: ${itemType} for path: ${directoryPath}`);
    }
  }, [isOpen, itemType, directoryPath])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newName) {
      console.log(`CreateDialog submitting with itemType: ${itemType} and name: ${newName}`);
      onCreate(newName)
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
            <DialogTitle>Create new {itemType}</DialogTitle>
            <DialogDescription>
              Enter a name for the new {itemType} in "{directoryPath.split('/').pop() || directoryPath}".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`Enter ${itemType} name`}
              className="w-full"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
