import { useEffect, useState } from "react"

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("dark")
  
  const setThemeMode = (mode: "light" | "dark") => {
    setTheme(mode)
    if (mode === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }
  
  useEffect(() => {
    setThemeMode("dark")
  }, [])
  
  return { theme, setTheme: setThemeMode }
} 