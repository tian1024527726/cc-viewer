/**
 * PTY Chunk Builder — pure functions for building keystroke sequences.
 * Separates "what to send" from "how to send".
 *
 * Claude Code AskUserQuestion prompt model:
 * - Single question: options list, Enter selects and submits
 * - Multi question: tabbed form [Q1] [Q2] ... [Submit]
 *   - Single select: ↓↓...Enter (selects and auto-advances to next tab)
 *   - Multi select: ↓Space↓Space...→ (toggles then → to next tab)
 *   - Last tab → to Submit, Enter to confirm
 */

const ARROW_DOWN = '\x1b[B';
const ARROW_UP = '\x1b[A';
const ARROW_RIGHT = '\x1b[C';
const SPACE = ' ';
const ENTER = '\r';

/**
 * Build navigation arrows from currentIdx to targetIdx.
 */
function buildArrows(currentIdx, targetIdx) {
  const chunks = [];
  const diff = targetIdx - currentIdx;
  const arrow = diff > 0 ? ARROW_DOWN : ARROW_UP;
  for (let i = 0; i < Math.abs(diff); i++) {
    chunks.push(arrow);
  }
  return chunks;
}

/**
 * Get current cursor position from prompt.
 */
function getCursorIdx(prompt) {
  if (prompt && prompt.options) {
    const idx = prompt.options.findIndex(o => o.selected);
    return idx >= 0 ? idx : 0;
  }
  return 0;
}

/**
 * Build chunks for a single-select answer.
 * Navigate to target option, then Enter.
 * @param {object} answer - { optionIndex, isLast }
 * @param {object} prompt - ptyPrompt with options
 * @param {boolean} isMultiQuestion - whether this is part of a multi-question form
 */
export function buildSingleSelectChunks(answer, prompt, isMultiQuestion = false) {
  const chunks = [];
  let currentIdx = getCursorIdx(prompt);

  // For multi-question, map optionIndex to prompt option by number
  let targetIdx = answer.optionIndex;
  if (prompt && prompt.options) {
    const targetNumber = answer.optionIndex + 1;
    const found = prompt.options.findIndex(o => o.number === targetNumber);
    if (found >= 0) targetIdx = found;
  }

  chunks.push(...buildArrows(currentIdx, targetIdx));
  chunks.push(ENTER); // Select and confirm (auto-advances in multi-question)

  // Multi-question last question: Enter above advances to Review page,
  // need another Enter to confirm "Submit answers"
  if (isMultiQuestion && answer.isLast) {
    chunks.push(ENTER);
  }
  return chunks;
}

/**
 * Build chunks for a multi-select answer.
 * Navigate + Space for each selection, then → to advance tab.
 * @param {object} answer - { selectedIndices, isLast }
 * @param {object} prompt - ptyPrompt with options
 * @param {boolean} isMultiQuestion - whether this is part of a multi-question form
 */
export function buildMultiSelectChunks(answer, prompt, isMultiQuestion = false) {
  const chunks = [];
  const indices = (answer.selectedIndices || []).slice().sort((a, b) => a - b);
  let currentIdx = getCursorIdx(prompt);

  for (const targetIdx of indices) {
    chunks.push(...buildArrows(currentIdx, targetIdx));
    chunks.push(SPACE); // Toggle
    currentIdx = targetIdx;
  }

  // → to advance to next tab (or Submit tab if last)
  chunks.push(ARROW_RIGHT);

  // Last question in multi-question, or single question: Enter on Submit tab
  if (answer.isLast || !isMultiQuestion) {
    chunks.push(ENTER);
  }

  return chunks;
}

/**
 * Build chunks for an "Other" (free text) answer.
 * Navigate to Other option, Enter to activate, type text, Enter to confirm.
 * @param {object} answer - { optionIndex, text }
 * @param {object} prompt - ptyPrompt with options
 */
export function buildOtherChunks(answer, prompt) {
  const chunks = [];
  let currentIdx = getCursorIdx(prompt);
  const targetIdx = answer.optionIndex;

  chunks.push(...buildArrows(currentIdx, targetIdx));
  chunks.push(ENTER); // Activate text input

  // Type text character by character
  const text = answer.text || '';
  for (const ch of text) {
    chunks.push(ch);
  }
  chunks.push(ENTER); // Confirm text
  return chunks;
}

/**
 * Build chunks for a single answer (dispatches by type).
 * @param {object} answer - { type, optionIndex, selectedIndices, text, isLast }
 * @param {object} prompt - ptyPrompt with options
 * @param {boolean} isMultiQuestion - whether part of multi-question form
 */
export function buildChunksForAnswer(answer, prompt, isMultiQuestion = false) {
  if (answer.type === 'multi') {
    return buildMultiSelectChunks(answer, prompt, isMultiQuestion);
  }
  if (answer.type === 'other') {
    return buildOtherChunks(answer, prompt);
  }
  return buildSingleSelectChunks(answer, prompt, isMultiQuestion);
}
