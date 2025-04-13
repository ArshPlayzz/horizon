import { createContext, useContext, useEffect } from "react"
import { useTheme } from "@/hooks/use-theme"

type ThemeProviderProps = {
  children: React.ReactNode
  forceDarkMode?: boolean
}

type ThemeProviderState = {
  theme: "light" | "dark"
  setTheme: (theme: "light" | "dark") => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({ 
  children,
  forceDarkMode = true
}: ThemeProviderProps) {
  const { theme, setTheme } = useTheme()
  
  useEffect(() => {
    if (forceDarkMode) {
      setTheme("dark")
    }
  }, [forceDarkMode, setTheme])
  
  return (
    <ThemeProviderContext.Provider
      value={{
        theme,
        setTheme,
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useThemeContext = () => {
  const context = useContext(ThemeProviderContext)
  
  if (context === undefined) {
    throw new Error("useThemeContext must be used within a ThemeProvider")
  }
  
  return context
} 