export function parseSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Split on a real sentence boundary: end punctuation (optionally wrapped by a
  // closing quote — «She left.» / «"Go away!"») followed by a space and the next
  // sentence's opener (capital, opening/curly quote, or digit). Negative
  // look-behinds skip title abbreviations (Mr./Mrs./Dr.…) and single-letter
  // initials so they don't fragment a sentence.
  const sentences = trimmed
    .split(/(?<=[.!?…]['"”’]?)(?<!\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Rev|Gen|Col|Sgt|Lt|Capt|vs|etc|Inc|Ltd)\.)(?<!\b[A-Z]\.)\s+(?=[A-Z"“‘'0-9])/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return sentences.length > 0 ? sentences : [trimmed];
}

// Common English words to exclude from vocabulary extraction
const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','on','at','for','with','by','from','as','into','through',
  'during','before','after','above','below','between','out','off','over','under',
  'and','but','or','so','yet','nor','not','also','if','then','than','that',
  'this','these','those','it','its','he','she','they','we','you','i','me',
  'him','her','them','us','my','your','his','our','their','who','which','what',
  'when','where','how','all','each','every','both','few','more','most','other',
  'some','such','no','only','same','too','very','just','because','while','although',
  'though','even','one','two','three','many','much','get','got','go','come','take',
  'make','see','know','think','look','want','give','use','find','tell','ask','seem',
  'feel','try','leave','put','mean','keep','let','begin','show','hear','play','run',
  'move','live','believe','hold','bring','happen','write','provide','sit','stand',
  'lose','pay','meet','include','continue','set','learn','change','lead','understand',
  'watch','follow','stop','create','speak','read','spend','grow','open','walk','win',
  'offer','remember','love','consider','appear','buy','wait','serve','die','send',
  'expect','build','stay','fall','cut','reach','kill','remain','suggest','raise',
  'pass','sell','require','report','decide','pull',
]);

export interface VocabWord {
  word: string;
  count: number;
}

export function extractVocabulary(text: string): VocabWord[] {
  const wordMap = new Map<string, number>();

  const words = text
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4);

  for (const word of words) {
    const clean = word.replace(/^['-]+|['-]+$/g, '');
    if (clean.length >= 4 && !STOPWORDS.has(clean)) {
      wordMap.set(clean, (wordMap.get(clean) ?? 0) + 1);
    }
  }

  return Array.from(wordMap.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 20);
}
