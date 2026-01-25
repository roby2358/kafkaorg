// Base62 ID generator (a-z A-Z 0-9)

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Generate a random base62 string of specified length
 * @param length Length of the string (default: 20)
 * @returns Random base62 string
 */
export function generateBase62Id(length: number = 20): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * BASE62_CHARS.length);
    result += BASE62_CHARS[randomIndex];
  }
  return result;
}
