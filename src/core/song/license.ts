import { SERVABLE_LICENSE_STATUSES, type Song, type SongLicense } from './types';

/**
 * Controllo di licenza lato client.
 *
 * Il controllo che conta è quello in SQL (`public.is_song_servable`):
 * questo è la seconda barriera, per il catalogo demo incluso nel bundle
 * e per i contenuti già scaricati sul dispositivo. Le due
 * implementazioni applicano la stessa regola, di proposito.
 */
export function isLicenseServable(license: SongLicense, today: Date = new Date()): boolean {
  if (!SERVABLE_LICENSE_STATUSES.includes(license.status)) return false;
  const iso = toIsoDate(today);
  if (license.startDate && license.startDate > iso) return false;
  if (license.endDate && license.endDate < iso) return false;
  return true;
}

export function isSongServable(song: Song, today: Date = new Date()): boolean {
  return isLicenseServable(song.license, today);
}

/** Etichetta leggibile, mostrata nella scheda del brano. */
export function licenseLabelIt(license: SongLicense): string {
  switch (license.status) {
    case 'original': return 'Brano originale Maestro';
    case 'public_domain': return 'Pubblico dominio';
    case 'cleared': return `Su licenza di ${license.owner ?? 'avente diritto'}`;
    case 'pending': return 'In attesa di licenza';
    case 'expired': return 'Licenza scaduta';
    case 'blocked': return 'Non disponibile';
  }
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}
