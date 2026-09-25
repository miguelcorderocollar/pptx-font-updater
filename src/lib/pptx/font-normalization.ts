const THEME_TOKEN = /^\+(?:mj|mn)-(?:lt|ea|cs)$/i

export function normalizeFontFamily(value: string): string {
  return value.trim().normalize("NFC").toLocaleLowerCase("en-US")
}

export function isThemeToken(value: string): boolean {
  return THEME_TOKEN.test(value.trim())
}

export function isValidReplacement(value: string): boolean {
  const trimmed = value.trim()
  return (
    trimmed.length > 0 &&
    Array.from(trimmed).every((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 0x1f && codePoint !== 0x7f
    })
  )
}
