import { createHmac } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TIME_STEP_SECONDS = 30;

/**
 * Code TOTP (RFC 6238, HMAC-SHA1, pas de 30 s), pour enrôler et connecter les comptes de test.
 * Les paramètres sont ceux de la politique OTP par défaut de Keycloak.
 */
export function totpCode(base32Secret: string, unixSeconds: number, digits = 6): string {
  const key = decodeBase32(base32Secret);
  const counter = Math.floor(unixSeconds / TIME_STEP_SECONDS);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(message).digest();

  // Troncature dynamique (RFC 4226, §5.3) : 4 octets lus à partir du décalage indiqué par le
  // dernier quartet, sans le bit de signe.
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  const code = binary % 10 ** digits;
  return String(code).padStart(digits, '0');
}

/** Keycloak affiche le secret en minuscules, par groupes de quatre séparés par des espaces. */
function decodeBase32(secret: string): Buffer {
  const normalized = secret.replaceAll(' ', '').toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const character of normalized) {
    const value = BASE32_ALPHABET.indexOf(character);
    if (value === -1) {
      throw new Error('Secret TOTP invalide : caractère hors base 32.');
    }
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let start = 0; start + 8 <= bits.length; start += 8) {
    bytes.push(Number.parseInt(bits.slice(start, start + 8), 2));
  }
  return Buffer.from(bytes);
}
