export interface VocabItem {
  word: string;
  definition: string;  // English definition (or legacy Korean meaning for old saved data)
  korean?: string;     // Korean meaning — present for data extracted after v6 edge function
}
