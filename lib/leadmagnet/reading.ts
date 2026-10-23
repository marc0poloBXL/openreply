/**
 * Stoic reading generation — shared by the public /api/birthday-reading
 * endpoint and the DM lead-magnet flow so the two templates never drift.
 */

export const STOIC_PHILOSOPHERS: Record<
  string,
  { name: string; title: string }
> = {
  Aries: { name: "Epictetus", title: "The Disciplined Warrior" },
  Taurus: { name: "Zeno", title: "The Steadfast Founder" },
  Gemini: { name: "Seneca", title: "The Reflective Scholar" },
  Cancer: { name: "Musonius Rufus", title: "The Nurturing Sage" },
  Leo: { name: "Marcus Aurelius", title: "The Philosopher King" },
  Virgo: { name: "Epictetus", title: "The Mindful Worker" },
  Libra: { name: "Seneca", title: "The Balanced Stoic" },
  Scorpio: { name: "Musonius Rufus", title: "The Resilient Teacher" },
  Sagittarius: { name: "Zeno", title: "The Visionary Guide" },
  Capricorn: { name: "Marcus Aurelius", title: "The Disciplined Emperor" },
  Aquarius: { name: "Seneca", title: "The Free Thinker" },
  Pisces: { name: "Zeno", title: "The Compassionate Sage" },
};

export const ELEMENTS: Record<string, string> = {
  Aries: "fire",
  Leo: "fire",
  Sagittarius: "fire",
  Taurus: "earth",
  Virgo: "earth",
  Capricorn: "earth",
  Gemini: "air",
  Libra: "air",
  Aquarius: "air",
  Cancer: "water",
  Scorpio: "water",
  Pisces: "water",
};

/**
 * Generate a Stoic Life Blueprint reading for a zodiac sign.
 * Template-based for v1 — in production this would call an LLM with the
 * birthday framework's prompt, but the shape (archetype, strengths, edges,
 * practice, journal question, next-page preview) stays identical.
 */
export function generateReading(sign: string): string {
  const philosopher = STOIC_PHILOSOPHERS[sign] ?? {
    name: "Marcus Aurelius",
    title: "The Reflective Stoic",
  };
  const element = ELEMENTS[sign] ?? "earth";

  const elementDesc: Record<string, string> = {
    fire: "impulsive, passionate, and quick to act",
    earth: "grounded, patient, and deliberate",
    air: "intellectual, curious, and analytical",
    water: "intuitive, emotional, and adaptable",
  };

  const strengths: Record<string, string[]> = {
    fire: [
      "Courage to act when others hesitate",
      "Natural leadership that inspires",
      "Resilience under pressure",
    ],
    earth: [
      "Unshakable discipline in daily habits",
      "Practical wisdom you can apply",
      "Patience for long-term goals",
    ],
    air: [
      "Clarity of thought in complex situations",
      "Ability to see multiple perspectives",
      "Gift for communicating truth",
    ],
    water: [
      "Deep emotional intelligence",
      "Adaptability without losing your center",
      "Empathy that builds trust",
    ],
  };

  const growthEdges: Record<string, string[]> = {
    fire: [
      "Impatience with slower processes — rushing past necessary steps",
      "A tendency to react before reflecting",
    ],
    earth: [
      "Resistance to change even when flexibility serves you",
      "Over-attachment to routine and comfort",
    ],
    air: [
      "Overthinking what can only be felt or acted on",
      "Detachment from your own emotions and body",
    ],
    water: [
      "Absorbing others' moods as your own",
      "Avoiding confrontation at the cost of truth",
    ],
  };

  const desc = elementDesc[element] || "unique in your approach";
  const sigStrengths = strengths[element] || strengths.earth;
  const sigEdges = growthEdges[element] || growthEdges.earth;

  return `**Your Stoic Archetype: ${philosopher.name} — ${philosopher.title}**

Born under **${sign}**, an **${element}** sign, you carry the temperament of one who is ${desc}. Like the Stoics, your character is not your fate — it is your raw material. What you build with it is up to you.

**Your Nature:** ${sign} energy meets Stoic discipline. You are naturally drawn to meaning, not comfort. When you align your actions with your values, you feel alive. When you drift, you feel it in your body.

**Three Strengths to Practice**

1. **${sigStrengths[0]}** — This is your native gift. Exercise it daily, even in small choices.
2. **${sigStrengths[1]}** — Others rely on this in you, whether they say it or not.
3. **${sigStrengths[2]}** — This is what carries you through difficulty. Do not neglect it.

**Two Growth Edges**

1. **${sigEdges[0]}** — The Stoic practice: pause before acting. Ask, "Does this serve wisdom or impulse?"
2. **${sigEdges[1]}** — The Stoic practice: examine the impression before accepting it. Not every feeling is a fact.

**A Seven-Day Practice**

Each morning, ask yourself one question: *"What will I do today that my future self would thank me for?"* Write the answer. At night, ask: *"Did I act on what I value?"* No judgment — just observe.

**A Question for Your Journal**

*Where in my life am I trading what I most want for what I want right now?*

**The Next Page**

This reading used only your zodiac sign. A fuller symbolic chart — using your exact birth date, birth time and birthplace — reveals the timing of your life's key cycles: when to act, when to prepare, and which virtues each season asks of you. That deeper map awaits when you are ready.`;
}