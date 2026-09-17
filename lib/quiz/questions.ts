/**
 * "What's Your Stoic Sign?" — quiz data and scoring logic.
 *
 * 5 questions, each with 4 options mapped to the classical elements.
 * The element tally determines the result, which pairs a zodiac sign
 * with a Stoic philosopher.
 */

export interface QuizOption {
  label: string;
  element: "fire" | "earth" | "air" | "water";
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: QuizOption[];
}

export interface QuizResult {
  zodiacSign: string;
  stoicMatch: string;
  stoicTitle: string;
  element: string;
  description: string;
  quote: string;
}

/** 5 personality questions — element-mapped */
export const QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    question: "When facing a challenge, you tend to…",
    options: [
      { label: "Charge head-on and take action immediately", element: "fire" },
      { label: "Methodically plan your approach step by step", element: "earth" },
      { label: "Analyze the situation from every angle first", element: "air" },
      { label: "Trust your intuition and adapt as you go", element: "water" },
    ],
  },
  {
    id: 2,
    question: "In a group, you're usually the one who…",
    options: [
      { label: "Leads the conversation and makes decisions", element: "fire" },
      { label: "Keeps everyone grounded and on track", element: "earth" },
      { label: "Asks questions and plays devil's advocate", element: "air" },
      { label: "Picks up on how everyone is feeling", element: "water" },
    ],
  },
  {
    id: 3,
    question: "Your ideal Saturday looks like…",
    options: [
      { label: "Trying something new and adventurous", element: "fire" },
      { label: "A quiet day with good food and comfort", element: "earth" },
      { label: "Exploring a new idea, museum, or bookshop", element: "air" },
      { label: "Deep conversations with close friends", element: "water" },
    ],
  },
  {
    id: 4,
    question: "People describe you as…",
    options: [
      { label: "Bold, confident, and inspiring", element: "fire" },
      { label: "Reliable, practical, and patient", element: "earth" },
      { label: "Curious, clever, and communicative", element: "air" },
      { label: "Empathetic, intuitive, and creative", element: "water" },
    ],
  },
  {
    id: 5,
    question: "Your biggest strength is…",
    options: [
      { label: "Courage — you act despite fear", element: "fire" },
      { label: "Discipline — you show up every day", element: "earth" },
      { label: "Wisdom — you see all sides clearly", element: "air" },
      { label: "Compassion — you feel deeply for others", element: "water" },
    ],
  },
];

/** Result data for each element */
const RESULTS: Record<string, QuizResult> = {
  fire: {
    zodiacSign: "Aries",
    stoicMatch: "Marcus Aurelius",
    stoicTitle: "The Warrior-Philosopher",
    element: "fire",
    description:
      "You lead with courage and action. Like Marcus Aurelius, you face challenges head-on — not because you're fearless, but because you understand that a meaningful life requires showing up. Your Stoic path is about channeling your natural fire into disciplined purpose.",
    quote:
      "“You have power over your mind — not outside events. Realize this, and you will find strength.” — Marcus Aurelius",
  },
  earth: {
    zodiacSign: "Taurus",
    stoicMatch: "Seneca",
    stoicTitle: "The Stoic Pleasure-Seeker",
    element: "earth",
    description:
      "You value stability, comfort, and the good things in life. Seneca taught that pleasure isn't the enemy — attachment is. Your Stoic path is about enjoying life's gifts without being ruled by them. Grounded and steady, you build a life that lasts.",
    quote:
      "“It is not the man who has too little, but the man who craves more, that is poor.” — Seneca",
  },
  air: {
    zodiacSign: "Gemini",
    stoicMatch: "Epictetus",
    stoicTitle: "The Master of Perception",
    element: "air",
    description:
      "Your mind moves fast, questioning everything. Epictetus, the former slave turned philosopher, knew that freedom isn't external — it's how we see the world. Your Stoic path is about mastering perception: choosing what to let in and what to release.",
    quote:
      "“It's not what happens to you, but how you react to it that matters.” — Epictetus",
  },
  water: {
    zodiacSign: "Cancer",
    stoicMatch: "Musonius Rufus",
    stoicTitle: "The Nurturing Stoic",
    element: "water",
    description:
      "You feel deeply and care genuinely. Musonius Rufus, the most compassionate of the Stoics, believed that philosophy must be lived through kindness and action. Your Stoic path is about turning your deep empathy into strength — not weakness.",
    quote:
      "“We should not flee from helping others — for the human being is by nature a social creature.” — Musonius Rufus",
  },
};

/** Map element to the broader Stoic sign info for the email */
export const ELEMENT_SIGNS: Record<string, { signs: string; philosopher: string }> = {
  fire:    { signs: "Aries, Leo, Sagittarius", philosopher: "Marcus Aurelius" },
  earth:   { signs: "Taurus, Virgo, Capricorn", philosopher: "Seneca" },
  air:     { signs: "Gemini, Libra, Aquarius", philosopher: "Epictetus" },
  water:   { signs: "Cancer, Scorpio, Pisces", philosopher: "Musonius Rufus" },
};

/**
 * Grade quiz answers, return the matched result.
 * @param answers - Array of 5 element strings, e.g ["fire", "earth", ...]
 */
export function gradeQuiz(answers: string[]): QuizResult {
  const tally: Record<string, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  for (const ans of answers) {
    if (tally[ans] !== undefined) tally[ans]++;
  }

  // Pick the element with the most votes (ties break to first reached)
  const topElement = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  return RESULTS[topElement] || RESULTS.fire;
}