import { useEffect, useState } from "react"

type ThemeMode = "light" | "dark"

const getInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "light"
  const stored = localStorage.getItem("theme") as ThemeMode | null
  if (stored === "light" || stored === "dark") return stored
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  return prefersDark ? "dark" : "light"
}

export function Settings() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme())

  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    localStorage.setItem("theme", theme)
  }, [theme])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium text-foreground">设置</h1>

      <div className="border border-border/60 rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground text-sm">主题</p>
            <p className="text-xs text-muted-foreground mt-0.5">选择界面配色方案</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme("light")}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                theme === "light"
                  ? "bg-foreground text-background"
                  : "border border-border/60 hover:bg-muted/40"
              }`}
            >
              浅色
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                theme === "dark"
                  ? "bg-foreground text-background"
                  : "border border-border/60 hover:bg-muted/40"
              }`}
            >
              深色
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


