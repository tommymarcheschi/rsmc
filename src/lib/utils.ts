
export function formatSats(sats: string | number) {
  return Number(sats || 0).toLocaleString()
}

export function isEmail(email: string): boolean{
  return email.length > 5 && email.includes('@')
}

export function formatDate(date: string) {
  return new Date(date).toLocaleString()
}