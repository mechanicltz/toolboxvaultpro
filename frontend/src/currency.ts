/*
 * Central currency system.
 *
 * The app stores money as plain numbers; the user picks which currency to
 * DISPLAY them in (symbol + label only — no exchange-rate conversion). USD is
 * the default and is always pinned to the top of the picker. Every money
 * amount in the app should be rendered through `formatMoney()` so switching the
 * currency updates the whole app, reports included.
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Currency = {
  code: string;   // ISO 4217, e.g. "USD"
  name: string;   // Human name, e.g. "US Dollar"
  symbol: string; // Display symbol, e.g. "$"
  decimals?: number; // fraction digits (default 2; 0 for JPY-style)
};

// The 25 most common currencies (shown first in the picker, USD forced to top).
export const COMMON_CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "\u20AC" },
  { code: "GBP", name: "British Pound", symbol: "\u00A3" },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "JPY", name: "Japanese Yen", symbol: "\u00A5", decimals: 0 },
  { code: "CNY", name: "Chinese Yuan", symbol: "CN\u00A5" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF\u00A0" },
  { code: "INR", name: "Indian Rupee", symbol: "\u20B9" },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr\u00A0" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr\u00A0" },
  { code: "DKK", name: "Danish Krone", symbol: "kr\u00A0" },
  { code: "PLN", name: "Polish Z\u0142oty", symbol: "z\u0142\u00A0" },
  { code: "RUB", name: "Russian Ruble", symbol: "\u20BD" },
  { code: "TRY", name: "Turkish Lira", symbol: "\u20BA" },
  { code: "AED", name: "UAE Dirham", symbol: "AED\u00A0" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR\u00A0" },
  { code: "KRW", name: "South Korean Won", symbol: "\u20A9", decimals: 0 },
  { code: "PHP", name: "Philippine Peso", symbol: "\u20B1" },
];

// Full ISO 4217 long-tail (shown below the common list, alphabetical). Anything
// without a dedicated symbol falls back to its code.
export const OTHER_CURRENCIES: Currency[] = [
  { code: "AFN", name: "Afghan Afghani", symbol: "\u060B" },
  { code: "ALL", name: "Albanian Lek", symbol: "L\u00A0" },
  { code: "AMD", name: "Armenian Dram", symbol: "\u058F" },
  { code: "ANG", name: "Netherlands Antillean Guilder", symbol: "\u0192" },
  { code: "AOA", name: "Angolan Kwanza", symbol: "Kz\u00A0" },
  { code: "ARS", name: "Argentine Peso", symbol: "$" },
  { code: "AWG", name: "Aruban Florin", symbol: "\u0192" },
  { code: "AZN", name: "Azerbaijani Manat", symbol: "\u20BC" },
  { code: "BAM", name: "Bosnia-Herzegovina Mark", symbol: "KM\u00A0" },
  { code: "BBD", name: "Barbadian Dollar", symbol: "$" },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "\u09F3" },
  { code: "BGN", name: "Bulgarian Lev", symbol: "\u043B\u0432\u00A0" },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BD\u00A0", decimals: 3 },
  { code: "BIF", name: "Burundian Franc", symbol: "FBu\u00A0", decimals: 0 },
  { code: "BMD", name: "Bermudan Dollar", symbol: "$" },
  { code: "BND", name: "Brunei Dollar", symbol: "$" },
  { code: "BOB", name: "Bolivian Boliviano", symbol: "Bs\u00A0" },
  { code: "BSD", name: "Bahamian Dollar", symbol: "$" },
  { code: "BTN", name: "Bhutanese Ngultrum", symbol: "Nu\u00A0" },
  { code: "BWP", name: "Botswanan Pula", symbol: "P\u00A0" },
  { code: "BYN", name: "Belarusian Ruble", symbol: "Br\u00A0" },
  { code: "BZD", name: "Belize Dollar", symbol: "BZ$" },
  { code: "CDF", name: "Congolese Franc", symbol: "FC\u00A0" },
  { code: "CLP", name: "Chilean Peso", symbol: "$", decimals: 0 },
  { code: "COP", name: "Colombian Peso", symbol: "$" },
  { code: "CRC", name: "Costa Rican Col\u00F3n", symbol: "\u20A1" },
  { code: "CUP", name: "Cuban Peso", symbol: "$" },
  { code: "CVE", name: "Cape Verdean Escudo", symbol: "$" },
  { code: "CZK", name: "Czech Koruna", symbol: "K\u010D\u00A0" },
  { code: "DJF", name: "Djiboutian Franc", symbol: "Fdj\u00A0", decimals: 0 },
  { code: "DOP", name: "Dominican Peso", symbol: "RD$" },
  { code: "DZD", name: "Algerian Dinar", symbol: "DA\u00A0" },
  { code: "EGP", name: "Egyptian Pound", symbol: "E\u00A3" },
  { code: "ERN", name: "Eritrean Nakfa", symbol: "Nfk\u00A0" },
  { code: "ETB", name: "Ethiopian Birr", symbol: "Br\u00A0" },
  { code: "FJD", name: "Fijian Dollar", symbol: "$" },
  { code: "FKP", name: "Falkland Islands Pound", symbol: "\u00A3" },
  { code: "GEL", name: "Georgian Lari", symbol: "\u20BE" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "\u20B5" },
  { code: "GIP", name: "Gibraltar Pound", symbol: "\u00A3" },
  { code: "GMD", name: "Gambian Dalasi", symbol: "D\u00A0" },
  { code: "GNF", name: "Guinean Franc", symbol: "FG\u00A0", decimals: 0 },
  { code: "GTQ", name: "Guatemalan Quetzal", symbol: "Q\u00A0" },
  { code: "GYD", name: "Guyanaese Dollar", symbol: "$" },
  { code: "HNL", name: "Honduran Lempira", symbol: "L\u00A0" },
  { code: "HRK", name: "Croatian Kuna", symbol: "kn\u00A0" },
  { code: "HTG", name: "Haitian Gourde", symbol: "G\u00A0" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft\u00A0" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp\u00A0" },
  { code: "ILS", name: "Israeli New Shekel", symbol: "\u20AA" },
  { code: "IQD", name: "Iraqi Dinar", symbol: "\u062F.\u0639\u00A0", decimals: 0 },
  { code: "IRR", name: "Iranian Rial", symbol: "\uFDFC\u00A0" },
  { code: "ISK", name: "Icelandic Kr\u00F3na", symbol: "kr\u00A0", decimals: 0 },
  { code: "JMD", name: "Jamaican Dollar", symbol: "J$" },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JD\u00A0", decimals: 3 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh\u00A0" },
  { code: "KGS", name: "Kyrgystani Som", symbol: "\u0441\u043E\u043C\u00A0" },
  { code: "KHR", name: "Cambodian Riel", symbol: "\u17DB" },
  { code: "KMF", name: "Comorian Franc", symbol: "CF\u00A0", decimals: 0 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD\u00A0", decimals: 3 },
  { code: "KYD", name: "Cayman Islands Dollar", symbol: "$" },
  { code: "KZT", name: "Kazakhstani Tenge", symbol: "\u20B8" },
  { code: "LAK", name: "Laotian Kip", symbol: "\u20AD" },
  { code: "LBP", name: "Lebanese Pound", symbol: "L\u00A3" },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs\u00A0" },
  { code: "LRD", name: "Liberian Dollar", symbol: "$" },
  { code: "LSL", name: "Lesotho Loti", symbol: "L\u00A0" },
  { code: "LYD", name: "Libyan Dinar", symbol: "LD\u00A0", decimals: 3 },
  { code: "MAD", name: "Moroccan Dirham", symbol: "DH\u00A0" },
  { code: "MDL", name: "Moldovan Leu", symbol: "L\u00A0" },
  { code: "MGA", name: "Malagasy Ariary", symbol: "Ar\u00A0", decimals: 0 },
  { code: "MKD", name: "Macedonian Denar", symbol: "\u0434\u0435\u043D\u00A0" },
  { code: "MMK", name: "Myanmar Kyat", symbol: "K\u00A0" },
  { code: "MNT", name: "Mongolian Tugrik", symbol: "\u20AE" },
  { code: "MOP", name: "Macanese Pataca", symbol: "MOP$" },
  { code: "MUR", name: "Mauritian Rupee", symbol: "Rs\u00A0" },
  { code: "MVR", name: "Maldivian Rufiyaa", symbol: "Rf\u00A0" },
  { code: "MWK", name: "Malawian Kwacha", symbol: "MK\u00A0" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM\u00A0" },
  { code: "MZN", name: "Mozambican Metical", symbol: "MT\u00A0" },
  { code: "NAD", name: "Namibian Dollar", symbol: "$" },
  { code: "NGN", name: "Nigerian Naira", symbol: "\u20A6" },
  { code: "NIO", name: "Nicaraguan C\u00F3rdoba", symbol: "C$" },
  { code: "NPR", name: "Nepalese Rupee", symbol: "Rs\u00A0" },
  { code: "OMR", name: "Omani Rial", symbol: "OMR\u00A0", decimals: 3 },
  { code: "PAB", name: "Panamanian Balboa", symbol: "B/.\u00A0" },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/\u00A0" },
  { code: "PGK", name: "Papua New Guinean Kina", symbol: "K\u00A0" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "Rs\u00A0" },
  { code: "PYG", name: "Paraguayan Guarani", symbol: "\u20B2", decimals: 0 },
  { code: "QAR", name: "Qatari Rial", symbol: "QR\u00A0" },
  { code: "RON", name: "Romanian Leu", symbol: "lei\u00A0" },
  { code: "RSD", name: "Serbian Dinar", symbol: "\u0434\u0438\u043D\u00A0" },
  { code: "RWF", name: "Rwandan Franc", symbol: "FRw\u00A0", decimals: 0 },
  { code: "SBD", name: "Solomon Islands Dollar", symbol: "$" },
  { code: "SCR", name: "Seychellois Rupee", symbol: "Rs\u00A0" },
  { code: "SDG", name: "Sudanese Pound", symbol: "\u00A3" },
  { code: "SHP", name: "St. Helena Pound", symbol: "\u00A3" },
  { code: "SLL", name: "Sierra Leonean Leone", symbol: "Le\u00A0" },
  { code: "SOS", name: "Somali Shilling", symbol: "Sh\u00A0" },
  { code: "SRD", name: "Surinamese Dollar", symbol: "$" },
  { code: "SSP", name: "South Sudanese Pound", symbol: "\u00A3" },
  { code: "STN", name: "S\u00E3o Tom\u00E9 Dobra", symbol: "Db\u00A0" },
  { code: "SYP", name: "Syrian Pound", symbol: "L\u00A3" },
  { code: "SZL", name: "Swazi Lilangeni", symbol: "E\u00A0" },
  { code: "THB", name: "Thai Baht", symbol: "\u0E3F" },
  { code: "TJS", name: "Tajikistani Somoni", symbol: "SM\u00A0" },
  { code: "TMT", name: "Turkmenistani Manat", symbol: "m\u00A0" },
  { code: "TND", name: "Tunisian Dinar", symbol: "DT\u00A0", decimals: 3 },
  { code: "TOP", name: "Tongan Pa\u02BBanga", symbol: "T$" },
  { code: "TTD", name: "Trinidad & Tobago Dollar", symbol: "TT$" },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$" },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh\u00A0" },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "\u20B4" },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh\u00A0", decimals: 0 },
  { code: "UYU", name: "Uruguayan Peso", symbol: "$U" },
  { code: "UZS", name: "Uzbekistani Som", symbol: "\u0441\u045E\u043C\u00A0" },
  { code: "VES", name: "Venezuelan Bol\u00EDvar", symbol: "Bs\u00A0" },
  { code: "VND", name: "Vietnamese Dong", symbol: "\u20AB", decimals: 0 },
  { code: "VUV", name: "Vanuatu Vatu", symbol: "VT\u00A0", decimals: 0 },
  { code: "WST", name: "Samoan Tala", symbol: "WS$" },
  { code: "XAF", name: "Central African CFA Franc", symbol: "FCFA\u00A0", decimals: 0 },
  { code: "XCD", name: "East Caribbean Dollar", symbol: "$" },
  { code: "XOF", name: "West African CFA Franc", symbol: "CFA\u00A0", decimals: 0 },
  { code: "XPF", name: "CFP Franc", symbol: "\u20A3", decimals: 0 },
  { code: "YER", name: "Yemeni Rial", symbol: "YR\u00A0" },
  { code: "ZMW", name: "Zambian Kwacha", symbol: "ZK\u00A0" },
];

const BY_CODE: Record<string, Currency> = {};
[...COMMON_CURRENCIES, ...OTHER_CURRENCIES].forEach((c) => {
  BY_CODE[c.code] = c;
});

const USD = COMMON_CURRENCIES[0];
const STORAGE_KEY = "tbv_currency_code";

let current: Currency = USD;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getCurrency(): Currency {
  return current;
}

export function getCurrencySymbol(): string {
  return current.symbol;
}

export function currencyByCode(code?: string | null): Currency {
  if (!code) return USD;
  return BY_CODE[code.toUpperCase()] || USD;
}

/** Format a numeric amount as "<symbol><grouped amount>", e.g. "€1,234.56". */
export function formatMoney(
  amount: number | null | undefined,
  opts?: { decimals?: number; withCode?: boolean },
): string {
  const c = current;
  const n = typeof amount === "number" && isFinite(amount) ? amount : 0;
  const decimals = opts?.decimals ?? c.decimals ?? 2;
  const body = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = n < 0 ? "-" : "";
  const code = opts?.withCode ? `\u00A0${c.code}` : "";
  return `${sign}${c.symbol}${body}${code}`;
}

/** Persist + apply the chosen currency (per-account, via prefs-style key). */
export async function setCurrency(code: string): Promise<void> {
  current = currencyByCode(code);
  try {
    await AsyncStorage.setItem(await userKey(), current.code);
  } catch {
    /* best-effort */
  }
  emit();
}

// Namespace the stored code per logged-in account (matches prefs.ts behaviour).
const USER_CACHE_KEY = "tt.auth.user";
async function userKey(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(USER_CACHE_KEY);
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.id) return `${STORAGE_KEY}::${u.id}`;
    }
  } catch {
    /* fall through */
  }
  return `${STORAGE_KEY}::anon`;
}

/** Load the saved currency for the current account. Call on app start / login. */
export async function initCurrency(): Promise<void> {
  try {
    const code = await AsyncStorage.getItem(await userKey());
    current = currencyByCode(code);
  } catch {
    current = USD;
  }
  emit();
}

/** Reactive hook — re-renders on currency change. */
export function useCurrency(): Currency {
  const [c, setC] = useState<Currency>(current);
  useEffect(() => {
    const l = () => setC(current);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return c;
}
