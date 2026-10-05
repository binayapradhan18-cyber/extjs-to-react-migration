import { createTranslator } from '@migration/bridge';
import de from '@migration/bridge/locales/de.json';
import en from '@migration/bridge/locales/en.json';

const catalogs = { en, de };
const requested = new URLSearchParams(window.location.search).get('lang');

export const locale = requested && catalogs[requested] ? requested : 'en';
export const T = createTranslator(catalogs[locale], en);
