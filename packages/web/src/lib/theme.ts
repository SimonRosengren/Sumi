const KEY = "sumi.theme";

/** Mirrors the inline script in index.html, which applies the theme before first paint. */
export function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function setDark(dark: boolean): void {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(KEY, dark ? "dark" : "light");
}
