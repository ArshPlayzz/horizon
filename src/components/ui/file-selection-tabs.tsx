import { X, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFileContext } from "@/lib/file-context"
import { Tabs, TabsList, TabsTrigger } from "./tabs"
import { cva } from "class-variance-authority"

const fileSelectionTabsVariants = cva(
  "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const fileSelectionTabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow cursor-pointer",
  {
    variants: {
      variant: {
        default: "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export function FileSelectionTabs() {
  const { openFiles, activeFilePath, switchToFile, closeFile } = useFileContext();

  if (openFiles.length === 0) {
    return null;
  }

  return (
    <div className="flex h-10 items-center gap-1 px-2">
      <Tabs value={activeFilePath || undefined} className="w-full">
        <TabsList className="h-8 w-fit flex gap-1 bg-transparent p-0">
          {openFiles.map((file) => {
            const isActive = file.path === activeFilePath;
            return (
              <TabsTrigger
                key={file.path}
                value={file.path}
                className={cn(
                  "group relative flex h-8 items-center gap-1 rounded-md px-2 text-sm transition-colors",
                  "data-[state=active]:bg-muted data-[state=active]:text-foreground",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50"
                )}
                onClick={() => switchToFile(file.path)}
              >
                <div className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[150px]">{file.name}</span>
                </div>
                <button
                  className={cn(
                    "ml-1 rounded-sm p-1 transition-opacity",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    "hover:bg-muted/80"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(file.path);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
} 