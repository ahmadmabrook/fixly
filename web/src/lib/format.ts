/**
 * Arabic-locale date/time formatting with WESTERN (Latin) numerals (§3/§16:
 * "Western 0–9 everywhere ... dates"). Plain `ar-JO` renders Arabic-Indic
 * digits (e.g. ٨‏/٦‏/٢٠٢٦) — the `-u-nu-latn` Unicode extension keeps Arabic
 * day/month names and punctuation while forcing 0-9.
 */
const AR_LATN_NUMERALS = 'ar-JO-u-nu-latn';

export function formatDateAr(iso: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString(AR_LATN_NUMERALS, options);
}

export function formatDateTimeAr(iso: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString(AR_LATN_NUMERALS, options);
}
