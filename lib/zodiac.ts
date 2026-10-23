const MAX_DAYS_BY_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const ZODIAC_BOUNDARIES: ReadonlyArray<{
  month: number;
  day: number;
  sign: string;
}> = [
  { month: 1, day: 20, sign: "Aquarius" },
  { month: 2, day: 19, sign: "Pisces" },
  { month: 3, day: 21, sign: "Aries" },
  { month: 4, day: 20, sign: "Taurus" },
  { month: 5, day: 21, sign: "Gemini" },
  { month: 6, day: 21, sign: "Cancer" },
  { month: 7, day: 23, sign: "Leo" },
  { month: 8, day: 23, sign: "Virgo" },
  { month: 9, day: 23, sign: "Libra" },
  { month: 10, day: 23, sign: "Scorpio" },
  { month: 11, day: 22, sign: "Sagittarius" },
  { month: 12, day: 22, sign: "Capricorn" },
];

/** Get the zodiac sign for a month/day pair using the established transition dates. */
export function getZodiacSign(month: number, day: number): string | null {
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > MAX_DAYS_BY_MONTH[month - 1]
  ) {
    return null;
  }

  for (let index = ZODIAC_BOUNDARIES.length - 1; index >= 0; index--) {
    const boundary = ZODIAC_BOUNDARIES[index];
    if (
      month > boundary.month ||
      (month === boundary.month && day >= boundary.day)
    ) {
      return boundary.sign;
    }
  }

  // Dates before the January boundary belong to the preceding year's Capricorn period.
  return ZODIAC_BOUNDARIES[ZODIAC_BOUNDARIES.length - 1].sign;
}
