import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { escapeHtml } from './helpers';
import { setupMermaidAutoRender } from '../hooks/useMermaidRender';

setupMermaidAutoRender();

export function renderMarkdown(text) {
  if (!text) return '';
  try {
    return DOMPurify.sanitize(marked.parse(text, { breaks: true }));
  } catch (e) {
    return escapeHtml(text);
  }
}
