import { describe, expect, it } from "vitest";
import { getZodiacSign } from "../lib/zodiac";

const boundaries = [
  { month: 1, day: 20, previous: "Capricorn", current: "Aquarius" },
  { month: 2, day: 19, previous: "Aquarius", current: "Pisces" },
  { month: 3, day: 21, previous: "Pisces", current: "Aries" },
  { month: 4, day: 20, previous: "Aries", current: "Taurus" },
  { month: 5, day: 21, previous: "Taurus", current: "Gemini" },
  { month: 6, day: 21, previous: "Gemini", current: "Cancer" },
  { month: 7, day: 23, previous: "Cancer", current: "Leo" },
  { month: 8, day: 23, previous: "Leo", current: "Virgo" },
  { month: 9, day: 23, previous: "Virgo", current: "Libra" },
  { month: 10, day: 23, previous: "Libra", current: "Scorpio" },
  { month: 11, day: 22, previous: "Scorpio", current: "Sagittarius" },
  { month: 12, day: 22, previous: "Sagittarius", current: "Capricorn" },
];

function dateParts(month: number, day: number, offset: number) {
  const date = new Date(Date.UTC(2024, month - 1, day + offset));
  return [date.getUTCMonth() + 1, date.getUTCDate()] as const;
}

describe("getZodiacSign", () => {
  it.each(boundaries)(
    "maps correctly around the $month/$day transition",
    ({ month, day, previous, current }) => {
      const [beforeMonth, beforeDay] = dateParts(month, day, -1);
      const [afterMonth, afterDay] = dateParts(month, day, 1);

      expect(getZodiacSign(beforeMonth, beforeDay)).toBe(previous);
      expect(getZodiacSign(month, day)).toBe(current);
      expect(getZodiacSign(afterMonth, afterDay)).toBe(current);
    }
  );

  it("handles the year wrap and February's leap day", () => {
    expect(getZodiacSign(1, 1)).toBe("Capricorn");
    expect(getZodiacSign(1, 19)).toBe("Capricorn");
    expect(getZodiacSign(12, 21)).toBe("Sagittarius");
    expect(getZodiacSign(12, 31)).toBe("Capricorn");
    expect(getZodiacSign(2, 28)).toBe("Pisces");
    expect(getZodiacSign(2, 29)).toBe("Pisces");
    expect(getZodiacSign(3, 1)).toBe("Pisces");
  });

  it("rejects month/day values that are not calendar dates", () => {
    expect(getZodiacSign(0, 10)).toBeNull();
    expect(getZodiacSign(13, 10)).toBeNull();
    expect(getZodiacSign(2, 30)).toBeNull();
    expect(getZodiacSign(4, 31)).toBeNull();
    expect(getZodiacSign(1, 0)).toBeNull();
    expect(getZodiacSign(1.5, 10)).toBeNull();
  });
});
